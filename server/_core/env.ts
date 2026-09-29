export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  lagetSeUsername: process.env.LAGET_SE_USERNAME ?? "",
  lagetSePassword: process.env.LAGET_SE_PASSWORD ?? "",
  /** Utgående e-post för notiser (valfritt – utan SMTP_HOST skickas inga mejl) */
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  /** Avsändare, t.ex. "Stålstadens <noreply@stalstadens.se>" */
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
  /** "true" för port 465 (SSL); annars STARTTLS */
  smtpSecure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true",
  /** Appens adress i länkar i mejlen */
  appUrl: (process.env.APP_URL ?? "https://app.stalstadens.se").replace(/\/$/, ""),
};

/** Stoppa uppstart i produktion om nödvändiga hemligheter saknas. */
export function assertRequiredEnv() {
  if (!ENV.isProduction) return;
  const missing: string[] = [];
  if (ENV.cookieSecret.length < 32) missing.push("JWT_SECRET (minst 32 tecken)");
  if (!ENV.adminPassword) missing.push("ADMIN_PASSWORD");
  if (!ENV.databaseUrl) missing.push("DATABASE_URL");
  if (missing.length) {
    throw new Error(`Saknade miljövariabler: ${missing.join(", ")}`);
  }
}
