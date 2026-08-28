import { NavLink, Outlet } from "react-router-dom";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  "app-nav__link" + (isActive ? " is-active" : "");

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">🏔️</span>
            <span className="brand__name">Trail App</span>
          </NavLink>
          <nav className="app-nav">
            <NavLink to="/" end className={navLinkClass}>
              Tableau de bord
            </NavLink>
            <NavLink to="/onboarding" className={navLinkClass}>
              Nouveau plan
            </NavLink>
            <NavLink to="/login" className={navLinkClass}>
              Connexion
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        Trail App · ton plan d'entraînement trail adaptatif
      </footer>
    </div>
  );
}
