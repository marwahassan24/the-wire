import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

// No email-sending capability existed anywhere in this app before this
// feature - this is the first. Deliberately just five plain env vars,
// the same pattern BACKUP_S3_* already uses for the backup workflow's
// secrets, rather than a new config table.
function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !port || !user || !password || !from) return null;
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) return null;
  return { host, port: portNum, user, password, from };
}

export function isSmtpConfigured(): boolean {
  return readSmtpConfig() !== null;
}

export function smtpConfigError(): string {
  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"].filter(
    (key) => !process.env[key]
  );
  return missing.length > 0
    ? `SMTP is not configured - missing ${missing.join(", ")}`
    : "SMTP_PORT is not a valid number";
}

// Real SMTP delivery. Never pretends to have sent something it hasn't -
// if the env vars aren't set, send() throws immediately rather than
// silently succeeding, so the caller records the alert as failed with a
// clear reason instead of a false "sent".
export class SmtpEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const config = readSmtpConfig();
    if (!config) {
      throw new Error(smtpConfigError());
    }
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
    });
    await transporter.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
  }
}
