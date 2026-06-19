/**
 * Class kích thước Home/Landing — Enterprise Design System (figmaHomeClasses.js).
 * Chỉ w/h/p/m/gap/text/leading/max-w/rounded — màu dùng design token hoặc style theo feature.
 */

export const FIGMA_HOME_PAGE = 'mx-auto w-full max-w-[1200px] px-6';

/** Navbar */
export const FIGMA_HOME_NAV = 'sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl';
export const FIGMA_HOME_NAV_INNER = `${FIGMA_HOME_PAGE} flex h-[60px] items-center justify-between`;
export const FIGMA_HOME_NAV_LOGO_ROW = 'flex items-center gap-2.5';
export const FIGMA_HOME_NAV_LOGO_ICON = 'flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-primary shadow-md shadow-primary/45';
export const FIGMA_HOME_NAV_LOGO_TEXT = 'font-display text-[1.0625rem] font-bold tracking-[-0.025em] text-foreground';
export const FIGMA_HOME_NAV_LINKS = 'hidden items-center gap-0.5 md:flex';
export const FIGMA_HOME_NAV_LINK_BTN =
  'rounded-[7px] px-3 py-1.5 text-[0.875rem] font-medium text-muted-foreground vh-transition hover:bg-muted hover:text-foreground';
export const FIGMA_HOME_NAV_ACTIONS = 'flex items-center gap-2';
export const FIGMA_HOME_NAV_ICON_BTN =
  'flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground vh-transition hover:border-border hover:text-foreground';
export const FIGMA_HOME_NAV_LOGIN_LINK =
  'hidden rounded-[7px] px-3 py-2 text-[0.875rem] font-medium text-foreground-secondary vh-transition hover:text-foreground sm:inline-flex';
export const FIGMA_HOME_NAV_CTA =
  'flex h-9 items-center rounded-lg bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground shadow-md shadow-primary/40 vh-btn-press vh-transition hover:bg-primary-hover';

/** Hero */
export const FIGMA_HOME_HERO = `${FIGMA_HOME_PAGE} relative overflow-hidden py-16 text-center sm:py-20 lg:pt-24 lg:pb-20`;
export const FIGMA_HOME_HERO_GLOW_CENTER =
  'pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 -translate-y-[100px] rounded-full bg-primary/[0.18] blur-3xl';
export const FIGMA_HOME_HERO_GLOW_LEFT =
  'pointer-events-none absolute left-[10%] top-48 h-[300px] w-[300px] rounded-full bg-ai/10 blur-3xl';
export const FIGMA_HOME_HERO_GLOW_RIGHT =
  'pointer-events-none absolute right-[10%] top-24 h-[250px] w-[250px] rounded-full bg-success/10 blur-3xl';
export const FIGMA_HOME_HERO_BADGE =
  'mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 py-1.5 pl-2.5 pr-4';
export const FIGMA_HOME_HERO_BADGE_ICON = 'flex h-5 w-5 items-center justify-center rounded-[5px] bg-primary';
export const FIGMA_HOME_HERO_BADGE_TEXT = 'text-[0.8125rem] font-semibold text-[#A5A6F6]';
export const FIGMA_HOME_HERO_TITLE =
  'mb-5 font-display text-[clamp(2.5rem,5.5vw,4.25rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-foreground';
export const FIGMA_HOME_HERO_GRADIENT =
  'bg-gradient-to-br from-primary via-primary to-cyan-400 bg-clip-text text-transparent';
export const FIGMA_HOME_HERO_SUB =
  'mx-auto mb-9 max-w-[640px] text-[clamp(1rem,2vw,1.1875rem)] leading-[1.75] text-muted-foreground';
export const FIGMA_HOME_HERO_CTAS = 'mb-16 flex flex-wrap items-center justify-center gap-3';
export const FIGMA_HOME_HERO_CTA_PRIMARY =
  'inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 text-[0.9375rem] font-semibold text-primary-foreground shadow-lg shadow-primary/45 vh-btn-press vh-transition hover:bg-primary-hover hover:shadow-xl hover:shadow-primary/50';
export const FIGMA_HOME_HERO_CTA_SECONDARY =
  'inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-surface/60 px-7 text-[0.9375rem] font-medium text-foreground-secondary vh-transition hover:border-primary/30 hover:bg-muted';
export const FIGMA_HOME_STATS_GRID =
  'mx-auto grid max-w-[680px] grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4';
