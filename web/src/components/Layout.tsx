import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { useAuth } from "../auth.js";
import { Btn } from "./ui.js";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div style={{ fontFamily: C.sans, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: `1px solid ${C.line}`,
          background: C.card,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <Link to="/clients" style={{ textDecoration: "none", color: C.primary, fontWeight: 700, fontSize: 18 }}>
            The Wire
          </Link>
          <nav style={{ display: "flex", gap: 20 }}>
            <Link to="/clients" style={{ fontSize: 15, color: C.inkSoft, textDecoration: "none" }}>
              Clients
            </Link>
            <Link to="/tasks" style={{ fontSize: 15, color: C.inkSoft, textDecoration: "none" }}>
              Tasks
            </Link>
            <Link to="/search" style={{ fontSize: 15, color: C.inkSoft, textDecoration: "none" }}>
              Search
            </Link>
            <Link to="/ops" style={{ fontSize: 15, color: C.inkSoft, textDecoration: "none" }}>
              Operations
            </Link>
            <Link to="/ai-assistant" style={{ fontSize: 15, color: C.inkSoft, textDecoration: "none" }}>
              AI Assistant
            </Link>
            <Link to="/veve" style={{ fontSize: 15, color: C.inkSoft, textDecoration: "none" }}>
              PIP-VEVE
            </Link>
          </nav>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
              {user.name} · {user.role}
            </span>
            <Btn tone="ghost" small onClick={() => void logout()}>
              Log out
            </Btn>
          </div>
        )}
      </header>
      <main style={{ maxWidth: C.contentWidth, margin: "0 auto", padding: "40px 32px" }}>{children}</main>
    </div>
  );
}
