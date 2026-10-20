import { STAT, type StatKey } from "@shared/statAbbr";

/** Statistikförkortning (NHL) med svensk förklaring när man håller över/trycker. */
export function Abbr({ k, className = "" }: { k: StatKey; className?: string }) {
  return (
    <abbr title={STAT[k]} className={`no-underline cursor-help ${className}`}>
      {k}
    </abbr>
  );
}
