import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { processWorkoutLog } from "../services/adaptationEngine.js";

export const workoutLogsRouter = Router();

// Enregistrer le résultat réel d'une séance -> déclenche l'adaptation
workoutLogsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const {
    workout_id,
    actual_duration_min,
    actual_distance_km,
    actual_elevation_gain_m,
    actual_rpe,
    knee_pain_during,
    knee_pain_next_morning,
    fatigue_next_day,
    notes,
  } = req.body;

  if (!workout_id) return res.status(400).json({ error: "workout_id est requis." });

  // Vérifie que la séance appartient bien à l'utilisateur connecté avant d'écrire quoi que ce soit
  const { data: ownedWorkout } = await supabaseAdmin
    .from("workouts")
    .select("id, training_weeks!inner(training_plans!inner(race_goals!inner(user_id)))")
    .eq("id", workout_id)
    .single();

  // @ts-expect-error - relation imbriquée typée en any faute de génération de types Supabase
  const ownerId = ownedWorkout?.training_weeks?.training_plans?.race_goals?.user_id;
  if (!ownedWorkout || ownerId !== req.userId) {
    return res.status(404).json({ error: "Séance introuvable." });
  }

  const { data: log, error: logErr } = await supabaseAdmin
    .from("workout_logs")
    .insert({
      workout_id,
      actual_duration_min,
      actual_distance_km,
      actual_elevation_gain_m,
      actual_rpe,
      knee_pain_during: knee_pain_during ?? 0,
      knee_pain_next_morning: knee_pain_next_morning ?? 0,
      fatigue_next_day: fatigue_next_day ?? 0,
      notes,
    })
    .select()
    .single();
  if (logErr || !log) return res.status(500).json({ error: logErr?.message ?? "Erreur d'enregistrement." });

  await supabaseAdmin
    .from("workouts")
    .update({ completion_status: "completed" })
    .eq("id", workout_id);

  let adaptation;
  try {
    adaptation = await processWorkoutLog({
      workout_id,
      actual_rpe: actual_rpe ?? null,
      knee_pain_during: knee_pain_during ?? null,
      knee_pain_next_morning: knee_pain_next_morning ?? null,
      fatigue_next_day: fatigue_next_day ?? null,
    });
  } catch (e) {
    // Le log est déjà sauvegardé : on ne fait pas échouer la requête si l'adaptation plante,
    // mais on le signale clairement pour le debug.
    console.error("Erreur pendant l'adaptation du plan :", e);
    adaptation = { actions: [], flaggedInjury: false, recoveryWeekInserted: false };
  }

  res.status(201).json({ log, adaptation });
});

// Marquer une séance comme ratée (sans log complet)
workoutLogsRouter.post("/skip/:workoutId", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from("workouts")
    .update({ completion_status: "skipped" })
    .eq("id", req.params.workoutId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
