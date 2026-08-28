import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

const STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: "Prévu", cls: "badge" },
  completed: { label: "Fait", cls: "badge badge--success" },
  done: { label: "Fait", cls: "badge badge--success" },
  skipped: { label: "Sauté", cls: "badge badge--warn" },
  missed: { label: "Manqué", cls: "badge badge--warn" },
};

function statusBadge(status: string) {
  const s = STATUS[status] ?? { label: status, cls: "badge" };
  return <span className={s.cls}>{s.label}</span>;
}

function workoutIcon(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("rest") || t.includes("repos")) return "🌿";
  if (t.includes("recov")) return "🚶";
  if (t.includes("strength") || t.includes("renfo") || t.includes("muscu")) return "💪";
  if (t.includes("hill") || t.includes("climb") || t.includes("cote") || t.includes("côte")) return "⛰️";
  if (t.includes("interval") || t.includes("vo2") || t.includes("fractionn") || t.includes("speed")) return "⚡";
  if (t.includes("tempo") || t.includes("threshold") || t.includes("seuil")) return "🔥";
  if (t.includes("long")) return "🥾";
  return "🏃";
}

function InstructionLines({ instructions }: { instructions: Record<string, unknown> }) {
  const entries = Object.entries(instructions).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <ul className="workout__instructions">
      {entries.map(([key, value]) => (
        <li key={key}>
          <strong>{LABELS[key] || key} :</strong> {String(value)}
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

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" aria-hidden="true" />
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state__emoji" aria-hidden="true">🔒</div>
        <h2>Impossible de charger ton plan</h2>
        <p>{error} — es-tu connecté ?</p>
        <Link to="/login" className="btn btn--primary">Se connecter</Link>
      </div>
    );
  }

  if (raceGoals.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__emoji" aria-hidden="true">🏁</div>
        <h2>Aucun objectif de course</h2>
        <p>Crée ton premier plan pour voir apparaître tes séances de la semaine.</p>
        <Link to="/onboarding" className="btn btn--primary">Créer mon premier plan</Link>
      </div>
    );
  }

  if (!week) {
    return (
      <div className="empty-state">
        <div className="empty-state__emoji" aria-hidden="true">⏳</div>
        <h2>Plan pas encore généré</h2>
        <p>Aucune semaine d'entraînement n'est disponible pour cet objectif.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="hero">
        <div className="hero__eyebrow">Semaine {week.week_number}</div>
        <h1 className="hero__title">{week.phase}</h1>
        <div className="hero__tags">
          <span className="hero__tag">{week.workouts.length} séances</span>
          {week.recovery_week && <span className="hero__tag">🌿 Semaine allégée</span>}
        </div>
      </div>

      <div className="stack stack--sm">
        {week.workouts.map((w) => {
          const meta: string[] = [];
          if (w.target_distance_km) meta.push(`${w.target_distance_km} km`);
          if (w.target_duration_min) meta.push(`${w.target_duration_min} min`);
          if (w.target_elevation_gain_m) meta.push(`D+ ${w.target_elevation_gain_m} m`);
          if (w.target_rpe) meta.push(`Effort ${w.target_rpe}/10`);

          return (
            <article key={w.id} className="workout">
              <div className="workout__head">
                <div className="workout__icon" aria-hidden="true">{workoutIcon(w.type)}</div>
                <div className="workout__headmain">
                  <div className="workout__title">{w.title}</div>
                  <div className="workout__date">{w.scheduled_date}</div>
                </div>
                {statusBadge(w.completion_status)}
              </div>

              {meta.length > 0 && (
                <div className="workout__meta">
                  {meta.map((m) => (
                    <span key={m} className="chip">{m}</span>
                  ))}
                </div>
              )}

              <InstructionLines instructions={w.instructions_json} />

              {w.completion_status === "planned" && loggingId !== w.id && (
                <button
                  onClick={() => setLoggingId(w.id)}
                  className="btn btn--ghost btn--sm"
                  style={{ marginTop: 12 }}
                >
                  Logger cette séance
                </button>
              )}

              {loggingId === w.id && (
                <form
                  className="log-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    logWorkout(w.id, new FormData(e.currentTarget));
                  }}
                >
                  <label className="field">
                    <span className="field__label">Distance réelle (km)</span>
                    <input className="input" name="actual_distance_km" type="number" step="0.1" />
                  </label>
                  <label className="field">
                    <span className="field__label">RPE ressenti (1-10)</span>
                    <input className="input" name="actual_rpe" type="number" min="1" max="10" />
                  </label>
                  <label className="field">
                    <span className="field__label">Douleur genou pendant (0-10)</span>
                    <input className="input" name="knee_pain_during" type="number" min="0" max="10" defaultValue={0} />
                  </label>
                  <label className="field">
                    <span className="field__label">Douleur genou le lendemain matin (0-10)</span>
                    <input className="input" name="knee_pain_next_morning" type="number" min="0" max="10" defaultValue={0} />
                  </label>
                  <label className="field">
                    <span className="field__label">Fatigue le lendemain (0-10)</span>
                    <input className="input" name="fatigue_next_day" type="number" min="0" max="10" defaultValue={0} />
                  </label>
                  <label className="field">
                    <span className="field__label">Notes</span>
                    <textarea className="textarea" name="notes" rows={2} />
                  </label>
                  <div className="stack--sm" style={{ display: "flex", gap: 8 }}>
                    <button type="submit" className="btn btn--primary btn--sm">Enregistrer</button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setLoggingId(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
