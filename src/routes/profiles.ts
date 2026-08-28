import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const profilesRouter = Router();

profilesRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", req.userId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

profilesRouter.put("/me", requireAuth, async (req: AuthedRequest, res) => {
  const {
    preferred_run_days,
    runs_per_week,
    home_strength_sessions_per_week,
    current_longest_run_km,
    injury_flags,
    age_years,
    resting_hr_bpm,
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
        age_years: age_years ?? null,
        resting_hr_bpm: resting_hr_bpm ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});