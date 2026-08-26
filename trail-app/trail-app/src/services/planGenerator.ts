/**
 * planGenerator.ts
 * -----------------
 * Construit un plan d'entraînement (training_weeks + workouts) à partir :
 *  - du profil du coureur (profiles)
 *  - de son objectif de course (race_goals)
 *
 * C'est un générateur basé sur des règles (heuristiques d'entraînement trail
 * classiques : périodisation en 4 phases, montée progressive du volume et du
 * dénivelé, rotation des types de séances). Ce n'est pas du machine learning,
 * et ce n'est pas non plus un avis médical — c'est un point de départ solide
 * que l'algorithme d'adaptation (adaptationEngine.ts) ajuste ensuite avec le
 * temps, séance après séance.
 */

export type Phase = "base" | "development" | "specific" | "taper";

export interface ProfileInput {
  runs_per_week: number;
  home_strength_sessions_per_week: number;
  current_longest_run_km: number;
  injury_flags: string[];
}

export interface RaceGoalInput {
  id: string;
  race_date: string; // ISO date
  distance_km: number;
  elevation_gain_m: number;
  terrain_technicality: number; // 1-5
}

export interface GeneratedWeek {
  week_number: number;
  phase: Phase;
  target_duration_min: number;
  target_distance_km: number;
  target_elevation_gain_m: number;
  recovery_week: boolean;
  workouts: GeneratedWorkout[];
}

