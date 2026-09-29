/**
 * E-postnotiser. Mottagare och vilka notiser var och en vill ha administreras
 * under Inställningar → Notiser (sparas i app_config). Utgående konto ställs in
 * med miljövariabler (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
 * SMTP_SECURE). Saknas SMTP_HOST skickas inget – appen fungerar som vanligt.
 * Utskick görs i bakgrunden och får aldrig stoppa det som utlöste dem.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./_core/env";
import { getConfigValue, setConfigValue } from "./scoreDb";

export const NOTIFICATION_TYPES = {
  matchPending: "Match väntar på godkännande",
  newsScheduled: "Tidsinställd nyhet skapad",
  autoNewsPreview: "Automatisk nyhet går ut om 15 min (förhandsvisning)",
  autoNewsSkipped: "Automatisk nyhet kan inte gå ut",
  autoNewsPublished: "Automatisk nyhet publicerad/uppdaterad",
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface Recipient {
  email: string;
  types: NotificationType[];
}

const KEY = "notifications";

export async function getRecipients(): Promise<Recipient[]> {
  try {
    const raw = await getConfigValue(KEY);
    const v = raw ? (JSON.parse(raw) as { recipients?: Recipient[] }) : null;
    return Array.isArray(v?.recipients) ? v!.recipients : [];
  } catch {
    return [];
  }
}

export async function setRecipients(recipients: Recipient[]) {
  await setConfigValue(KEY, JSON.stringify({ recipients }));
}

export function smtpConfigured(): boolean {
  return !!ENV.smtpHost && !!ENV.smtpFrom;
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!smtpConfigured()) return null;
  transporter ??= nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpSecure,
    auth: ENV.smtpUser ? { user: ENV.smtpUser, pass: ENV.smtpPass } : undefined,
  });
  return transporter;
}

export interface MailContent {
  subject: string;
  /** Brödtext som enkel HTML (styckena byggs av mailLayout) */
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; cid?: string; contentType?: string }>;
}

/** Enkel, läsbar mejlmall. */
export function mailLayout(title: string, paragraphs: string[], link?: { href: string; label: string }): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111">
<h2 style="margin:0 0 12px">${esc(title)}</h2>
${paragraphs.map((p) => `<p style="margin:0 0 10px;line-height:1.45">${p}</p>`).join("\n")}
${link ? `<p style="margin:16px 0"><a href="${link.href}" style="background:#0a7ea4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(link.label)}</a></p>` : ""}
<p style="color:#888;font-size:12px;margin-top:24px">Stålstadens app · du får mejlet eftersom du valt den här notisen under Inställningar → Notiser.</p>
</div>`;
  const text = [title, "", ...paragraphs.map((p) => p.replace(/<[^>]+>/g, "")), link ? `\n${link.label}: ${link.href}` : ""].join("\n");
  return { html, text };
}

/** Skicka till alla som valt notisen. Returnerar antal mottagare (0 om inget skickades). */
export async function notify(type: NotificationType, mail: MailContent): Promise<number> {
  const t = getTransporter();
  if (!t) return 0;
  const to = (await getRecipients()).filter((r) => r.types.includes(type)).map((r) => r.email);
  if (!to.length) return 0;
  try {
    await t.sendMail({ from: ENV.smtpFrom, bcc: to, subject: mail.subject, html: mail.html, text: mail.text, attachments: mail.attachments });
    return to.length;
  } catch (err) {
    console.error(`[notiser] ${type}:`, err);
    return 0;
  }
}

/** Utan att vänta – för anrop där svaret inte ska dröja. */
export function notifyLater(type: NotificationType, mail: () => MailContent | Promise<MailContent>) {
  void (async () => {
    try {
      await notify(type, await mail());
    } catch (err) {
      console.error(`[notiser] ${type}:`, err);
    }
  })();
}

export async function sendTestMail(email: string): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "Utgående e-post är inte inställd (SMTP_HOST och SMTP_FROM saknas)." };
  const { html, text } = mailLayout("Testmejl från Stålstadens", ["Det här är ett test. Notiserna fungerar."]);
  try {
    await t.sendMail({ from: ENV.smtpFrom, to: email, subject: "Test – Stålstadens notiser", html, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
