/**
 * Aktiviteter och anmälan. I det här steget bara för styrelsen; medlemmarna får egen
 * inloggning och anmäler sig själva i ett senare steg.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { ACTIVITY_TYPES, INVITES } from "../../shared/activities";
import {
  createActivities,
  deleteActivities,
  getActivity,
  getAttendanceSource,
  listActivities,
  setAttendance,
  setAttendanceSource,
  setCancelled,
  updateActivities,
} from "../activities";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ange tid som TT:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fields = z.object({
  type: z.enum(ACTIVITY_TYPES),
  title: z.string().trim().min(1, "Ange en rubrik").max(120),
  location: z.string().trim().max(120),
  description: z.string().max(4000),
  invite: z.enum(INVITES),
  startTime: time,
  endTime: z.union([z.literal(""), time]),
  maxParticipants: z.number().int().min(1).max(500).nullable(),
  waitlist: z.boolean(),
  opensDaysBefore: z.number().int().min(0).max(60).nullable(),
  closesHoursBefore: z.number().int().min(0).max(240).nullable(),
});
const scope = z.enum(["one", "following"]);

/** Fel från databaslagret visas som vanliga felmeddelanden. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
  }
}

export const activitiesRouter = router({
  list: adminProcedure
    .input(z.object({ past: z.boolean().optional() }).optional())
    .query(({ input }) => listActivities(input?.past ? { from: new Date(Date.now() - 120 * 86400000), to: new Date() } : {})),

  get: adminProcedure.input(z.object({ id: z.number().int() })).query(({ input }) => run(() => getActivity(input.id))),

  create: adminProcedure
    .input(z.object({ fields, dates: z.array(date).min(1).max(200) }))
    .mutation(({ input }) => run(async () => ({ ids: await createActivities(input.fields, input.dates) }))),

  update: adminProcedure
    .input(z.object({ id: z.number().int(), scope, fields, date: date.optional() }))
    .mutation(({ input }) => run(() => updateActivities(input.id, input.scope, input.fields, input.date))),

  cancel: adminProcedure
    .input(z.object({ id: z.number().int(), scope, cancelled: z.boolean(), note: z.string().max(200).default("") }))
    .mutation(({ input }) => run(() => setCancelled(input.id, input.scope, input.cancelled, input.note))),

  remove: adminProcedure
    .input(z.object({ id: z.number().int(), scope }))
    .mutation(({ input }) => run(() => deleteActivities(input.id, input.scope))),

  /** Den som administrerar lägger till/ändrar/tar bort en spelare ur truppen (går förbi max antal). */
  setAttendance: adminProcedure
    .input(z.object({ activityId: z.number().int(), playerId: z.string().min(1).max(64), status: z.enum(["yes", "no"]).nullable() }))
    .mutation(({ input }) => run(() => setAttendance(input.activityId, input.playerId, input.status, "admin", true))),

  /** Varifrån Lineup hämtar anmälningarna: laget.se (standard) eller appens aktiviteter. */
  source: adminProcedure.query(async () => ({ source: await getAttendanceSource() })),
  setSource: adminProcedure.input(z.object({ source: z.enum(["laget", "app"]) })).mutation(async ({ input }) => {
    await setAttendanceSource(input.source);
    return { source: input.source };
  }),
});
