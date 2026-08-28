import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/supabaseClient";

const labelStyle: React.CSSProperties = { display: "block", marginBottom: 10, fontSize: 13 };
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, marginTop: 4 };
const fieldsetStyle: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 14 };

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
      <h2 style={{ fontSize: 18 }}>Créer ton plan</h2>
      <form onSubmit={handleSubmit}>
        <fieldset style={fieldsetStyle}>
          <legend>Ton profil actuel</legend>
          <label style={labelStyle}>
            Courses par semaine
            <input name="runs_per_week" type="number" min="0" max="14" defaultValue={3} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Séances de renforcement par semaine
            <input name="strength_sessions" type="number" min="0" max="7" defaultValue={1} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Distance max actuelle (km)
            <input name="longest_run" type="number" min="0" step="0.5" defaultValue={9} required style={inputStyle} />
          </label>
                    <label style={labelStyle}>
            Ton âge
            <input name="age_years" type="number" min="10" max="99" defaultValue={33} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            FC au repos (bpm)
            <input name="resting_hr_bpm" type="number" min="30" max="120" defaultValue={75} required style={inputStyle} />
          </label>
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend>Ton objectif de course</legend>
          <label style={labelStyle}>
            Nom de la course
            <input name="race_name" type="text" defaultValue="Mon premier trail" required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Date de la course
            <input name="race_date" type="date" defaultValue="2027-03-15" required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Distance (km)
            <input name="distance_km" type="number" min="1" step="0.5" defaultValue={10} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Dénivelé positif (m)
            <input name="elevation_gain_m" type="number" min="0" defaultValue={400} required style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Technicité du terrain (1 = roulant, 5 = très technique)
            <input name="terrain_technicality" type="number" min="1" max="5" defaultValue={3} required style={inputStyle} />
          </label>
        </fieldset>

        <button type="submit" disabled={loading} style={{ padding: 12, fontWeight: 600, width: "100%" }}>
          {loading ? "Création en cours…" : "Créer mon plan"}
        </button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </div>
  );
}