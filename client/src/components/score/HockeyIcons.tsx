/** Custom hockey-themed SVG icons for Season Awards */

interface IconProps {
  size?: number;
  className?: string;
}

/** Hockey Puck icon - for Skyttekung (Top Scorer) */
export function HockeyPuck({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <ellipse cx="12" cy="14" rx="9" ry="4.5" fill="currentColor" opacity="0.3" />
      <ellipse cx="12" cy="12" rx="9" ry="4.5" fill="currentColor" opacity="0.6" />
      <ellipse cx="12" cy="10" rx="9" ry="4.5" fill="currentColor" />
      <path d="M3 10v2c0 2.485 4.03 4.5 9 4.5s9-2.015 9-4.5v-2" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}

/** Hockey Stick icon - for Assistkung (Assist Leader) */
export function HockeyStick({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 2L14 18H20L21 22H14L12 18L2 2H4Z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M3 2L13 18H20.5L21.5 21.5H13.5L12 18L2 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M13 18H20.5L21.5 21.5H13.5L13 18Z"
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  );
}

/** Hockey Goal Net icon - for Mr. Clutch (GWG) */
export function HockeyGoalNet({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Goal frame */}
      <path
        d="M2 20V6C2 6 2 4 4 4H20C22 4 22 6 22 6V20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Net lines - vertical */}
      <line x1="7" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="17" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      {/* Net lines - horizontal */}
      <line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="2.5" y1="12" x2="21.5" y2="12" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      {/* Crossbar */}
      <path d="M2 4H22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Puck in net */}
      <ellipse cx="12" cy="19" rx="3" ry="1" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

/** Goalie Mask icon - for Bästa Målvakt (Best Goalkeeper) */
export function GoalieMask({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Mask shape */}
      <path
        d="M12 2C7 2 3 6 3 10V14C3 18 6 22 12 22C18 22 21 18 21 14V10C21 6 17 2 12 2Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Eye holes */}
      <ellipse cx="8.5" cy="10" rx="2.5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="15.5" cy="10" rx="2.5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* Nose bridge */}
      <path d="M11 10V13L12 14L13 13V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Chin guard */}
      <path d="M8 16C8 16 10 18 12 18C14 18 16 16 16 16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {/* Cage bars */}
      <line x1="6" y1="14" x2="18" y2="14" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="7" y1="16.5" x2="17" y2="16.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      {/* Forehead detail */}
      <path d="M7 6C7 6 9.5 5 12 5C14.5 5 17 6 17 6" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}
