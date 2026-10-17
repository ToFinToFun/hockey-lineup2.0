import { describe, expect, it } from "vitest";
import { createPlayer, listPlayers } from "./playersDb";
import {
  appAttendance,
  createActivities,
  deleteActivities,
  getActivity,
  listActivities,
  setAttendance,
  setCancelled,
  updateActivities,
  type ActivityFields,
} from "./activities";
import { addDays, stockholmParts } from "../shared/activities";

const base: ActivityFields = {
  type: "training",
  title: "Testträning",
  location: "C-hallen",
  description: "",
  invite: "all",
  startTime: "21:00",
  endTime: "22:15",
  maxParticipants: 2,
  waitlist: true,
  opensDaysBefore: null,
  closesHoursBefore: 2,
  invitedPlayerIds: [],
  feeEnabled: false,
  feeAmount: null,
  feeReason: "",
  feeSwish: "",
  notifyEmail: false,
  reminderHours: null,
};

describe.skipIf(!process.env.DATABASE_URL)("aktiviteter och anmälan", () => {
  it("serie, max antal med reserv, ändra kommande, ställa in och Lineup-formen", async () => {
    const ids = ["akt-mv", "akt-a", "akt-b", "akt-c"];
    for (const id of ids)
      if (!(await listPlayers()).some((p) => p.id === id))
        await createPlayer({ id, name: { "akt-mv": "Mats Målvakt", "akt-a": "Anna Back", "akt-b": "Bo Forward", "akt-c": "Cesar Center" }[id]!, position: id === "akt-mv" ? "MV" : "F" });

    const today = stockholmParts(new Date()).date;
    const dates = [addDays(today, 1), addDays(today, 8), addDays(today, 15)];
    const created = await createActivities(base, dates);
    expect(created).toHaveLength(3);
    const first = created[0];

    // Max 2 + reservlista; styrelsen (force) går förbi gränsen
    expect((await setAttendance(first, "akt-a", "yes", "self")).status).toBe("yes");
    expect((await setAttendance(first, "akt-b", "yes", "self")).status).toBe("yes");
    expect((await setAttendance(first, "akt-c", "yes", "self")).status).toBe("reserve");
    expect((await setAttendance(first, "akt-mv", "yes", "admin", true)).status).toBe("yes");
    // Någon lämnar återbud, men det är fortfarande fullt (3 kommer, max 2) – reserven ligger kvar
    await setAttendance(first, "akt-b", "no", "self");
    let a = await getActivity(first);
    expect(a.yes.map((x) => x.name)).toEqual(["Mats Målvakt", "Anna Back"]); // målvakt först
    expect(a.reserve.map((x) => x.playerId)).toEqual(["akt-c"]);
    // Ännu ett återbud → reserven flyttas upp
    await setAttendance(first, "akt-a", "no", "self");
    a = await getActivity(first);
    expect(a.yes.map((x) => x.playerId).sort()).toEqual(["akt-c", "akt-mv"]);

    // Ändra alla kommande från andra tillfället: ny tid, datumen behålls
    await updateActivities(created[1], "following", { ...base, startTime: "20:30", endTime: "21:45", title: "Ny tid" });
    const list = (await listActivities()).filter((x) => created.includes(x.id));
    expect(list.map((x) => x.title)).toEqual(["Testträning", "Ny tid", "Ny tid"]);
    expect(stockholmParts(list[2].startsAt)).toMatchObject({ date: dates[2], time: "20:30" });
    expect(list[0].goalies).toBe(1);
    expect(list[0].seriesCount).toBe(3);

    // Lineup läser första tillfället i samma form som laget.se
    const lineup = await appAttendance();
    if (lineup.eventDate === dates[0]) {
      expect(lineup.registeredNames).toContain("Mats Målvakt");
      expect(lineup.eventTime).toBe("21:00");
    }

    // Bara valda kallas: inte svarat = de valda som inte svarat
    // akt-x är inte medlem och kan inte kallas
    if (!(await listPlayers()).some((p) => p.id === "akt-x")) await createPlayer({ id: "akt-x", name: "Xerxes Extern", position: "MV", isMember: false });
    const [only] = await createActivities({ ...base, invite: "none", invitedPlayerIds: ["akt-b", "akt-c", "akt-x"], feeEnabled: true, feeAmount: 50, feeReason: "Försäsong", feeSwish: "123" }, [addDays(today, 2)]);
    await setAttendance(only, "akt-b", "yes", "admin", true);
    const o = await getActivity(only);
    expect(o.invitedCount).toBe(2);
    expect(o.notAnswered.map((x) => x.playerId)).toEqual(["akt-c"]);
    expect(o.activity.feeAmount).toBe(50);
    await deleteActivities(only, "one");

    await setCancelled(created[0], "one", true, "Ishallen stängd");
    expect((await getActivity(created[0])).activity.cancelled).toBe(true);
    await deleteActivities(created[0], "following");
    expect((await listActivities()).some((x) => created.includes(x.id))).toBe(false);
  });
});