export const FIGMA_HOME_STAT_CELL = 'bg-surface px-4 py-5 text-center';
export const FIGMA_HOME_STAT_VALUE = 'font-display text-2xl font-extrabold leading-none tracking-[-0.03em]';
export const FIGMA_HOME_STAT_LABEL = 'mt-1.5 text-xs leading-[1.3] text-muted-foreground';

/** Features */
export const FIGMA_HOME_FEATURES = `${FIGMA_HOME_PAGE} scroll-mt-[72px] py-16 sm:py-20`;
export const FIGMA_HOME_SECTION_HEADER = 'mb-14 text-center';
export const FIGMA_HOME_KICKER =
  'mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1';
export const FIGMA_HOME_KICKER_TEXT = 'text-xs font-semibold uppercase tracking-[0.06em] text-primary';
export const FIGMA_HOME_SECTION_TITLE =
  'mb-3.5 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.025em] text-foreground';
export const FIGMA_HOME_SECTION_SUB = 'mx-auto max-w-[560px] text-[1.0625rem] leading-[1.7] text-muted-foreground';
export const FIGMA_HOME_FEATURE_GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';
export const FIGMA_HOME_FEATURE_CARD =
  'group rounded-2xl border border-border bg-surface/40 p-6 text-left vh-transition hover:-translate-y-0.5 hover:bg-surface/70 hover:shadow-lg motion-reduce:hover:translate-y-0';
export const FIGMA_HOME_FEATURE_ICON_WRAP = 'mb-4 flex items-start justify-between gap-3';
export const FIGMA_HOME_FEATURE_ICON = 'flex h-11 w-11 items-center justify-center rounded-xl border';
export const FIGMA_HOME_FEATURE_TAG = 'rounded-full px-2.5 py-[3px] text-[0.6875rem] font-bold tracking-[0.05em]';
export const FIGMA_HOME_FEATURE_TITLE = 'mb-2 font-display text-base font-semibold text-foreground';
export const FIGMA_HOME_FEATURE_DESC = 'mb-4 text-sm leading-[1.7] text-muted-foreground';
export const FIGMA_HOME_FEATURE_MORE = 'inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold';

/** Live preview embed */
export const FIGMA_HOME_PREVIEW = `${FIGMA_HOME_PAGE} scroll-mt-[72px] pb-16 sm:pb-20`;
export const FIGMA_HOME_PREVIEW_SHELL =
  'overflow-hidden rounded-3xl border border-border bg-surface/90 shadow-xl shadow-primary/10 backdrop-blur-sm';
export const FIGMA_HOME_PREVIEW_HEADER =
  'border-b border-border bg-gradient-to-r from-primary/8 via-transparent to-ai/8 px-6 py-8 sm:px-8';
export const FIGMA_HOME_PREVIEW_TITLE = 'font-display text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight text-foreground';
export const FIGMA_HOME_PREVIEW_SUB = 'mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base';
export const FIGMA_HOME_PREVIEW_BODY = 'grid gap-6 p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-8 lg:p-8';
export const FIGMA_HOME_PREVIEW_STEP =
  'group w-full rounded-xl border px-4 py-3.5 text-left vh-transition sm:px-5';
export const FIGMA_HOME_PREVIEW_PANEL =
  'relative min-h-[400px] overflow-hidden rounded-2xl border border-border bg-background shadow-inner ring-1 ring-border/60 sm:min-h-[480px] lg:min-h-[560px]';

/** Testimonials */
export const FIGMA_HOME_TESTIMONIALS = `${FIGMA_HOME_PAGE} scroll-mt-[72px] py-[60px] sm:pb-20`;
export const FIGMA_HOME_TESTIMONIAL_HEADER = 'mb-10 text-center';
export const FIGMA_HOME_KICKER_SUCCESS =
  'mb-4 inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1';
export const FIGMA_HOME_KICKER_SUCCESS_TEXT = 'text-xs font-semibold uppercase tracking-[0.06em] text-success';
export const FIGMA_HOME_TESTIMONIAL_TITLE =
  'font-display text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-[-0.025em] text-foreground';
export const FIGMA_HOME_TESTIMONIAL_GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
export const FIGMA_HOME_TESTIMONIAL_CARD = 'rounded-2xl border p-6 vh-transition';
export const FIGMA_HOME_TESTIMONIAL_STARS = 'mb-3.5 flex gap-[3px]';
export const FIGMA_HOME_TESTIMONIAL_QUOTE = 'mb-4 text-[0.9rem] italic leading-[1.75] text-foreground-secondary';
export const FIGMA_HOME_TESTIMONIAL_AVATAR =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold';
export const FIGMA_HOME_TESTIMONIAL_NAME = 'text-sm font-semibold text-foreground';
export const FIGMA_HOME_TESTIMONIAL_ROLE = 'text-xs text-muted-foreground';
export const FIGMA_HOME_TESTIMONIAL_DOTS = 'mt-6 flex justify-center gap-1.5';

