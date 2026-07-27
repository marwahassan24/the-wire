import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import type { ClientSummary, StaffUser } from "../types.js";
import {
  ClientForm,
  ClientFormActions,
  buildClientPayload,
  clientFormIsValid,
  EMPTY_CLIENT_FORM_VALUES,
  type ClientFormValues,
} from "../components/ClientForm.js";

export function NewClientPage() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [values, setValues] = useState<ClientFormValues>(EMPTY_CLIENT_FORM_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StaffUser[]>("/api/users")
      .then(setStaff)
      .catch(() => setError("Couldn't load the staff list."));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!clientFormIsValid(values)) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<ClientSummary>("/api/clients", buildClientPayload(values));
      navigate(`/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that client.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 24 }}>New client</div>
      <form onSubmit={submit}>
        <ClientForm values={values} onChange={setValues} staff={staff} />
        <ClientFormActions
          submitLabel="Create client"
          submitting={submitting}
          disabled={!clientFormIsValid(values)}
          onCancel={() => navigate("/clients")}
          error={error}
        />
      </form>
    </div>
  );
}
