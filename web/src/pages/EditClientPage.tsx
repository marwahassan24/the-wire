import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import type { ClientSummary, StaffUser } from "../types.js";
import {
  ClientForm,
  ClientFormActions,
  buildClientPayload,
  clientFormIsValid,
  type ClientFormValues,
} from "../components/ClientForm.js";

function toFormValues(c: ClientSummary): ClientFormValues {
  return {
    moneyinfo_client_id: c.moneyinfo_client_id ?? "",
    first_names: c.first_names,
    surname: c.surname,
    dob: c.dob ? c.dob.slice(0, 10) : "",
    dob_2: c.dob_2 ? c.dob_2.slice(0, 10) : "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    status: c.status,
    adviser_id: String(c.adviser_id),
    cm_id: String(c.cm_id),
    review_cycle: c.review_cycle,
    next_review_date: c.next_review_date ? c.next_review_date.slice(0, 10) : "",
    next_review_type: c.next_review_type ?? "",
    last_review_date: c.last_review_date ? c.last_review_date.slice(0, 10) : "",
  };
}

export function EditClientPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [values, setValues] = useState<ClientFormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<ClientSummary>(`/api/clients/${id}`), api.get<StaffUser[]>("/api/users")])
      .then(([c, s]) => {
        setClient(c);
        setValues(toFormValues(c));
        setStaff(s);
      })
      .catch(() => setLoadError("Couldn't load this client."));
  }, [id]);

  async function reload() {
    setConflict(false);
    setError(null);
    try {
      const c = await api.get<ClientSummary>(`/api/clients/${id}`);
      setClient(c);
      setValues(toFormValues(c));
    } catch {
      setLoadError("Couldn't reload this client.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values || !client || !clientFormIsValid(values)) return;
    setSubmitting(true);
    setError(null);
    setConflict(false);
    try {
      await api.patch<ClientSummary>(`/api/clients/${client.id}`, {
        ...buildClientPayload(values),
        version: client.version,
      });
      navigate(`/clients/${client.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Someone else saved a change to this client since we loaded it -
        // the API refused the write rather than silently overwriting their
        // edit. Reloading gets the current version, so a retry can succeed
        // on top of what's actually there, not what was there when this
        // page opened.
        setConflict(true);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't save those changes.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <div style={{ color: C.red, fontSize: C.text.small }}>{loadError}</div>;
  if (!client || !values) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 24 }}>
        Edit {client.first_names} {client.surname}
      </div>
      {conflict && (
        <div
          style={{
            background: C.amberSoft,
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: C.text.small,
            color: C.ink,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            style={{
              fontWeight: 600,
              color: C.primary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              fontSize: C.text.small,
              fontFamily: C.sans,
            }}
          >
            Reload
          </button>
        </div>
      )}
      <form onSubmit={submit}>
        <ClientForm values={values} onChange={setValues} staff={staff} />
        <ClientFormActions
          submitLabel="Save changes"
          submitting={submitting}
          disabled={!clientFormIsValid(values)}
          onCancel={() => navigate(`/clients/${client.id}`)}
          error={conflict ? null : error}
        />
      </form>
    </div>
  );
}
