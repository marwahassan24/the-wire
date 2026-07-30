import { useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { useAuth } from "../auth.js";
import { Btn, Card, Input } from "../components/ui.js";

const ROLE_LABEL: Record<string, string> = {
  adviser: "Adviser",
  client_manager: "Client manager",
  admin: "Admin",
};

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 24 }}>My profile</div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: C.text.heading, fontWeight: 600, color: C.ink, marginBottom: 16 }}>Details</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: C.text.body }}>
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} />
          <Field label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
        </div>
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 14 }}>
          Need your name, email or role changed? Ask an admin.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: C.text.heading, fontWeight: 600, color: C.ink, marginBottom: 16 }}>
          Change password
        </div>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <span style={{ width: 70, color: C.inkSoft, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.ink }}>{value}</span>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const valid = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    setDone(false);
    try {
      await api.patch("/api/auth/me/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
      <Input
        type="password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => {
          setCurrentPassword(e.target.value);
          setDone(false);
        }}
        autoComplete="current-password"
      />
      <Input
        type="password"
        placeholder="New password (8+ characters)"
        value={newPassword}
        onChange={(e) => {
          setNewPassword(e.target.value);
          setDone(false);
        }}
        autoComplete="new-password"
      />
      <Input
        type="password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value);
          setDone(false);
        }}
        autoComplete="new-password"
      />
      {mismatch && <div style={{ fontSize: C.text.small, color: C.red }}>Passwords don't match.</div>}
      <Btn type="submit" tone="ink" small disabled={submitting || !valid} style={{ alignSelf: "flex-start" }}>
        Change password
      </Btn>
      {done && <div style={{ fontSize: C.text.small, color: C.ink }}>Password changed.</div>}
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
    </form>
  );
}
