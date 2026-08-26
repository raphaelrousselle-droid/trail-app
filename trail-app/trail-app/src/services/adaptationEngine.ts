/**
 * adaptationEngine.ts
 * --------------------
 * Prend en entrée un workout_log fraîchement enregistré et décide s'il faut
 * ajuster les séances à venir. Chaque ajustement est tracé dans le champ
 * `adaptation_reason` (sur workouts et/ou training_weeks) pour que
 * l'utilisateur comprenne toujours *pourquoi* son plan a changé.
 *
 * Règles implémentées (v1, volontairement simples et lisibles) :
 *  1. Douleur au genou marquée (pendant ou le lendemain matin) → on allège
 *     immédiatement la semaine en cours et la suivante, on retire les
 *     séances à impact (côtes, fractionné) au profit de séances faciles,
 *     et on ajoute "knee" aux injury_flags du profil.
 *  2. RPE réel nettement supérieur au RPE cible sur les 3 dernières séances
 *     → réduit le volume des 2 prochaines semaines de ~15%.
 *  3. Fatigue élevée répétée (≥7/10 sur 2 séances consécutives) → transforme
 *     la semaine suivante en semaine de récupération, même si ce n'est pas
 *     son tour dans le cycle normal.
 *
 * Ce moteur est une heuristique de départ, pas un dispositif médical : en
 * cas de douleur qui persiste, l'app doit orienter vers un professionnel de
 * santé plutôt que de continuer à "s'auto-ajuster" indéfiniment.
 */

import { supabaseAdmin } from "../lib/supabase.js";

export interface WorkoutLogInput {
  workout_id: string;
  actual_rpe: number | null;
  knee_pain_during: number | null;
  knee_pain_next_morning: number | null;
  fatigue_next_day: number | null;
}

export interface AdaptationResult {
  actions: string[]; // description lisible de ce qui a été fait, pour les logs/debug
  flaggedInjury: boolean;
  recoveryWeekInserted: boolean;
}

const KNEE_PAIN_THRESHOLD = 4; // sur 10
const FATIGUE_THRESHOLD = 7; // sur 10
const RPE_OVERSHOOT_THRESHOLD = 2; // écart entre RPE réel et RPE cible