/** Tech stack */
export const FIGMA_HOME_TECH = `${FIGMA_HOME_PAGE} scroll-mt-[72px] py-[72px] sm:pb-20`;
export const FIGMA_HOME_TECH_CARD =
  'relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-background px-10 py-12 text-center';
export const FIGMA_HOME_TECH_GLOW =
  'pointer-events-none absolute left-1/2 top-[-60px] h-[200px] w-[400px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl';
export const FIGMA_HOME_TECH_KICKER_ROW = 'mb-3 flex items-center justify-center gap-2';
export const FIGMA_HOME_TECH_TITLE = 'mb-2 font-display text-[1.375rem] font-bold text-foreground';
export const FIGMA_HOME_TECH_SUB = 'mb-7 text-[0.9375rem] text-muted-foreground';
export const FIGMA_HOME_TECH_TAGS = 'flex flex-wrap justify-center gap-2.5';
export const FIGMA_HOME_TECH_TAG =
  'rounded-lg border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary vh-transition hover:bg-primary/20';

/** Security */
export const FIGMA_HOME_SECURITY = `${FIGMA_HOME_PAGE} scroll-mt-[72px] py-[72px] sm:pb-20`;
export const FIGMA_HOME_SECURITY_HEADER = 'mb-12 text-center';
export const FIGMA_HOME_KICKER_DANGER =
  'mb-4 inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1';
export const FIGMA_HOME_KICKER_DANGER_TEXT = 'text-xs font-semibold uppercase tracking-[0.06em] text-destructive';
export const FIGMA_HOME_SECURITY_SUB = 'mx-auto max-w-[540px] text-[1.0625rem] leading-[1.7] text-muted-foreground';
export const FIGMA_HOME_SECURITY_GRID = 'mb-10 grid gap-4 md:grid-cols-2';
export const FIGMA_HOME_SECURITY_ITEM = 'rounded-[14px] border border-border bg-surface/30 p-6 vh-transition hover:bg-surface/50';
export const FIGMA_HOME_SECURITY_ICON = 'mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[11px]';
export const FIGMA_HOME_SECURITY_ITEM_TITLE = 'mb-2 text-base font-semibold text-foreground';
export const FIGMA_HOME_SECURITY_ITEM_DESC = 'text-sm leading-[1.7] text-muted-foreground';
export const FIGMA_HOME_SECURITY_BADGES =
  'flex flex-wrap justify-center gap-6 rounded-[14px] border border-border bg-surface/20 p-6';

/** Pricing */
export const FIGMA_HOME_PRICING = `${FIGMA_HOME_PAGE} scroll-mt-[72px] py-[72px] sm:pb-20`;
export const FIGMA_HOME_PRICING_HEADER = 'mb-12 text-center';
export const FIGMA_HOME_PRICING_SUB = 'mx-auto max-w-[500px] text-[1.0625rem] leading-[1.7] text-muted-foreground';
export const FIGMA_HOME_PRICING_GRID = 'grid gap-4 lg:grid-cols-3';
export const FIGMA_HOME_PRICING_CARD = 'relative overflow-hidden rounded-[18px] border p-8 px-7 vh-transition hover:-translate-y-0.5 motion-reduce:hover:translate-y-0';
export const FIGMA_HOME_PRICING_POPULAR_BADGE =
  'absolute right-4 top-4 rounded-full bg-primary px-2.5 py-[3px] text-[0.65rem] font-bold uppercase tracking-[0.06em] text-primary-foreground';
export const FIGMA_HOME_PRICING_PLAN_NAME = 'mb-2 text-[0.8125rem] font-bold uppercase tracking-[0.06em]';
export const FIGMA_HOME_PRICING_PRICE_ROW = 'mb-1.5 flex items-baseline gap-1';
export const FIGMA_HOME_PRICING_PRICE = 'font-display text-[2.25rem] font-extrabold tracking-[-0.04em] text-foreground';
export const FIGMA_HOME_PRICING_PRICE_CONTACT = 'font-display text-2xl font-extrabold tracking-[-0.04em] text-foreground';
export const FIGMA_HOME_PRICING_UNIT = 'text-sm text-muted-foreground';
export const FIGMA_HOME_PRICING_DESC = 'mb-6 text-[0.8125rem] leading-normal text-muted-foreground';
export const FIGMA_HOME_PRICING_FEATURES = 'mb-7 flex flex-col gap-2.5';
export const FIGMA_HOME_PRICING_FEATURE = 'flex items-start gap-2 text-[0.8125rem] leading-normal text-foreground-secondary';
export const FIGMA_HOME_PRICING_CTA =
  'flex w-full items-center justify-center gap-1.5 rounded-[10px] py-[11px] text-[0.9rem] font-semibold vh-transition hover:opacity-90';
