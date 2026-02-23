// Hockey Lineup App – Spelardata från laget.se Stålstadens A-lag Herrar
// Ledare används som Målvakter, Backs som Backar, Forwards som Forwards, Utespelare som Utespelare

export type Position = "Målvakt" | "Back" | "Forward" | "Utespelare";

export interface Player {
  id: string;
  number: string;
  name: string;
  position: Position;
}

export const initialPlayers: Player[] = [
  // Målvakter (från "Ledare" på laget.se)
  { id: "mv-1", number: "", name: "Andreas Johansson", position: "Målvakt" },
  { id: "mv-2", number: "", name: "Tobias Johansson", position: "Målvakt" },
  { id: "mv-3", number: "", name: "Robin Bergstedt", position: "Målvakt" },

  // Backar
  { id: "b-1", number: "17", name: "Johan Gyllefjord", position: "Back" },
  { id: "b-2", number: "24", name: "Henrik Sandström", position: "Back" },
  { id: "b-3", number: "63", name: "Jerry Paasovaara", position: "Back" },
  { id: "b-4", number: "98", name: "Carl-Johan Grönberg", position: "Back" },

  // Forwards
  { id: "f-1", number: "0", name: "Joakim Brännholm", position: "Forward" },
  { id: "f-2", number: "0", name: "Filiph Åström", position: "Forward" },
  { id: "f-3", number: "10", name: "Tobias Olovsson", position: "Forward" },
  { id: "f-4", number: "29", name: "Viktor Lindgren", position: "Forward" },
  { id: "f-5", number: "50", name: "Kent Stråhle", position: "Forward" },
  { id: "f-6", number: "71", name: "Jonathan Klockare", position: "Forward" },
  { id: "f-7", number: "77", name: "Daniel Pekkari", position: "Forward" },
  { id: "f-8", number: "81", name: "Henrik Björling", position: "Forward" },
  { id: "f-9", number: "82", name: "Johan Nilsson", position: "Forward" },
  { id: "f-10", number: "87", name: "Marcus Norqvist", position: "Forward" },
  { id: "f-11", number: "93", name: "Aron Esberg", position: "Forward" },
  { id: "f-12", number: "", name: "Andreas Hietala", position: "Forward" },

  // Utespelare (kan placeras som back eller forward)
  { id: "u-1", number: "0", name: "Fredrik Boström", position: "Utespelare" },
  { id: "u-2", number: "3", name: "Jens Printz", position: "Utespelare" },
  { id: "u-3", number: "16", name: "Hampus Bergman Lahti", position: "Utespelare" },
  { id: "u-4", number: "26", name: "Simon Kättström", position: "Utespelare" },
  { id: "u-5", number: "44", name: "Oskar Brännholm Kvenås", position: "Utespelare" },
  { id: "u-6", number: "54", name: "Andreas Lindström", position: "Utespelare" },
  { id: "u-7", number: "84", name: "Jimmy Andersson", position: "Utespelare" },
  { id: "u-8", number: "95", name: "Christoffer Brännström", position: "Utespelare" },
  { id: "u-9", number: "97", name: "Markus Lundberg", position: "Utespelare" },
  { id: "u-10", number: "", name: "John Andersson Fors", position: "Utespelare" },
  { id: "u-11", number: "", name: "William Bergström", position: "Utespelare" },
  { id: "u-12", number: "", name: "Anton Bergwall", position: "Utespelare" },
  { id: "u-13", number: "", name: "Per Erkki", position: "Utespelare" },
  { id: "u-14", number: "", name: "Robin Flygare", position: "Utespelare" },
  { id: "u-15", number: "", name: "Peter Flymalm", position: "Utespelare" },
  { id: "u-16", number: "", name: "Markus Fältö Kangastie", position: "Utespelare" },
  { id: "u-17", number: "", name: "Alexander Haraldsson", position: "Utespelare" },
  { id: "u-18", number: "", name: "Gustaf Hermansson", position: "Utespelare" },
  { id: "u-19", number: "", name: "Rickard Holmström", position: "Utespelare" },
  { id: "u-20", number: "", name: "Rasmus Häggqvist", position: "Utespelare" },
  { id: "u-21", number: "", name: "Tomas Johansson", position: "Utespelare" },
  { id: "u-22", number: "", name: "Vilmer Johansson Hellgren", position: "Utespelare" },
  { id: "u-23", number: "", name: "Fabian Martinsson", position: "Utespelare" },
  { id: "u-24", number: "", name: "Alexander Mickelsson", position: "Utespelare" },
  { id: "u-25", number: "", name: "Simon Myrestam", position: "Utespelare" },
  { id: "u-26", number: "", name: "Carl-Johan Norrbin", position: "Utespelare" },
  { id: "u-27", number: "", name: "Ludwig Rydén", position: "Utespelare" },
  { id: "u-28", number: "", name: "Teijo Räävi", position: "Utespelare" },
  { id: "u-29", number: "", name: "Johan Sandman", position: "Utespelare" },
  { id: "u-30", number: "", name: "Pierre Schilken", position: "Utespelare" },
  { id: "u-31", number: "", name: "Johan Schols", position: "Utespelare" },
  { id: "u-32", number: "", name: "Johan Ström", position: "Utespelare" },
  { id: "u-33", number: "", name: "Mathias Sundelin", position: "Utespelare" },
  { id: "u-34", number: "", name: "Nils Tomtén Sundström", position: "Utespelare" },
  { id: "u-35", number: "", name: "Simon Wahlberg", position: "Utespelare" },
  { id: "u-36", number: "", name: "David Warnström", position: "Utespelare" },
  { id: "u-37", number: "", name: "Jens Westerberg", position: "Utespelare" },
  { id: "u-38", number: "", name: "Andreas Westerlund", position: "Utespelare" },
  { id: "u-39", number: "", name: "Anton Åberg", position: "Utespelare" },
  { id: "u-40", number: "", name: "Teddie Ögren", position: "Utespelare" },
  // Tränare (listas som utespelare i appen)
  { id: "tr-1", number: "", name: "Linus Carbin", position: "Utespelare" },
  { id: "tr-2", number: "", name: "Christoffer Gran", position: "Utespelare" },
  { id: "tr-3", number: "", name: "Peter Holmberg", position: "Utespelare" },
  { id: "tr-4", number: "", name: "Robert Romanowski", position: "Utespelare" },
];

export function getPositionColor(position: Position): string {
  switch (position) {
    case "Målvakt": return "bg-amber-500/20 border-amber-400/50 text-amber-200";
    case "Back": return "bg-blue-500/20 border-blue-400/50 text-blue-200";
    case "Forward": return "bg-emerald-500/20 border-emerald-400/50 text-emerald-200";
    case "Utespelare": return "bg-slate-500/20 border-slate-400/50 text-slate-200";
  }
}

export function getPositionBadgeColor(position: Position): string {
  switch (position) {
    case "Målvakt": return "bg-amber-500 text-amber-950";
    case "Back": return "bg-blue-500 text-blue-950";
    case "Forward": return "bg-emerald-500 text-emerald-950";
    case "Utespelare": return "bg-slate-400 text-slate-950";
  }
}
