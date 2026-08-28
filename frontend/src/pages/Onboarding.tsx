import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/supabaseClient";

export default function Onboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch("/profiles/me", {
        method: "PUT",
        body: JSON.stringify({
          runs_per_week: Number(form.get("runs_per_week")),
          age_years: Number(form.get("age_years")),
          resting_hr_bpm: Number(form.get("resting_hr_bpm")),
          home_strength_sessions_per_week: Number(form.get("strength_sessions")),
          current_longest_run_km: Number(form.get("longest_run")),
          injury_flags: [],
        }),
      });

      const raceGoal = await apiFetch("/race-goals", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("race_name"),
          race_date: form.get("race_date"),
          distance_km: Number(form.get("distance_km")),
          elevation_gain_m: Number(form.get("elevation_gain_m")),
          terrain_technicality: Number(form.get("terrain_technicality")),
        }),
      });

      await apiFetch(`/race-goals/${raceGoal.id}/generate-plan`, { method: "POST" });

      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Créer ton plan</h1>
      <p className="page-lead">
        Deux minutes pour décrire où tu en es et ce que tu vises. On génère
        ensuite ta première semaine d'entraînement.
      </p>

      <form onSubmit={handleSubmit} className="stack stack--lg">
        <section className="card">
          <h2 className="card__title">Ton profil actuel</h2>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Courses par semaine</span>
              <input className="input" name="runs_per_week" type="number" min="0" max="14" defaultValue={3} required />
            </label>
            <label className="field">
              <span className="field__label">Renfo par semaine</span>
              <input className="input" name="strength_sessions" type="number" min="0" max="7" defaultValue={1} required />
            </label>
            <label className="field">
              <span className="field__label">Distance max actuelle (km)</span>
              <input className="input" name="longest_run" type="number" min="0" step="0.5" defaultValue={9} required />
            </label>
            <label className="field">
              <span className="field__label">Ton âge</span>
              <input className="input" name="age_years" type="number" min="10" max="99" defaultValue={33} required />
            </label>
            <label className="field">
              <span className="field__label">FC au repos (bpm)</span>
              <input className="input" name="resting_hr_bpm" type="number" min="30" max="120" defaultValue={75} required />
            </label>
          </div>
        </section>

        <section className="card">
          <h2 className="card__title">Ton objectif de course</h2>
          <div className="form-grid">
            <label className="field field--wide">
              <span className="field__label">Nom de la course</span>
              <input className="input" name="race_name" type="text" defaultValue="Mon premier trail" required />
            </label>
            <label className="field">
              <span className="field__label">Date de la course</span>
              <input className="input" name="race_date" type="date" defaultValue="2027-03-15" required />
            </label>
            <label className="field">
              <span className="field__label">Distance (km)</span>
              <input className="input" name="distance_km" type="number" min="1" step="0.5" defaultValue={10} required />
            </label>
            <label className="field">
              <span className="field__label">Dénivelé positif (m)</span>
              <input className="input" name="elevation_gain_m" type="number" min="0" defaultValue={400} required />
            </label>
            <label className="field">
              <span className="field__label">Technicité du terrain</span>
              <input className="input" name="terrain_technicality" type="number" min="1" max="5" defaultValue={3} required />
              <span className="field__hint">1 = roulant · 5 = très technique</span>
            </label>
          </div>
        </section>

        <div className="stack stack--sm">
          <button type="submit" disabled={loading} className="btn btn--primary btn--block">
            {loading ? "Création en cours…" : "Créer mon plan"}
          </button>
          {error && <p className="alert alert--error">{error}</p>}
        </div>
      </form>
    </div>
  );
}
