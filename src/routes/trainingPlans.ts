import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const trainingPlansRouter = Router();

// Détail d'un plan + ses semaines + ses séances (vérifie que ça appartient bien à l'utilisateur)
trainingPlansRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { data: plan, error: planErr } = await supabaseAdmin
    .from("training_plans")
    .select("*, race_goals!inner(user_id)")
    .eq("id", req.params.id)
    .eq("race_goals.user_id", req.userId)
    .single();
  if (planErr || !plan) return res.status(404).json({ error: "Plan introuvable." });

  const { data: weeks, error: weeksErr } = await supabaseAdmin
    .from("training_weeks")
    .select("*, workouts(*)")
    .eq("training_plan_id", plan.id)
    .order("week_number", { ascending: true });
  if (weeksErr) return res.status(500).json({ error: weeksErr.message });

  res.json({ plan, weeks });
});

// Séances de la semaine courante (utile pour le dashboard)
trainingPlansRouter.get("/:id/current-week", requireAuth, async (req: AuthedRequest, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const { data: weeks, error } = await supabaseAdmin
    .from("training_weeks")
    .select("*, workouts(*)")
    .eq("training_plan_id", req.params.id)
    .order("week_number", { ascending: true });
  if (error || !weeks) return res.status(500).json({ error: error?.message ?? "Erreur." });

  const currentWeek =
    weeks.find((w: any) =>
      w.workouts.some((wo: any) => wo.scheduled_date <= today)
    ) ?? weeks[0];

  res.json(currentWeek ?? null);
});