export interface GeneratedWorkout {
  type:
    | "easy"
    | "interval"
    | "hills"
    | "tempo"
    | "technical"
    | "strength"
    | "long"
    | "rest";
  title: string;
  target_duration_min: number | null;
  target_distance_km: number | null;
  target_elevation_gain_m: number | null;
  target_rpe: number | null;
  instructions_json: Record<string, unknown>;
  scheduled_date: string; // ISO date
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mondayOnOrBefore(d: Date): Date {
  const day = d.getDay(); // 0 = dimanche
  const diff = (day + 6) % 7; // jours depuis lundi
  return addDays(d, -diff);
}

function phaseForWeekIndex(weekNum: number, totalWeeks: number): Phase {
  const taperWeeks = Math.min(3, Math.max(2, Math.round(totalWeeks * 0.07)));
  const remaining = totalWeeks - taperWeeks;
  const specificWeeks = Math.round(remaining * 0.32);
  const devWeeks = Math.round(remaining * 0.38);
  const baseWeeks = remaining - specificWeeks - devWeeks;

  if (weekNum <= baseWeeks) return "base";
  if (weekNum <= baseWeeks + devWeeks) return "development";
  if (weekNum <= baseWeeks + devWeeks + specificWeeks) return "specific";
  return "taper";
}

function isRecoveryWeek(weekNum: number, phase: Phase): boolean {
  return phase !== "taper" && weekNum % 4 === 0;
}

/**
 * Distance de la sortie longue, en km, pour une semaine donnée.
 * Part du niveau actuel du coureur, monte progressivement vers une distance
 * de pic cohérente avec l'objectif (distance de course + marge de sécurité),
 * puis redescend en taper.
 */
function longRunKm(
  weekNum: number,
  totalWeeks: number,
  phase: Phase,
  startKm: number,
  raceKm: number
): number {
  const peakKm = Math.max(startKm + 4, raceKm * 1.4); // marge au-dessus de la distance de course
  const taperWeeks = Math.min(3, Math.max(2, Math.round(totalWeeks * 0.07)));
  const peakWeek = totalWeeks - taperWeeks - 1;

  let km: number;
  if (weekNum >= peakWeek) {
    // taper : redescend vers ~60% du pic, puis très léger la dernière semaine
    const weeksIntoTaper = weekNum - peakWeek;
    km = peakWeek === weekNum ? peakKm : peakKm * Math.max(0.35, 1 - weeksIntoTaper * 0.35);
  } else {
    const progress = weekNum / peakWeek;
    km = startKm + (peakKm - startKm) * progress;
  }

  if (isRecoveryWeek(weekNum, phase)) km *= 0.78;
  return Math.round(km * 2) / 2;
}

function shortRunKm(weekNum: number, phase: Phase, startKm: number): number {
  let km = Math.min(startKm * 0.75, 5) + weekNum * 0.12;
  if (phase === "taper") km = Math.max(3, km * 0.6);
  if (isRecoveryWeek(weekNum, phase)) km *= 0.85;
  return Math.round(km * 2) / 2;
}

function qualityWorkout(
  weekNum: number,
  phase: Phase,
  raceGoal: RaceGoalInput,
  scheduledDate: string
): GeneratedWorkout {
  const includeTechnical = phase === "specific" && raceGoal.terrain_technicality >= 3;
  const cycleLen = includeTechnical ? 4 : 3;
  const cycle = weekNum % cycleLen;

  if (phase === "taper") {
    return {
      type: "easy",
      title: "Réveil musculaire",
      target_duration_min: 25,
      target_distance_km: 3,
      target_elevation_gain_m: 0,
      target_rpe: 3,
      instructions_json: {
        description: "Course très facile avec 4-5 accélérations courtes de 20 secondes.",
      },
      scheduled_date: scheduledDate,
    };
  }

  if (cycle === 0) {
    const reps = Math.min(10, 5 + Math.floor(weekNum / 5));
    return {
      type: "interval",
      title: "Fractionné",
      target_duration_min: 45,
      target_distance_km: null,
      target_elevation_gain_m: 0,
      target_rpe: 8,
      instructions_json: {
        warmup_min: 15,
        reps,
        work_min: weekNum <= 10 ? 2 : 3,
        recovery_min: weekNum <= 10 ? 2 : 3,
        cooldown_min: 10,
      },
      scheduled_date: scheduledDate,
    };
  }
  if (cycle === 1) {
    const reps = Math.min(12, 6 + Math.floor(weekNum / 5));
    return {
      type: "hills",
      title: "Séance de côtes",
      target_duration_min: 50,
      target_distance_km: null,
      target_elevation_gain_m: Math.round(reps * 15),
      target_rpe: 8,
      instructions_json: {
        warmup_min: 15,
        reps,
        climb_duration_sec: phase === "specific" ? 75 : 50,
      },
      scheduled_date: scheduledDate,
    };
  }
  if (cycle === 2) {
    const durationMin = Math.min(30, 15 + Math.floor(weekNum / 3) * 2);
    return {
      type: "tempo",
      title: "Tempo / allure objectif",
      target_duration_min: durationMin + 25,
      target_distance_km: null,
      target_elevation_gain_m: 0,
      target_rpe: 7,
      instructions_json: { warmup_min: 15, tempo_min: durationMin, cooldown_min: 10 },
      scheduled_date: scheduledDate,
    };
  }
  // technique (uniquement phase "specific")
  return {
    type: "technical",
    title: "Terrain technique",
    target_duration_min: 45,
    target_distance_km: shortRunKm(weekNum, phase, 8),
    target_elevation_gain_m: Math.round(raceGoal.elevation_gain_m / 10),
    target_rpe: 6,
    instructions_json: { focus: "appuis et descentes techniques" },
    scheduled_date: scheduledDate,
  };
}

export function generatePlan(
  profile: ProfileInput,
  raceGoal: RaceGoalInput,
  startDate: Date = mondayOnOrBefore(addDays(new Date(), 7))
): GeneratedWeek[] {
  const raceDate = new Date(raceGoal.race_date);
  const totalWeeks = Math.max(
    4,
    Math.floor((raceDate.getTime() - startDate.getTime()) / (7 * DAY_MS))
  );
  const startKm = Math.max(3, profile.current_longest_run_km);

  const weeks: GeneratedWeek[] = [];

  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const phase = phaseForWeekIndex(weekNum, totalWeeks);
    const monday = addDays(startDate, (weekNum - 1) * 7);
    const recovery = isRecoveryWeek(weekNum, phase);

    const longKm = longRunKm(weekNum, totalWeeks, phase, startKm, raceGoal.distance_km);
    const shortKm = shortRunKm(weekNum, phase, startKm);

    const workouts: GeneratedWorkout[] = [];

    // Séance qualité (mardi)
    workouts.push(qualityWorkout(weekNum, phase, raceGoal, toISODate(addDays(monday, 1))));

    // Renforcement (jeudi) — sauté si le profil n'en veut pas
    if (profile.home_strength_sessions_per_week > 0) {
      workouts.push({
        type: "strength",
        title: phase === "taper" ? "Mobilité légère" : "Renforcement + proprioception",
        target_duration_min: phase === "taper" ? 15 : 30,
        target_distance_km: null,
        target_elevation_gain_m: null,
        target_rpe: phase === "taper" ? 2 : 5,
        instructions_json: {
          focus: profile.injury_flags.includes("knee")
            ? "renforcement quadriceps/ischios, faible impact"
            : "gainage, squats, équilibre",
        },
        scheduled_date: toISODate(addDays(monday, 3)),
      });
    }

    // Footing endurance (samedi) — seulement si le coureur court 3x/semaine ou plus
    if (profile.runs_per_week >= 3) {
      workouts.push({
        type: "easy",
        title: "Footing endurance",
        target_duration_min: null,
        target_distance_km: shortKm,
        target_elevation_gain_m: 0,
        target_rpe: 4,
        instructions_json: { zone: "endurance fondamentale" },
        scheduled_date: toISODate(addDays(monday, 5)),
      });
    }

    // Sortie longue (dimanche)
    const isSimulation = phase === "specific" && weekNum === totalWeeks - 3;
    workouts.push({
      type: "long",
      title: isSimulation ? "Simulation course" : "Sortie longue",
      target_duration_min: null,
      target_distance_km: longKm,
      target_elevation_gain_m: Math.round(
        (longKm / raceGoal.distance_km) * raceGoal.elevation_gain_m * 0.5
      ),
      target_rpe: isSimulation ? 6 : 5,
      instructions_json: { terrain: "aussi proche que possible du parcours cible" },
      scheduled_date: toISODate(addDays(monday, 6)),
    });

    weeks.push({
      week_number: weekNum,
      phase,
      target_duration_min: workouts.reduce((s, w) => s + (w.target_duration_min ?? 0), 0),
      target_distance_km: Math.round(
        workouts.reduce((s, w) => s + (w.target_distance_km ?? 0), 0) * 2
      ) / 2,
      target_elevation_gain_m: workouts.reduce(
        (s, w) => s + (w.target_elevation_gain_m ?? 0),
        0
      ),
      recovery_week: recovery,
      workouts,
    });
  }

  return weeks;
}
