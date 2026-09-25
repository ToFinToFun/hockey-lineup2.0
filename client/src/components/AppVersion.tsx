/** Diskret versionsrad, t.ex. "v2.0.0 · 2026-09-25". Sätts automatiskt vid bygget. */
export function AppVersion({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[10px] tracking-wider text-white/20 select-none ${className}`}>
      v{__APP_VERSION__} · {__BUILD_DATE__}
    </p>
  );
}
