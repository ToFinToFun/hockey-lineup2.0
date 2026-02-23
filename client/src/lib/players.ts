// Hockey Lineup App – Spelardata från laget.se Stålstadens A-lag Herrar
// Positioner: MV=Målvakt, B=Back, F=Forward, C=Center, Ö=Övrigt

export type Position = "MV" | "B" | "F" | "C" | "Ö";

export const POSITION_LABELS: Record<Position, string> = {
  MV: "Målvakt",
  B: "Back",
  F: "Forward",
  C: "Center",
  Ö: "Övrigt",
};

export const ALL_POSITIONS: Position[] = ["MV", "B", "F", "C", "Ö"];

export interface Player {
  id: string;
  number: string;
  name: string;
  position: Position;
}

export const initialPlayers: Player[] = [
  // Målvakter (från "Ledare" på laget.se)
  { id: "mv-1", number: "", name: "Andreas Johansson", position: "MV" },
  { id: "mv-2", number: "", name: "Tobias Johansson", position: "MV" },
  { id: "mv-3", number: "", name: "Robin Bergstedt", position: "MV" },

  // Backar
  { id: "b-1", number: "17", name: "Johan Gyllefjord", position: "B" },
  { id: "b-2", number: "24", name: "Henrik Sandström", position: "B" },
  { id: "b-3", number: "63", name: "Jerry Paasovaara", position: "B" },
  { id: "b-4", number: "98", name: "Carl-Johan Grönberg", position: "B" },

  // Forwards
  { id: "f-1", number: "0", name: "Joakim Brännholm", position: "F" },
  { id: "f-2", number: "0", name: "Filiph Åström", position: "F" },
  { id: "f-3", number: "10", name: "Tobias Olovsson", position: "F" },
  { id: "f-4", number: "29", name: "Viktor Lindgren", position: "F" },
  { id: "f-5", number: "50", name: "Kent Stråhle", position: "F" },
  { id: "f-6", number: "71", name: "Jonathan Klockare", position: "F" },
  { id: "f-7", number: "77", name: "Daniel Pekkari", position: "F" },
  { id: "f-8", number: "81", name: "Henrik Björling", position: "F" },
  { id: "f-9", number: "82", name: "Johan Nilsson", position: "F" },
  { id: "f-10", number: "87", name: "Marcus Norqvist", position: "F" },
  { id: "f-11", number: "93", name: "Aron Esberg", position: "F" },
  { id: "f-12", number: "", name: "Andreas Hietala", position: "F" },

  // Övrigt (utespelare, position okänd)
  { id: "u-1", number: "0", name: "Fredrik Boström", position: "Ö" },
  { id: "u-2", number: "3", name: "Jens Printz", position: "Ö" },
  { id: "u-3", number: "16", name: "Hampus Bergman Lahti", position: "Ö" },
  { id: "u-4", number: "26", name: "Simon Kättström", position: "Ö" },
  { id: "u-5", number: "44", name: "Oskar Brännholm Kvenås", position: "Ö" },
  { id: "u-6", number: "54", name: "Andreas Lindström", position: "Ö" },
  { id: "u-7", number: "84", name: "Jimmy Andersson", position: "Ö" },
  { id: "u-8", number: "95", name: "Christoffer Brännström", position: "Ö" },
  { id: "u-9", number: "97", name: "Markus Lundberg", position: "Ö" },
  { id: "u-10", number: "", name: "John Andersson Fors", position: "Ö" },
  { id: "u-11", number: "", name: "William Bergström", position: "Ö" },
  { id: "u-12", number: "", name: "Anton Bergwall", position: "Ö" },
  { id: "u-13", number: "", name: "Per Erkki", position: "Ö" },
  { id: "u-14", number: "", name: "Robin Flygare", position: "Ö" },
  { id: "u-15", number: "", name: "Peter Flymalm", position: "Ö" },
  { id: "u-16", number: "", name: "Markus Fältö Kangastie", position: "Ö" },
  { id: "u-17", number: "", name: "Alexander Haraldsson", position: "Ö" },
  { id: "u-18", number: "", name: "Gustaf Hermansson", position: "Ö" },
  { id: "u-19", number: "", name: "Rickard Holmström", position: "Ö" },
  { id: "u-20", number: "", name: "Rasmus Häggqvist", position: "Ö" },
  { id: "u-21", number: "", name: "Tomas Johansson", position: "Ö" },
  { id: "u-22", number: "", name: "Vilmer Johansson Hellgren", position: "Ö" },
  { id: "u-23", number: "", name: "Fabian Martinsson", position: "Ö" },
  { id: "u-24", number: "", name: "Alexander Mickelsson", position: "Ö" },
  { id: "u-25", number: "", name: "Simon Myrestam", position: "Ö" },
  { id: "u-26", number: "", name: "Carl-Johan Norrbin", position: "Ö" },
  { id: "u-27", number: "", name: "Ludwig Rydén", position: "Ö" },
  { id: "u-28", number: "", name: "Teijo Räävi", position: "Ö" },
  { id: "u-29", number: "", name: "Johan Sandman", position: "Ö" },
  { id: "u-30", number: "", name: "Pierre Schilken", position: "Ö" },
  { id: "u-31", number: "", name: "Johan Schols", position: "Ö" },
  { id: "u-32", number: "", name: "Johan Ström", position: "Ö" },
  { id: "u-33", number: "", name: "Mathias Sundelin", position: "Ö" },
  { id: "u-34", number: "", name: "Nils Tomtén Sundström", position: "Ö" },
  { id: "u-35", number: "", name: "Simon Wahlberg", position: "Ö" },
  { id: "u-36", number: "", name: "David Warnström", position: "Ö" },
  { id: "u-37", number: "", name: "Jens Westerberg", position: "Ö" },
  { id: "u-38", number: "", name: "Andreas Westerlund", position: "Ö" },
  { id: "u-39", number: "", name: "Anton Åberg", position: "Ö" },
  { id: "u-40", number: "", name: "Teddie Ögren", position: "Ö" },
  { id: "tr-1", number: "", name: "Linus Carbin", position: "Ö" },
  { id: "tr-2", number: "", name: "Christoffer Gran", position: "Ö" },
  { id: "tr-3", number: "", name: "Peter Holmberg", position: "Ö" },
  { id: "tr-4", number: "", name: "Robert Romanowski", position: "Ö" },
];

export function getPositionBadgeColor(position: Position): string {
  switch (position) {
    case "MV": return "bg-amber-500 text-amber-950";
    case "B":  return "bg-blue-500 text-blue-950";
    case "F":  return "bg-emerald-500 text-emerald-950";
    case "C":  return "bg-purple-500 text-purple-950";
    case "Ö":  return "bg-slate-400 text-slate-950";
  }
}

export function getPositionDotColor(position: Position): string {
  switch (position) {
    case "MV": return "bg-amber-400";
    case "B":  return "bg-blue-400";
    case "F":  return "bg-emerald-400";
    case "C":  return "bg-purple-400";
    case "Ö":  return "bg-slate-400";
  }
}
