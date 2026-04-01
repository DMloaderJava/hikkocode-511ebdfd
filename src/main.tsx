import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize theme from localStorage
if (localStorage.getItem("theme") === "dark") {
  document.documentElement.classList.add("dark");
}

// Check if Supabase env vars are available (they may be missing in published builds)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
if (!supabaseUrl) {
  console.warn("VITE_SUPABASE_URL is not set. The app may not function correctly.");
}

// Error boundary for uncaught errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
        }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: "linear-gradient(135deg, #9b87f5, #7E69AB)",
              margin: "0 auto 1.5rem",
            }} />
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              hikkocode
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#a1a1aa", marginBottom: "1rem" }}>
              The app failed to load. This usually means the backend configuration is missing.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "0.5rem 1.5rem",
                borderRadius: 8,
                background: "#fff",
                color: "#0a0a0a",
                border: "none",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import React from "react";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
