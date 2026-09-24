#!/usr/bin/env node

import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
const requiredTables = [
  "users",
  "lineup_state",
  "lineup_operations",
  "saved_lineups",
  "app_config",
  "match_results",
  "app_secrets",
];

if (!databaseUrl) {
  console.error("DATABASE_URL is required. The audit never connects to legacy databases.");
  process.exit(1);
}

const redactUrl = (url) => url.replace(/:[^:@/]+@/, ":***@");
let connection;

try {
  connection = await mysql.createConnection(databaseUrl);
  const [databaseRows] = await connection.query("SELECT DATABASE() AS name");
  const databaseName = databaseRows[0]?.name;

  console.log(`Unified database: ${databaseName} (${redactUrl(databaseUrl)})`);
  console.log("──────────────────────────────────────────────────────────");

  let hasMissingTable = false;
  for (const table of requiredTables) {
    const [tableRows] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );

    if (Number(tableRows[0]?.count) === 0) {
      hasMissingTable = true;
      console.log(`MISSING  ${table}`);
      continue;
    }

    const [countRows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
    console.log(`OK       ${table.padEnd(20)} ${countRows[0].count} rows`);
  }

  if (hasMissingTable) {
    console.error("\nThe target is incomplete. Run `pnpm db:push` against this DATABASE_URL.");
    process.exitCode = 1;
  } else {
    console.log("\nAll applications are backed by the same complete database schema.");
  }
} catch (error) {
  console.error(`Database audit failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
