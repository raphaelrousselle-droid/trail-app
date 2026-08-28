import { Outlet } from "react-router-dom";

export default function App() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>🏔️ Trail App</h1>
      <Outlet />
    </div>
  );
}
