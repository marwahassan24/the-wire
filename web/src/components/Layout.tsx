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
          padding: "14px 24px",
          borderBottom: `1px solid ${C.line}`,
          background: C.card,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link to="/clients" style={{ textDecoration: "none", color: C.primary, fontWeight: 700, fontSize: 16 }}>
            The Wire
          </Link>
          <nav style={{ display: "flex", gap: 14 }}>
            <Link to="/clients" style={{ fontSize: 13, color: C.inkSoft, textDecoration: "none" }}>
              Clients
            </Link>
            <Link to="/tasks" style={{ fontSize: 13, color: C.inkSoft, textDecoration: "none" }}>
              Tasks
            </Link>
          </nav>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: C.inkSoft }}>
              {user.name} · {user.role}
            </span>
            <Btn tone="ghost" small onClick={() => void logout()}>
              Log out
            </Btn>
          </div>
        )}
      </header>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>{children}</main>
    </div>
  );
}
