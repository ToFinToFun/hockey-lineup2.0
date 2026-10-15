/**
 * Grått namn för spelare som inte är medlemmar – bara i Lineup (sidan Home).
 * Övriga vyer (delad länk, Score Tracker, Media, kort) använder inte markeringen.
 */
import { createContext, useContext } from "react";

const MemberMarking = createContext(false);
export const MemberMarkingProvider = MemberMarking.Provider;

/** Klass för namnet: grått för icke-medlemmar när markeringen är på, annars vitt. */
export function useNameTone(isMember: boolean | undefined): string {
  const on = useContext(MemberMarking);
  return on && isMember === false ? "text-white/50" : "text-white";
}
