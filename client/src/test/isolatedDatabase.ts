/**
 * Ger varje integrationstest en egen databas (samma server, eget namn), så att
 * testfiler som körs parallellt inte ser varandras ändringar som "externa".
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";

export async function isolatedDatabaseUrl(suffix: string): Promise<string> {
  const base = new URL(process.env.DATABASE_URL!);
  const name = `${base.pathname.replace(/^\//, "")}_${suffix}`;
  const admin = new URL(base.toString());
  admin.pathname = "/";
  const conn = await mysql.createConnection(admin.toString());
  await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await conn.query(`CREATE DATABASE \`${name}\``);
  await conn.end();
  const url = new URL(base.toString());
  url.pathname = `/${name}`;
  execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "ignore" });
  return url.toString();
}
