import { useEffect, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type { AccountUser } from "../types.js";
import { Btn, Card, Input, Pill, Select } from "../components/ui.js";

const ROLE_LABEL: Record<AccountUser["role"], string> = {
  adviser: "Adviser",
  client_manager: "Client manager",
  admin: "Admin",
};

export function AccountManagerPage() {
  const [users, setUsers] = useState<AccountUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    return api
      .get<AccountUser[]>("/api/admin/users")
      .then(setUsers)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load accounts."));
  }

  useEffect(() => {
    load();
  }, []);

  function handleCreated(user: AccountUser) {
    setUsers((prev) => (prev ? [user, ...prev] : [user]));
    setCreating(false);
  }

  function handleUpdated(updated: AccountUser) {
    setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
  }

  if (loadError) return <div style={{ color: C.red, fontSize: C.text.small }}>{loadError}</div>;
  if (!users) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: C.text.title }}>Accounts</div>
          <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 4 }}>
            Add team members, deactivate accounts that no longer need access, and reset a forgotten password.
          </div>
        </div>
        <Btn tone={creating ? "ghost" : "ink"} onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "+ New account"}
        </Btn>
      </div>

      {creating && (
        <Card style={{ marginBottom: 20 }}>
          <NewAccountForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {users.map((u) => (
          <AccountRow key={u.id} user={u} onUpdated={handleUpdated} />
        ))}
      </div>
    </div>
  );
}

function NewAccountForm({
  onCreated,
  onCancel,
}: {
  onCreated: (u: AccountUser) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AccountUser["role"] | "">("adviser");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = email.trim() && name.trim() && role && password.length >= 8;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<AccountUser>("/api/admin/users", {
        email: email.trim(),
        name: name.trim(),
        role,
        password,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: C.text.heading, fontWeight: 600, color: C.ink }}>New account</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: "1 1 220px" }}
        />
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: "1 1 220px" }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Select value={role} onChange={(v) => setRole(v as AccountUser["role"] | "")} placeholder="Role">
          <option value="adviser">Adviser</option>
          <option value="client_manager">Client manager</option>
          <option value="admin">Admin</option>
        </Select>
        <Input
          type="text"
          placeholder="Temporary password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ flex: "1 1 260px" }}
        />
      </div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft }}>
        Pass this password to them directly - there's no email invite. They can change it themselves from their
        profile once they've logged in.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn type="submit" tone="ink" small disabled={submitting || !valid}>
          Create account
        </Btn>
        <Btn tone="ghost" small onClick={onCancel}>
          Cancel
        </Btn>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
    </form>
  );
}

function AccountRow({ user, onUpdated }: { user: AccountUser; onUpdated: (u: AccountUser) => void }) {
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<AccountUser["role"] | "">(user.role);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);

  async function saveEdit() {
    if (!name.trim() || !email.trim() || !role) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<AccountUser>(`/api/admin/users/${user.id}`, {
        name: name.trim(),
        email: email.trim(),
        role,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save those changes.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive() {
    const goingActive = !user.active;
    if (
      !goingActive &&
      !window.confirm(`Deactivate ${user.name}? They'll no longer be able to log in, but their history is kept.`)
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<AccountUser>(`/api/admin/users/${user.id}`, { active: goingActive });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/admin/users/${user.id}/reset-password`, { password: newPassword });
      setPasswordSet(true);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset that password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={{ opacity: user.active ? 1 : 0.65 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: C.text.body, color: C.ink }}>{user.name}</span>
            <Pill tone="plain">{ROLE_LABEL[user.role]}</Pill>
            <Pill tone={user.active ? "primary" : "red"}>{user.active ? "active" : "deactivated"}</Pill>
          </div>
          <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 4 }}>
            {user.email}
            {" · joined "}
            {fmtDate(user.created_at)}
            {" · last login "}
            {user.last_login_at ? fmtDate(user.last_login_at) : "never"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn
            tone="ghost"
            small
            disabled={submitting}
            onClick={() => {
              setEditing((v) => !v);
              setResetting(false);
              setError(null);
            }}
          >
            {editing ? "Cancel edit" : "Edit"}
          </Btn>
          <Btn
            tone="ghost"
            small
            disabled={submitting}
            onClick={() => {
              setResetting((v) => !v);
              setEditing(false);
              setError(null);
              setPasswordSet(false);
            }}
          >
            Reset password
          </Btn>
          <Btn tone="ghost" small disabled={submitting} onClick={toggleActive}>
            {user.active ? "Deactivate" : "Reactivate"}
          </Btn>
        </div>
      </div>

      {editing && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 18,
            paddingTop: 18,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 220px" }} />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: "1 1 220px" }}
            />
            <Select value={role} onChange={(v) => setRole(v as AccountUser["role"] | "")} placeholder="Role">
              <option value="adviser">Adviser</option>
              <option value="client_manager">Client manager</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn tone="ink" small disabled={submitting || !name.trim() || !email.trim() || !role} onClick={saveEdit}>
              Save
            </Btn>
            <Btn tone="ghost" small onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}

      {resetting && (
        <form
          onSubmit={submitReset}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 18,
            paddingTop: 18,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          {passwordSet ? (
            <div style={{ fontSize: C.text.small, color: C.ink }}>
              Password set. Pass it to {user.name} directly - they weren't emailed anything.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Input
                  type="text"
                  placeholder="New password (8+ characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ flex: "1 1 260px" }}
                />
                <Btn type="submit" tone="ink" small disabled={submitting || newPassword.length < 8}>
                  Set new password
                </Btn>
              </div>
            </>
          )}
        </form>
      )}

      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 12 }}>{error}</div>}
    </Card>
  );
}
