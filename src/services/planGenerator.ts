/**
 * planGenerator.ts
 * -----------------
 * Construit un plan d'entraînement (training_weeks + workouts) à partir :
 *  - du profil du coureur (profiles), y compris âge et FC repos pour les zones cardio
 *  - de son objectif de course (race_goals)
 */

export type Phase = "base" | "development" | "specific" | "taper";

export interface ProfileInput {
  runs_per_week: number;
  home_strength_sessions_per_week: number;
  current_longest_run_km: number;
  injury_flags: string[];
  age_years?: number | null;
  resting_hr_bpm?: number | null;
}

export interface RaceGoalInput {
  id: string;
  race_date: string;
  distance_km: number;
  elevation_gain_m: number;
  terrain_technicality: number;
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
  type: "easy" | "interval" | "hills" | "tempo" | "technical" | "strength" | "long" | "rest";
  title: string;
  target_duration_min: number | null;
  target_distance_km: number | null;
  target_elevation_gain_m: number | null;
  target_rpe: number | null;
  instructions_json: Record<string, unknown>;
  scheduled_date: string;
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
  const day = d.getDay();
  const diff = (day + 6) % 7;
  return addDays(d, -diff);
}

// ---------- Zones cardio (Karvonen, formule de Tanaka pour la FC max) ----------
interface HrZones {
  z1: [number, number];
  z2: [number, number];
  z3: [number, number];
  z4: [number, number];
  z5: [number, number];
}

function computeHrZones(ageYears: number, restingHr: number): HrZones {
  const hrMax = Math.round(208 - 0.7 * ageYears);
  const hrr = hrMax - restingHr;
  const z = (low: number, high: number): [number, number] => [
    Math.round(restingHr + hrr * low),
    Math.round(restingHr + hrr * high),
  ];
  return {
    z1: z(0.5, 0.6),
    z2: z(0.6, 0.7),
    z3: z(0.7, 0.8),
    z4: z(0.8, 0.9),
    z5: z(0.9, 1.0),
  };
}

function zoneLabel(range: [number, number], name: string): string {
  return `${name} : ${range[0]}-${range[1]} bpm (ne dépasse pas ${range[1]})`;
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

function longRunKm(weekNum: number, totalWeeks: number, phase: Phase, startKm: number, raceKm: number): number {
  const peakKm = Math.max(startKm + 4, raceKm * 1.4);
  const taperWeeks = Math.min(3, Math.max(2, Math.round(totalWeeks * 0.07)));
  const peakWeek = totalWeeks - taperWeeks - 1;

  let km: number;
  if (weekNum >= peakWeek) {
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
  scheduledDate: string,
  hr: HrZones
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
        hr_zone: zoneLabel(hr.z2, "Z1-Z2"),
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
        hr_zone_effort: zoneLabel(hr.z5, "Z4-Z5 (effort)"),
        hr_zone_recovery: zoneLabel(hr.z1, "Z1 (récupération)"),
      },
      scheduled_date: scheduledDate,
    };
  }
  if (cycle === 1) {
    const reps = Math.min(12, 6 + Math.floor(weekNum / 5));
    const climbSec = phase === "specific" ? 75 : 50;
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
        climb_duration_sec: climbSec,
        elevation_per_climb_m: Math.round(15),
        hr_zone_climb: zoneLabel(hr.z4, "Z4 (en montée)"),
        hr_zone_recovery: zoneLabel(hr.z2, "Z1-Z2 (en descente)"),
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
      instructions_json: {
        warmup_min: 15,
        tempo_min: durationMin,
        cooldown_min: 10,
        hr_zone: zoneLabel(hr.z3, "Z3"),
      },
      scheduled_date: scheduledDate,
    };
  }
  return {
    type: "technical",
    title: "Terrain technique",
    target_duration_min: 45,
    target_distance_km: shortRunKm(weekNum, phase, 8),
    target_elevation_gain_m: Math.round(raceGoal.elevation_gain_m / 10),
    target_rpe: 6,
    instructions_json: {
      focus: "appuis et descentes techniques",
      hr_zone: `Z2-Z3 : ${hr.z2[0]}-${hr.z3[1]} bpm, variable selon le terrain — ici la technique compte plus que le chiffre`,
    },
    scheduled_date: scheduledDate,
  };
}

export function generatePlan(
  profile: ProfileInput,
  raceGoal: RaceGoalInput,
  startDate: Date = mondayOnOrBefore(addDays(new Date(), 7))
): GeneratedWeek[] {
  const raceDate = new Date(raceGoal.race_date);
  const totalWeeks = Math.max(4, Math.floor((raceDate.getTime() - startDate.getTime()) / (7 * DAY_MS)));
  const startKm = Math.max(3, profile.current_longest_run_km);
  const hr = computeHrZones(profile.age_years ?? 35, profile.resting_hr_bpm ?? 65);

  const weeks: GeneratedWeek[] = [];

  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const phase = phaseForWeekIndex(weekNum, totalWeeks);
    const monday = addDays(startDate, (weekNum - 1) * 7);
    const recovery = isRecoveryWeek(weekNum, phase);

    const longKm = longRunKm(weekNum, totalWeeks, phase, startKm, raceGoal.distance_km);
    const shortKm = shortRunKm(weekNum, phase, startKm);

    const workouts: GeneratedWorkout[] = [];

    workouts.push(qualityWorkout(weekNum, phase, raceGoal, toISODate(addDays(monday, 1)), hr));

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

    if (profile.runs_per_week >= 3) {
      workouts.push({
        type: "easy",
        title: "Footing endurance",
        target_duration_min: null,
        target_distance_km: shortKm,
        target_elevation_gain_m: 0,
        target_rpe: 4,
        instructions_json: { hr_zone: zoneLabel(hr.z2, "Z2") },
        scheduled_date: toISODate(addDays(monday, 5)),
      });
    }

    const isSimulation = phase === "specific" && weekNum === totalWeeks - 3;
    const longElevation = Math.round((longKm / raceGoal.distance_km) * raceGoal.elevation_gain_m * 0.5);
    workouts.push({
      type: "long",
      title: isSimulation ? "Simulation course" : "Sortie longue",
      target_duration_min: null,
      target_distance_km: longKm,
      target_elevation_gain_m: longElevation,
      target_rpe: isSimulation ? 6 : 5,
      instructions_json: {
        terrain: "aussi proche que possible du parcours cible",
        hr_zone: `Z2 : ${hr.z2[0]}-${hr.z2[1]} bpm, dérive possible en Z3 (jusqu'à ${hr.z3[1]}) dans les montées`,
      },
      scheduled_date: toISODate(addDays(monday, 6)),
    });

    weeks.push({
      week_number: weekNum,
      phase,
      target_duration_min: workouts.reduce((s, w) => s + (w.target_duration_min ?? 0), 0),
      target_distance_km: Math.round(workouts.reduce((s, w) => s + (w.target_distance_km ?? 0), 0) * 2) / 2,
      target_elevation_gain_m: workouts.reduce((s, w) => s + (w.target_elevation_gain_m ?? 0), 0),
      recovery_week: recovery,
      workouts,
    });
  }

  return weeks;
}