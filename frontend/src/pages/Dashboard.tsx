import { useEffect, useState } from "react";
import { apiFetch } from "../lib/supabaseClient";

interface Workout {
  id: string;
  type: string;
  title: string;
  target_duration_min: number | null;
  target_distance_km: number | null;
  target_elevation_gain_m: number | null;
  target_rpe: number | null;
  instructions_json: Record<string, unknown>;
  scheduled_date: string;
  completion_status: string;
}

interface WeekData {
  week_number: number;
  phase: string;
  recovery_week: boolean;
  workouts: Workout[];
}

const LABELS: Record<string, string> = {
  warmup_min: "Échauffement (min)",
  reps: "Répétitions",
  work_min: "Effort (min)",
  recovery_min: "Récupération (min)",
  cooldown_min: "Retour au calme (min)",
  climb_duration_sec: "Durée de chaque montée (sec)",
  elevation_per_climb_m: "Dénivelé par montée (m)",
  tempo_min: "Durée à allure tempo (min)",
  hr_zone: "Zone cardio",
  hr_zone_effort: "Zone cardio (effort)",
  hr_zone_recovery: "Zone cardio (récupération)",
  hr_zone_climb: "Zone cardio (montée)",
  focus: "Focus",
  terrain: "Terrain",
  description: "Détail",
};

function InstructionLines({ instructions }: { instructions: Record<string, unknown> }) {
  const entries = Object.entries(instructions).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 13, color: "#444" }}>
      {entries.map(([key, value]) => (
        <li key={key}>
          <strong>{LABELS[key] || key}:</strong> {String(value)}
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const [raceGoals, setRaceGoals] = useState<any[]>([]);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const goals = await apiFetch("/race-goals");
        setRaceGoals(goals);
        if (goals.length > 0) {
          const plan = await apiFetch(`/race-goals/${goals[0].id}/plan`);
          if (plan) {
            const current = await apiFetch(`/training-plans/${plan.id}/current-week`);
            setWeek(current);
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logWorkout(workoutId: string, form: FormData) {
    const payload = {
      workout_id: workoutId,
      actual_rpe: Number(form.get("actual_rpe")) || null,
      actual_distance_km: Number(form.get("actual_distance_km")) || null,
      knee_pain_during: Number(form.get("knee_pain_during")) || 0,
      knee_pain_next_morning: Number(form.get("knee_pain_next_morning")) || 0,
      fatigue_next_day: Number(form.get("fatigue_next_day")) || 0,
      notes: form.get("notes") || "",
    };
    const result = await apiFetch("/workout-logs", { method: "POST", body: JSON.stringify(payload) });
    setLoggingId(null);
    if (result.adaptation?.actions?.length) {
      alert("Plan ajusté :\n" + result.adaptation.actions.join("\n"));
    }
    window.location.reload();
  }

  if (loading) return <p>Chargement…</p>;
  if (error) return <p style={{ color: "crimson" }}>{error} (es-tu connecté ?)</p>;
  if (raceGoals.length === 0) return (
    <div>
      <p>Aucun objectif de course pour l'instant.</p>
      <a href="/onboarding"><button>Créer mon premier plan</button></a>
    </div>
  );
  if (!week) return <p>Pas encore de plan généré pour cet objectif.</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>
        Semaine {week.week_number} · {week.phase}
        {week.recovery_week ? " · 🌿 allégée" : ""}
      </h2>
      {week.workouts.map((w) => (
        <div key={w.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>{w.title}</div>
          <div style={{ fontSize: 13, color: "#666" }}>
            {w.scheduled_date}
            {w.target_distance_km ? ` · ${w.target_distance_km} km` : ""}
            {w.target_duration_min ? ` · ${w.target_duration_min} min` : ""}
            {w.target_elevation_gain_m ? ` · D+ ${w.target_elevation_gain_m} m` : ""}
            {w.target_rpe ? ` · Effort visé ${w.target_rpe}/10` : ""}
            {" · statut : " + w.completion_status}
          </div>

          <InstructionLines instructions={w.instructions_json} />

          {w.completion_status === "planned" && loggingId !== w.id && (
            <button onClick={() => setLoggingId(w.id)} style={{ marginTop: 8 }}>
              Logger cette séance
            </button>
          )}

          {loggingId === w.id && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                logWorkout(w.id, new FormData(e.currentTarget));
              }}
              style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}
            >
              <label>Distance réelle (km) <input name="actual_distance_km" type="number" step="0.1" /></label>
              <label>RPE ressenti (1-10) <input name="actual_rpe" type="number" min="1" max="10" /></label>
              <label>Douleur genou pendant (0-10) <input name="knee_pain_during" type="number" min="0" max="10" defaultValue={0} /></label>
              <label>Douleur genou le lendemain matin (0-10) <input name="knee_pain_next_morning" type="number" min="0" max="10" defaultValue={0} /></label>
              <label>Fatigue le lendemain (0-10) <input name="fatigue_next_day" type="number" min="0" max="10" defaultValue={0} /></label>
              <label>Notes <textarea name="notes" rows={2} /></label>
              <button type="submit">Enregistrer</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}