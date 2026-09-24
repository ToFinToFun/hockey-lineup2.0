export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  lagetSeUsername: process.env.LAGET_SE_USERNAME ?? "",
  lagetSePassword: process.env.LAGET_SE_PASSWORD ?? "",
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
