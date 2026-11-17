export function Header({ subtitle }: { subtitle: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt text-navy" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17 17 4l3 3L7 20z" />
          <path d="M8 13l1.5 1.5M11 10l1.5 1.5M14 7l1.5 1.5" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-volt">2M elektro</p>
        <h1 className="truncate text-lg font-bold tracking-wide sm:text-xl">Měření telefonem · {subtitle}</h1>
      </div>
    </header>
  );
}
