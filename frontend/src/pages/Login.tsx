import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="auth">
        <div className="card auth__card auth__card--center">
          <div className="auth__icon" aria-hidden="true">📬</div>
          <h1 className="page-title">Vérifie ta boîte mail</h1>
          <p className="muted">
            Un lien de connexion a été envoyé à <strong>{email}</strong>. Ouvre-le
            pour continuer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="card auth__card">
        <h1 className="page-title">Connexion</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Entre ton email : on t'envoie un lien magique pour te connecter, sans
          mot de passe.
        </p>
        <form onSubmit={handleSubmit} className="stack">
          <div className="field">
            <label className="field__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              required
              autoFocus
              placeholder="toi@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary btn--block">
            Recevoir un lien de connexion
          </button>
          {error && <p className="alert alert--error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
