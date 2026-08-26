import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const profilesRouter = Router();

// Récupère (ou signale l'absence de) profil de l'utilisateur connecté
profilesRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", req.userId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Crée ou met à jour le profil (upsert simple)
profilesRouter.put("/me", requireAuth, async (req: AuthedRequest, res) => {
  const {
    preferred_run_days,
    runs_per_week,
    home_strength_sessions_per_week,
    current_longest_run_km,
    injury_flags,
  } = req.body;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        user_id: req.userId,
        preferred_run_days: preferred_run_days ?? [],
        runs_per_week: runs_per_week ?? 3,
        home_strength_sessions_per_week: home_strength_sessions_per_week ?? 1,
        current_longest_run_km: current_longest_run_km ?? 0,
        injury_flags: injury_flags ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
