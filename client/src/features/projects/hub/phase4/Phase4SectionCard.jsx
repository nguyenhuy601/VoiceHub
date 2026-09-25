import { PHASE4_SECTION_HEAD, PHASE4_SECTION_SHELL } from './phase4Ui';

/**
 * Soft-blue section card used across Phase 4 tabs.
 */
export default function Phase4SectionCard({ title, description = null, aside = null, children }) {
  return (
    <section className={PHASE4_SECTION_SHELL}>
      <header className={`${PHASE4_SECTION_HEAD} flex flex-wrap items-start justify-between gap-2`}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{aside}</div> : null}
      </header>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}
