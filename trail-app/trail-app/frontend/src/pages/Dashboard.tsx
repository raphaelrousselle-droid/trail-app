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
  scheduled_date: string;
  completion_status: string;
}

interface WeekData {
  week_number: number;
  phase: string;
  recovery_week: boolean;
  workouts: Workout[];
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
    // recharge la semaine pour refléter d'éventuels ajustements
    window.location.reload();
  }

  if (loading) return <p>Chargement…</p>;
  if (error) return <p style={{ color: "crimson" }}>{error} (es-tu connecté ?)</p>;
  if (raceGoals.length === 0) return <p>Aucun objectif de course pour l'instant. Crée-en un via l'API pour commencer.</p>;
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
            {w.scheduled_date} · {w.target_distance_km ? `${w.target_distance_km} km · ` : ""}
            {w.target_duration_min ? `${w.target_duration_min} min · ` : ""}
            statut : {w.completion_status}
          </div>

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
