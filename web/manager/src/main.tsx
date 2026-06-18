import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Theme is applied by inline script in index.html BEFORE this module loads
// This ensures Playwright's addInitScript can inject localStorage values
// and have them applied immediately, before React renders.

// Listen for system preference changes (only if no stored preference)
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    const storedTheme = localStorage.getItem("reshot-theme");
    if (!storedTheme) {
      document.documentElement.classList.toggle("dark", e.matches);
      document.documentElement.style.colorScheme = e.matches ? "dark" : "light";
    }
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
