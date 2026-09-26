import { describe, expect, it, beforeAll } from "vitest";
import mysql from "mysql2/promise";
import { isolatedDatabaseUrl } from "../client/src/test/isolatedDatabase";
import { runDataMigrations } from "../scripts/dataMigrations.mjs";

const hasDb = !!process.env.DATABASE_URL;
const P = (id: string, name: string, number: string, position = "F", extra: Record<string, unknown> = {}) => ({ id, name, number, position, ...extra });

describe.skipIf(!hasDb)("datamigrering: spelarregister", () => {
  let conn: mysql.Connection;

  beforeAll(async () => {
    const url = await isolatedDatabaseUrl("datamig");
    conn = await mysql.createConnection(url);
    // Den tomma databasen har redan kört migreringen – nollställ och lägg in "gammal" data.
    await conn.query("DELETE FROM players");
    await conn.query("DELETE FROM app_config WHERE `key` = 'data_migrations'");
    await conn.query(
      "INSERT INTO lineup_state (id, players, lineup, teamAName, teamBName, version) VALUES (1, ?, ?, 'VITA', 'GRÖNA', 1) ON DUPLICATE KEY UPDATE players = VALUES(players), lineup = VALUES(lineup)",
      [
        JSON.stringify([P("p1", "Anna Andersson", "7", "B", { teamColor: "white" }), P("p2", "Bo Berg", "9")]),
        JSON.stringify({ "team-a-gk-1": P("p3", "Carl Ceder", "1", "MV", { captainRole: "C" }) }),
      ]
    );
    const oldLineup = { lineup: {
      "team-a-def-1-1": P("p1", "Anna Anderson", "7", "B"),
      "team-b-fwd-1-c": P("p9", "Bo Berg", "19", "C"),
      "team-b-fwd-1-lw": P("p5", "Dan Dahl", "5"),
    } };
    const goals = [
      { team: "white", scorer: "Anna Anderson #7", assist: "Bo Berg #19", timestamp: "" },
      { team: "green", scorer: "Dan Dahl #5", timestamp: "" },
      { team: "green", scorer: "Okänd Spelare", timestamp: "" },
    ];
    await conn.query(
      "INSERT INTO match_results (name, teamWhiteScore, teamGreenScore, goalHistory, lineup, reviewStatus) VALUES ('Gammal', 1, 2, ?, ?, 'approved')",
      [JSON.stringify(goals), JSON.stringify(oldLineup)]
    );
    await conn.query(
      "INSERT INTO app_config (`key`, `value`) VALUES ('pir_adjustments', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
      [JSON.stringify({ "Bo Berg": 50, "Dan Dahl": -20, "Finns Inte": 10 })]
    );
    await runDataMigrations(conn, () => {});
  }, 30000);

  const player = async (id: string) => {
    const [rows] = await conn.query<any[]>("SELECT * FROM players WHERE id = ?", [id]);
    return rows[0];
  };

  it("nuvarande trupp blir aktiva medlemmar med sina uppgifter", async () => {
    const anna = await player("p1");
    expect(anna).toMatchObject({ name: "Anna Andersson", number: "7", position: "B", teamColor: "white", isMember: 1, active: 1 });
    expect((await player("p3")).captainRole).toBe("C");
  });

  it("gamla stavningar och nummer sparas som alias", async () => {
    const anna = await player("p1");
    expect(anna.aliases).toEqual(expect.arrayContaining(["Anna Anderson #7", "Anna Anderson"]));
  });

  it("samma person med gammalt ID slås ihop, historiska spelare flaggas som ej medlem", async () => {
    expect((await player("p9")).mergedInto).toBe("p2");
    expect(await player("p5")).toMatchObject({ name: "Dan Dahl", isMember: 0, active: 0 });
  });

  it("mål och assist kopplas till ID, okända lämnas", async () => {
    const [[m]] = await conn.query<any[]>("SELECT goalHistory FROM match_results WHERE name = 'Gammal'");
    const g = typeof m.goalHistory === "string" ? JSON.parse(m.goalHistory) : m.goalHistory;
    expect(g[0]).toMatchObject({ scorerId: "p1", assistId: "p2" });
    expect(g[1].scorerId).toBe("p5");
    expect(g[2].scorerId).toBeUndefined();
  });

  it("PIR-justeringar flyttas från namn till ID", async () => {
    const [[row]] = await conn.query<any[]>("SELECT `value` FROM app_config WHERE `key` = 'pir_adjustments'");
    expect(JSON.parse(row.value)).toEqual({ p2: 50, p5: -20 });
  });

  it("körs bara en gång", async () => {
    await conn.query("UPDATE players SET name = 'Ändrad' WHERE id = 'p1'");
    await runDataMigrations(conn, () => {});
    expect((await player("p1")).name).toBe("Ändrad");
  });
});