export async function processWorkoutLog(
  log: WorkoutLogInput
): Promise<AdaptationResult> {
  const actions: string[] = [];
  let flaggedInjury = false;
  let recoveryWeekInserted = false;

  // Récupère la séance loguée, sa semaine et son plan
  const { data: workout, error: workoutErr } = await supabaseAdmin
    .from("workouts")
    .select("id, training_week_id, target_rpe, scheduled_date")
    .eq("id", log.workout_id)
    .single();

  if (workoutErr || !workout) {
    throw new Error("Séance introuvable pour l'adaptation.");
  }

  const { data: week, error: weekErr } = await supabaseAdmin
    .from("training_weeks")
    .select("id, training_plan_id, week_number")
    .eq("id", workout.training_week_id)
    .single();

  if (weekErr || !week) {
    throw new Error("Semaine d'entraînement introuvable pour l'adaptation.");
  }

  // -------------------------------------------------------
  // Règle 1 : douleur au genou
  // -------------------------------------------------------
  const kneePain = Math.max(log.knee_pain_during ?? 0, log.knee_pain_next_morning ?? 0);
  if (kneePain >= KNEE_PAIN_THRESHOLD) {
    flaggedInjury = true;
    actions.push(
      `Douleur au genou signalée (niveau ${kneePain}/10) : allègement des 2 prochaines semaines.`
    );

    const { data: profileRow } = await supabaseAdmin
      .from("training_plans")
      .select("race_goal_id, race_goals(user_id)")
      .eq("id", week.training_plan_id)
      .single();

    if (profileRow) {
      // @ts-expect-error - relation imbriquée typée en any faute de génération de types Supabase
      const userId = profileRow.race_goals?.user_id;
      if (userId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, injury_flags")
          .eq("user_id", userId)
          .single();
        if (profile && !profile.injury_flags.includes("knee")) {
          await supabaseAdmin
            .from("profiles")
            .update({
              injury_flags: [...profile.injury_flags, "knee"],
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);
        }
      }
    }

    await lightenUpcomingWeeks(week.training_plan_id, week.week_number, 2, {
      reason: "Douleur au genou signalée — volume et séances à impact réduits.",
      removeHighImpact: true,
      distanceMultiplier: 0.6,
    });
  }

  // -------------------------------------------------------
  // Règle 2 : RPE réel > RPE cible de façon répétée
  // -------------------------------------------------------
  if (log.actual_rpe != null && workout.target_rpe != null) {
    const overshoot = log.actual_rpe - workout.target_rpe;
    if (overshoot >= RPE_OVERSHOOT_THRESHOLD) {
      const { data: recentLogs } = await supabaseAdmin
        .from("workout_logs")
        .select("actual_rpe, workouts(target_rpe)")
        .order("logged_at", { ascending: false })
        .limit(3);

      const overshootCount = (recentLogs ?? []).filter((l: any) => {
        const target = l.workouts?.target_rpe;
        return l.actual_rpe != null && target != null && l.actual_rpe - target >= RPE_OVERSHOOT_THRESHOLD;
      }).length;

      if (overshootCount >= 2 && !flaggedInjury) {
        actions.push("RPE au-dessus de la cible sur plusieurs séances : volume réduit de ~15% sur 2 semaines.");
        await lightenUpcomingWeeks(week.training_plan_id, week.week_number, 2, {
          reason: "Ressenti d'effort plus élevé que prévu sur plusieurs séances récentes.",
          removeHighImpact: false,
          distanceMultiplier: 0.85,
        });
      }
    }
  }

  // -------------------------------------------------------
  // Règle 3 : fatigue élevée répétée
  // -------------------------------------------------------
  if ((log.fatigue_next_day ?? 0) >= FATIGUE_THRESHOLD && !flaggedInjury) {
    const { data: recentLogs } = await supabaseAdmin
      .from("workout_logs")
      .select("fatigue_next_day")
      .order("logged_at", { ascending: false })
      .limit(2);

    const bothHigh = (recentLogs ?? []).every((l) => (l.fatigue_next_day ?? 0) >= FATIGUE_THRESHOLD);
    if (bothHigh) {
      recoveryWeekInserted = true;
      actions.push("Fatigue élevée deux séances de suite : semaine suivante transformée en semaine allégée.");
      const { data: nextWeek } = await supabaseAdmin
        .from("training_weeks")
        .select("id")
        .eq("training_plan_id", week.training_plan_id)
        .eq("week_number", week.week_number + 1)
        .maybeSingle();

      if (nextWeek) {
        await supabaseAdmin
          .from("training_weeks")
          .update({
            recovery_week: true,
            adaptation_reason: "Fatigue élevée détectée sur les séances précédentes.",
          })
          .eq("id", nextWeek.id);
      }
    }
  }

  return { actions, flaggedInjury, recoveryWeekInserted };
}

/**
 * Réduit le volume (et retire éventuellement les séances à impact) sur les
 * N prochaines semaines à partir de `fromWeekNumber` (exclue).
 */
async function lightenUpcomingWeeks(
  trainingPlanId: string,
  fromWeekNumber: number,
  countWeeks: number,
  opts: { reason: string; removeHighImpact: boolean; distanceMultiplier: number }
) {
  const { data: weeks } = await supabaseAdmin
    .from("training_weeks")
    .select("id, week_number, target_distance_km, target_elevation_gain_m")
    .eq("training_plan_id", trainingPlanId)
    .gt("week_number", fromWeekNumber)
    .lte("week_number", fromWeekNumber + countWeeks)
    .order("week_number", { ascending: true });

  if (!weeks) return;

  for (const w of weeks) {
    await supabaseAdmin
      .from("training_weeks")
      .update({
        target_distance_km: Math.round(w.target_distance_km * opts.distanceMultiplier * 2) / 2,
        target_elevation_gain_m: Math.round(w.target_elevation_gain_m * opts.distanceMultiplier),
        adaptation_reason: opts.reason,
      })
      .eq("id", w.id);

    if (opts.removeHighImpact) {
      const { data: workouts } = await supabaseAdmin
        .from("workouts")
        .select("id, type")
        .eq("training_week_id", w.id)
        .eq("completion_status", "planned");

      for (const workout of workouts ?? []) {
        if (["hills", "interval", "technical"].includes(workout.type)) {
          await supabaseAdmin
            .from("workouts")
            .update({
              type: "easy",
              title: "Footing facile (adapté)",
              target_rpe: 3,
              adaptation_reason: opts.reason,
            })
            .eq("id", workout.id);
        } else {
          await supabaseAdmin
            .from("workouts")
            .update({
              target_distance_km: null, // recalcul simplifié : on laisse la durée/allure primer cette semaine-là
              adaptation_reason: opts.reason,
            })
            .eq("id", workout.id);
        }
      }
    }
  }
}
