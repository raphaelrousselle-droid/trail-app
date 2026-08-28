import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { generatePlan } from "../services/planGenerator.js";

export const raceGoalsRouter = Router();

// Créer un objectif de course
raceGoalsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name, race_date, distance_km, elevation_gain_m, elevation_loss_m, terrain_technicality, course_profile_json } = req.body;

  if (!name || !race_date || !distance_km) {
    return res.status(400).json({ error: "name, race_date et distance_km sont requis." });
  }

  const { data, error } = await supabaseAdmin
    .from("race_goals")
    .insert({
      user_id: req.userId,
      name,
      race_date,
      distance_km,
      elevation_gain_m: elevation_gain_m ?? 0,
      elevation_loss_m: elevation_loss_m ?? 0,
      terrain_technicality: terrain_technicality ?? 3,
      course_profile_json: course_profile_json ?? {},
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Lister les objectifs de l'utilisateur connecté
raceGoalsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from("race_goals")
    .select("*")
    .eq("user_id", req.userId)
    .order("race_date", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Générer (ou régénérer) un plan pour un objectif donné
raceGoalsRouter.post("/:id/generate-plan", requireAuth, async (req: AuthedRequest, res) => {
  const raceGoalId = req.params.id;

  const { data: raceGoal, error: goalErr } = await supabaseAdmin
    .from("race_goals")
    .select("*")
    .eq("id", raceGoalId)
    .eq("user_id", req.userId)
    .single();
  if (goalErr || !raceGoal) return res.status(404).json({ error: "Objectif de course introuvable." });

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", req.userId)
    .single();
  if (profileErr || !profile) {
    return res.status(400).json({ error: "Profil manquant : complète ton profil avant de générer un plan." });
  }

   const weeks = generatePlan(
    {
      runs_per_week: profile.runs_per_week,
      home_strength_sessions_per_week: profile.home_strength_sessions_per_week,
      current_longest_run_km: profile.current_longest_run_km,
      injury_flags: profile.injury_flags,
      age_years: profile.age_years,
      resting_hr_bpm: profile.resting_hr_bpm,
    },
    {
      id: raceGoal.id,
      race_date: raceGoal.race_date,
      distance_km: raceGoal.distance_km,
      elevation_gain_m: raceGoal.elevation_gain_m,
      terrain_technicality: raceGoal.terrain_technicality,
    }
  );

  const startDate = weeks.length ? weeks[0].workouts[0].scheduled_date : null;
  const endDate = weeks.length
    ? weeks[weeks.length - 1].workouts[weeks[weeks.length - 1].workouts.length - 1].scheduled_date
    : null;

  const { data: plan, error: planErr } = await supabaseAdmin
    .from("training_plans")
    .insert({
      race_goal_id: raceGoal.id,
      algorithm_version: "v1",
      start_date: startDate,
      end_date: endDate,
      current_status: "active",
      generation_inputs_json: { profile, raceGoal },
    })
    .select()
    .single();
  if (planErr || !plan) return res.status(500).json({ error: planErr?.message ?? "Erreur de création du plan." });

  for (const week of weeks) {
    const { data: weekRow, error: weekErr } = await supabaseAdmin
      .from("training_weeks")
      .insert({
        training_plan_id: plan.id,
        week_number: week.week_number,
        phase: week.phase,
        target_duration_min: week.target_duration_min,
        target_distance_km: week.target_distance_km,
        target_elevation_gain_m: week.target_elevation_gain_m,
        recovery_week: week.recovery_week,
      })
      .select()
      .single();
    if (weekErr || !weekRow) continue;

    const workoutRows = week.workouts.map((w) => ({
      training_week_id: weekRow.id,
      type: w.type,
      title: w.title,
      target_duration_min: w.target_duration_min,
      target_distance_km: w.target_distance_km,
      target_elevation_gain_m: w.target_elevation_gain_m,
      target_rpe: w.target_rpe,
      instructions_json: w.instructions_json,
      scheduled_date: w.scheduled_date,
    }));
    await supabaseAdmin.from("workouts").insert(workoutRows);
  }

  res.status(201).json({ plan_id: plan.id, weeks_created: weeks.length });
});

// Récupère le plan le plus récent pour un objectif donné
raceGoalsRouter.get("/:id/plan", requireAuth, async (req: AuthedRequest, res) => {
  const { data: raceGoal } = await supabaseAdmin
    .from("race_goals")
    .select("id")
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .single();
  if (!raceGoal) return res.status(404).json({ error: "Objectif de course introuvable." });

  const { data: plan, error } = await supabaseAdmin
    .from("training_plans")
    .select("*")
    .eq("race_goal_id", raceGoal.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  res.json(plan);
});
