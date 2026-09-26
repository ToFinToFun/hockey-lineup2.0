import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  createPlayer,
  listPlayers,
  mergePlayers,
  normalizeName,
  updatePlayer,
  type PlayerFields,
  type RegistryPlayer,
} from "../playersDb";

const positionSchema = z.enum(["MV", "B", "F", "C", "IB"]);
const fieldsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  number: z.string().trim().max(10).optional(),
  position: positionSchema.optional(),
  teamColor: z.enum(["white", "green"]).nullable().optional(),
  captainRole: z.enum(["C", "A"]).nullable().optional(),
  isMember: z.boolean().optional(),
  active: z.boolean().optional(),
  lagetName: z.string().trim().max(150).nullable().optional(),
  externalId: z.string().trim().max(64).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** En rad från en importerad fil (redan tolkad i webbläsaren). */
const importRowSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(120),
  number: z.string().trim().max(10).optional(),
  position: positionSchema.optional(),
  teamColor: z.enum(["white", "green"]).nullable().optional(),
  captainRole: z.enum(["C", "A"]).nullable().optional(),
  isMember: z.boolean().optional(),
  active: z.boolean().optional(),
  lagetName: z.string().trim().max(150).nullable().optional(),
  externalId: z.string().trim().max(64).nullable().optional(),
});
type ImportRow = z.infer<typeof importRowSchema>;

const COMPARED = ["name", "number", "position", "teamColor", "captainRole", "isMember", "active", "lagetName", "externalId"] as const;

interface PlannedChange {
  kind: "new" | "update" | "missing";
  id?: string;
  name: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
  fields: PlayerFields & { name: string };
}

/** Jämför filen med registret. Ingenting ändras här. */
function planImport(rows: ImportRow[], registry: RegistryPlayer[], markMissingAsNonMember: boolean) {
  const live = registry.filter((p) => !p.mergedInto);
  const byId = new Map(live.map((p) => [p.id, p]));
  const byName = new Map<string, RegistryPlayer | null>();
  for (const p of live) {
    for (const n of [p.name, p.lagetName]) {
      if (!n) continue;
      const k = normalizeName(n);
      byName.set(k, byName.has(k) && byName.get(k)?.id !== p.id ? null : p);
    }
  }

  const matched = new Set<string>();
  const plan: PlannedChange[] = [];
  const problems: string[] = [];

  rows.forEach((row, i) => {
    let target = row.id ? byId.get(row.id) : undefined;
    if (!target) {
      const hit = byName.get(normalizeName(row.name));
      if (hit === null) {
        problems.push(`Rad ${i + 2}: "${row.name}" matchar flera spelare – ange id i filen.`);
        return;
      }
      target = hit;
    }
    if (target && matched.has(target.id)) {
      problems.push(`Rad ${i + 2}: "${row.name}" förekommer flera gånger i filen.`);
      return;
    }
    const fields = { ...row } as PlayerFields & { name: string };
    delete (fields as { id?: string }).id;
    if (!target) {
      plan.push({ kind: "new", name: row.name, changes: [], fields });
      return;
    }
    matched.add(target.id);
    const changes = COMPARED.filter((f) => f in row && row[f] !== undefined)
      .filter((f) => String(row[f] ?? "") !== String((target as Record<string, unknown>)[f] ?? ""))
      .map((f) => ({ field: f, from: (target as Record<string, unknown>)[f] ?? null, to: row[f] ?? null }));
    if (changes.length) plan.push({ kind: "update", id: target.id, name: target.name, changes, fields });
  });

  if (markMissingAsNonMember) {
    for (const p of live) {
      if (!matched.has(p.id) && p.isMember) {
        plan.push({
          kind: "missing",
          id: p.id,
          name: p.name,
          changes: [{ field: "isMember", from: true, to: false }],
          fields: { name: p.name, isMember: false },
        });
      }
    }
  }
  const unchanged = rows.length - plan.filter((c) => c.kind !== "missing").length - problems.length;
  return { plan, problems, unchanged };
}

export const playersRouter = router({
  /** Alla spelare i registret (även inaktiva och ihopslagna). */
  list: adminProcedure.query(() => listPlayers()),

  update: adminProcedure
    .input(z.object({ id: z.string().max(64), fields: fieldsSchema }))
    .mutation(async ({ input }) => {
      const updated = await updatePlayer(input.id, input.fields as PlayerFields);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Spelaren finns inte" });
      return updated;
    }),

  create: adminProcedure
    .input(fieldsSchema.extend({ name: z.string().trim().min(1).max(120) }))
    .mutation(({ input }) => createPlayer(input as PlayerFields & { name: string })),

  /** Samma person registrerad två gånger: historiken samlas på `intoId`. */
  merge: adminProcedure
    .input(z.object({ fromId: z.string().max(64), intoId: z.string().max(64) }))
    .mutation(async ({ input }) => {
      await mergePlayers(input.fromId, input.intoId);
      return { success: true };
    }),

  /** Saker att se över: möjliga dubbletter, medlemmar utan nummer m.m. */
  issues: adminProcedure.query(async () => {
    const live = (await listPlayers()).filter((p) => !p.mergedInto);
    const byName = new Map<string, RegistryPlayer[]>();
    for (const p of live) {
      const k = normalizeName(p.name);
      byName.set(k, [...(byName.get(k) ?? []), p]);
    }
    return {
      duplicates: [...byName.values()].filter((g) => g.length > 1).map((g) => g.map((p) => ({ id: p.id, name: p.name, number: p.number, active: p.active }))),
      activeNonMembers: live.filter((p) => p.active && !p.isMember).map((p) => ({ id: p.id, name: p.name })),
      membersWithoutNumber: live.filter((p) => p.active && p.isMember && !p.number).map((p) => ({ id: p.id, name: p.name })),
    };
  }),

  /** Förhandsgranska en import (ändrar ingenting). */
  importPreview: adminProcedure
    .input(z.object({ rows: z.array(importRowSchema).max(2000), markMissingAsNonMember: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const { plan, problems, unchanged } = planImport(input.rows, await listPlayers(), input.markMissingAsNonMember);
      return { plan: plan.map(({ fields: _f, ...rest }) => rest), problems, unchanged };
    }),

  /** Genomför importen. Planen räknas om på servern – klientens förhandsvisning litas inte på. */
  importApply: adminProcedure
    .input(z.object({ rows: z.array(importRowSchema).max(2000), markMissingAsNonMember: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const { plan, problems } = planImport(input.rows, await listPlayers(), input.markMissingAsNonMember);
      if (problems.length) throw new TRPCError({ code: "BAD_REQUEST", message: problems.join(" ") });
      let created = 0;
      let updated = 0;
      for (const c of plan) {
        if (c.kind === "new") {
          await createPlayer({ isMember: true, active: true, ...c.fields });
          created++;
        } else if (c.id) {
          const fields = Object.fromEntries(c.changes.map((ch) => [ch.field, ch.to])) as PlayerFields;
          await updatePlayer(c.id, fields);
          updated++;
        }
      }
      return { created, updated };
    }),
});
