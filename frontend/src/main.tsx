import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="login" element={<Login />} />
          <Route path="onboarding" element={<Onboarding />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
