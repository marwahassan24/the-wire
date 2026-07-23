import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { theme as C } from "../theme.js";
import { useAuth } from "../auth.js";
import { Btn, Card, Input } from "../components/ui.js";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/clients" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/clients", { replace: true });
    } catch {
      setError("Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: C.sans,
        background: C.paper,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card style={{ width: 360 }}>
        <div style={{ fontWeight: 700, fontSize: C.text.title, color: C.primary, marginBottom: 6 }}>The Wire</div>
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 28 }}>Sign in to continue</div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
          <Btn type="submit" tone="ink" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Btn>
        </form>
      </Card>
    </div>
  );
}