export const FIGMA_HOME_PRICING_FOOTNOTE = 'mt-6 text-center text-[0.8125rem] text-muted-foreground';

/** CTA */
export const FIGMA_HOME_CTA = `${FIGMA_HOME_PAGE} pb-16 sm:pb-20`;
export const FIGMA_HOME_CTA_CARD =
  'relative overflow-hidden rounded-[28px] border border-primary/25 bg-gradient-to-br from-sidebar via-background to-background px-6 py-14 text-center sm:px-10 sm:py-16';
export const FIGMA_HOME_CTA_GLOW =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(var(--primary-rgb,37,99,235),0.22),transparent_65%)]';
export const FIGMA_HOME_CTA_TITLE =
  'font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold tracking-[-0.025em] text-foreground';
export const FIGMA_HOME_CTA_BODY = 'mx-auto mb-8 max-w-[480px] text-[1.0625rem] leading-[1.7] text-muted-foreground';
export const FIGMA_HOME_CTA_ACTIONS = 'flex flex-wrap items-center justify-center gap-3';
export const FIGMA_HOME_CTA_BTN_PRIMARY =
  'inline-flex h-[50px] items-center gap-2 rounded-xl bg-primary px-8 text-[0.9375rem] font-semibold text-primary-foreground shadow-lg shadow-primary/50 vh-btn-press vh-transition hover:bg-primary-hover';
export const FIGMA_HOME_CTA_BTN_SECONDARY =
  'inline-flex h-[50px] items-center gap-2 rounded-xl border border-border bg-surface/50 px-8 text-[0.9375rem] font-medium text-foreground-secondary vh-transition hover:bg-muted';
export const FIGMA_HOME_CTA_TRUST = 'mt-8 flex flex-wrap items-center justify-center gap-5';

/** Footer */
export const FIGMA_HOME_FOOTER = 'border-t border-border';
export const FIGMA_HOME_FOOTER_INNER = `${FIGMA_HOME_PAGE} flex flex-col gap-4 py-7 sm:flex-row sm:items-center sm:justify-between`;
export const FIGMA_HOME_FOOTER_LOGO_ROW = 'flex items-center gap-2.5';
export const FIGMA_HOME_FOOTER_LOGO_ICON = 'flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30';
export const FIGMA_HOME_FOOTER_COPY = 'text-[0.875rem] text-muted-foreground';
export const FIGMA_HOME_FOOTER_LINKS = 'flex gap-5';
export const FIGMA_HOME_FOOTER_LINK = 'text-[0.8125rem] text-muted-foreground vh-transition hover:text-foreground-secondary';

/** Feature modal */
export const FIGMA_HOME_MODAL_OVERLAY = 'fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-black/75 p-4 backdrop-blur-sm';
export const FIGMA_HOME_MODAL_CARD =
  'relative w-full max-w-md animate-scaleIn rounded-2xl border border-border bg-surface p-8 shadow-2xl';
export const FIGMA_HOME_MODAL_CLOSE =
  'absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground vh-transition hover:bg-muted hover:text-foreground';
export const FIGMA_HOME_MODAL_ICON = 'mb-5 flex h-14 w-14 items-center justify-center rounded-[14px] border';
export const FIGMA_HOME_MODAL_TITLE_ROW = 'mb-3 flex flex-wrap items-center gap-2';
export const FIGMA_HOME_MODAL_TITLE = 'font-display text-lg font-semibold text-foreground';
export const FIGMA_HOME_MODAL_TAG = 'rounded-full px-2 py-0.5 text-[0.6875rem] font-bold tracking-[0.05em]';
export const FIGMA_HOME_MODAL_DESC = 'mb-5 text-[0.9rem] leading-[1.75] text-muted-foreground';
export const FIGMA_HOME_MODAL_BULLETS = 'flex flex-col gap-2.5';
export const FIGMA_HOME_MODAL_BULLET = 'flex items-center gap-2.5 text-sm text-foreground-secondary';
