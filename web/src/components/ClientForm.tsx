import type { ReactNode } from "react";
import { theme as C } from "../theme.js";
import type { StaffUser } from "../types.js";
import { Btn, Input, Select } from "./ui.js";

export interface ClientFormValues {
  moneyinfo_client_id: string;
  first_names: string;
  surname: string;
  dob: string;
  dob_2: string;
  email: string;
  phone: string;
  status: string;
  adviser_id: string;
  cm_id: string;
  review_cycle: string;
  next_review_date: string;
  next_review_type: string;
  last_review_date: string;
}

export const EMPTY_CLIENT_FORM_VALUES: ClientFormValues = {
  moneyinfo_client_id: "",
  first_names: "",
  surname: "",
  dob: "",
  dob_2: "",
  email: "",
  phone: "",
  status: "Working",
  adviser_id: "",
  cm_id: "",
  review_cycle: "Annual",
  next_review_date: "",
  next_review_type: "",
  last_review_date: "",
};

const OPTIONAL_FIELDS = [
  "moneyinfo_client_id",
  "dob",
  "dob_2",
  "email",
  "phone",
  "next_review_date",
  "next_review_type",
  "last_review_date",
] as const;

// Only the fields the API schema actually accepts, and only when non-empty
// (an empty string sent for an optional date/enum field 400s - the schema
// wants the key omitted entirely, not a blank value).
export function buildClientPayload(values: ClientFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    first_names: values.first_names.trim(),
    surname: values.surname.trim(),
    status: values.status,
    adviser_id: Number(values.adviser_id),
    cm_id: Number(values.cm_id),
    review_cycle: values.review_cycle,
  };
  for (const key of OPTIONAL_FIELDS) {
    if (values[key]) payload[key] = values[key];
  }
  return payload;
}

export function clientFormIsValid(values: ClientFormValues): boolean {
  return !!(values.first_names.trim() && values.surname.trim() && values.adviser_id && values.cm_id);
}

const fieldLabelStyle = { fontSize: C.text.small, fontWeight: 600, color: C.inkSoft, marginBottom: 6, display: "block" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

export function ClientForm({
  values,
  onChange,
  staff,
}: {
  values: ClientFormValues;
  onChange: (values: ClientFormValues) => void;
  staff: StaffUser[];
}) {
  const set = (key: keyof ClientFormValues) => (v: string) => onChange({ ...values, [key]: v });

  const advisers = staff.filter((s) => s.role === "adviser");
  const clientManagers = staff.filter((s) => s.role === "client_manager");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="First name(s)">
            <Input value={values.first_names} onChange={(e) => set("first_names")(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Surname">
            <Input value={values.surname} onChange={(e) => set("surname")(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Date of birth">
            <Input type="date" value={values.dob} onChange={(e) => set("dob")(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Second date of birth (joint clients)">
            <Input type="date" value={values.dob_2} onChange={(e) => set("dob_2")(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Status">
            <Select value={values.status} onChange={set("status")} placeholder="Status">
              <option value="Working">Working</option>
              <option value="Retired">Retired</option>
            </Select>
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Email">
            <Input type="email" value={values.email} onChange={(e) => set("email")(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Phone">
            <Input value={values.phone} onChange={(e) => set("phone")(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Adviser">
            <Select value={values.adviser_id} onChange={set("adviser_id")} placeholder="Choose an adviser">
              {advisers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Client manager">
            <Select value={values.cm_id} onChange={set("cm_id")} placeholder="Choose a client manager">
              {clientManagers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Review cycle">
            <Select value={values.review_cycle} onChange={set("review_cycle")} placeholder="Review cycle">
              <option value="Annual">Annual</option>
              <option value="Interim">Interim</option>
              <option value="Ad hoc">Ad hoc</option>
            </Select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Last review date">
            <Input
              type="date"
              value={values.last_review_date}
              onChange={(e) => set("last_review_date")(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Next review date">
            <Input
              type="date"
              value={values.next_review_date}
              onChange={(e) => set("next_review_date")(e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Next review type">
            <Select value={values.next_review_type} onChange={set("next_review_type")} placeholder="Not set">
              <option value="Annual">Annual</option>
              <option value="Interim">Interim</option>
              <option value="Ad hoc">Ad hoc</option>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

export function ClientFormActions({
  submitLabel,
  submitting,
  disabled,
  onCancel,
  error,
}: {
  submitLabel: string;
  submitting: boolean;
  disabled: boolean;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn type="submit" tone="ink" disabled={submitting || disabled}>
          {submitLabel}
        </Btn>
        <Btn type="button" tone="ghost" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 10 }}>{error}</div>}
    </div>
  );
}
