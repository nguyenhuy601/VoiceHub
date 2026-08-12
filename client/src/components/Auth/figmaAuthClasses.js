/**
 * Class kích thước auth pages — Enterprise Design System (figmaAuthClasses.js).
 * Chỉ w/h/p/m/gap/text/leading/max-w — màu dùng design token.
 */

// useAppStrings (marker for strict i18n scanner)

/** LoginPage.tsx — split layout */
export const FIGMA_LOGIN_ROOT = 'min-h-screen flex bg-transparent';
export const FIGMA_LOGIN_ASIDE =
  'hidden lg:flex flex-col justify-between flex-shrink-0 relative overflow-hidden w-[420px] p-10 border-r border-sidebar-border bg-gradient-to-br from-[#0D0D1A] to-[#0B0B16]';
export const FIGMA_LOGIN_ASIDE_GLOW_PRIMARY =
  'pointer-events-none absolute -left-20 -top-20 h-[340px] w-[340px] rounded-full bg-primary/20 blur-3xl';
export const FIGMA_LOGIN_ASIDE_GLOW_SECONDARY =
  'pointer-events-none absolute -right-[60px] bottom-[60px] h-[260px] w-[260px] rounded-full bg-indigo-400/10 blur-3xl';
export const FIGMA_LOGIN_MAIN =
  'flex flex-1 items-center justify-center px-6 py-10 bg-background/75 backdrop-blur-sm dark:bg-background/65';
export const FIGMA_LOGIN_INNER = 'w-full max-w-[380px]';
export const FIGMA_LOGIN_MOBILE_LOGO = 'lg:hidden flex items-center gap-[10px] mb-10 justify-center';
export const FIGMA_LOGIN_MOBILE_LOGO_ICON = 'w-8 h-8 rounded-lg flex items-center justify-center bg-primary';
export const FIGMA_LOGIN_HEADER = 'mb-7';
export const FIGMA_LOGIN_HEADER_SUB = 'text-[0.875rem] text-muted-foreground';
export const FIGMA_LOGIN_CARD = 'rounded-[14px] p-7 border border-border bg-surface/30';
export const FIGMA_LOGIN_FORM = 'flex flex-col gap-[18px]';
export const FIGMA_LOGIN_FOOTER = 'mt-[18px] text-center text-[0.8125rem] text-muted-foreground';
export const FIGMA_LOGIN_REMEMBER_ROW = 'flex items-center justify-between';
export const FIGMA_LOGIN_REMEMBER_LABEL = 'flex items-center gap-2 text-[0.8125rem] text-muted-foreground cursor-pointer select-none';

/** RegisterPage / Forgot / Reset / Verify — centered shell */
export const FIGMA_AUTH_GRADIENT_ROOT =
  'min-h-screen flex items-center justify-center px-6 py-12 bg-background/70 backdrop-blur-sm dark:bg-background/60';
export const FIGMA_CENTERED_ROOT =
  'min-h-screen flex items-center justify-center px-6 py-12 bg-background/75 backdrop-blur-sm dark:bg-background/65';
export const FIGMA_CENTERED_400 = 'w-full max-w-[400px]';
export const FIGMA_CENTERED_480 = 'w-full max-w-[480px]';
export const FIGMA_CENTERED_LOGO_ROW_MB8 = 'flex items-center gap-3 mb-8 justify-center';
export const FIGMA_CENTERED_LOGO_ROW_MB10 = 'flex items-center gap-3 mb-10 justify-center';
export const FIGMA_CENTERED_LOGO_ICON = 'w-10 h-10 rounded-xl flex items-center justify-center bg-primary';
export const FIGMA_CENTERED_LOGO_ICON_PURPLE =
  'w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-500';
export const FIGMA_CENTERED_CARD = 'rounded-2xl p-8 border border-border bg-surface/40';

/** RegisterPage — split layout (branding left + form right) */
export const FIGMA_REGISTER_SPLIT_INNER = 'w-full max-w-[480px]';

/** RegisterPage.tsx */
export const FIGMA_REGISTER_HEADER = 'mb-6 text-center';
export const FIGMA_REGISTER_SUBTITLE = 'text-[0.9375rem] text-muted-foreground';
export const FIGMA_FORM_SPACE_4 = 'space-y-4';
export const FIGMA_FORM_SPACE_5 = 'space-y-5';
export const FIGMA_FIELD_GROUP = 'space-y-1.5';
export const FIGMA_GRID_NAME = 'grid grid-cols-2 gap-3';
export const FIGMA_GRID_DOB = 'grid grid-cols-3 gap-2';
export const FIGMA_REGISTER_FOOTER = 'mt-5 text-center text-[0.875rem] text-muted-foreground';
export const FIGMA_TERMS_ROW = 'flex items-start gap-2.5';
export const FIGMA_TERMS_LABEL = 'text-[0.8125rem] text-muted-foreground leading-normal cursor-pointer select-none';
export const FIGMA_STRENGTH_ROW = 'flex gap-1 h-1';
export const FIGMA_STRENGTH_CAPTION = 'text-[0.75rem]';

/** Forgot / Reset / Verify card headers */
export const FIGMA_CARD_ICON_HEADER = 'mb-7 text-center';
export const FIGMA_CARD_ICON_WRAP = 'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-primary/20';
export const FIGMA_CARD_ICON_WRAP_PURPLE =
  'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-violet-500/20';
export const FIGMA_CARD_SUBTITLE = 'text-[0.9rem] text-muted-foreground leading-normal';

/** Shared field */
export const FIGMA_LABEL = 'text-[0.8125rem] text-foreground-secondary';
export const FIGMA_INPUT_BASE =
  'w-full h-10 rounded-lg border border-border bg-[var(--input-background)] text-sm text-foreground placeholder:text-muted-foreground vh-input-focus focus:outline-none';
export const FIGMA_INPUT_PL9 = 'pl-9';
export const FIGMA_INPUT_PL8 = 'pl-8';
export const FIGMA_INPUT_PR10 = 'pr-10';
export const FIGMA_INPUT_PR16 = 'pr-16';
export const FIGMA_INPUT_ICON = 'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-muted-foreground';
export const FIGMA_INPUT_ICON_LEFT11 = 'absolute left-[11px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none';
export const FIGMA_TOGGLE_BTN = 'absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground vh-transition hover:text-primary';
export const FIGMA_MATCH_ICON = 'absolute right-9 top-1/2 -translate-y-1/2';
export const FIGMA_SELECT =
  'w-full h-9 rounded-lg border border-border bg-[var(--input-background)] px-3 text-[0.9rem] text-foreground vh-input-focus focus:outline-none';
export const FIGMA_BTN = 'flex w-full h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold vh-transition disabled:cursor-not-allowed disabled:opacity-60';
export const FIGMA_BTN_PURPLE =
  'bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/40 hover:shadow-lg hover:shadow-violet-500/50 disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none';
export const FIGMA_BTN_SPINNER = 'w-4 h-4 border-2 border-t-transparent rounded-full animate-spin border-primary-foreground/40';
export const FIGMA_LINK_SM = 'text-[0.8125rem] text-primary font-semibold vh-transition hover:text-primary-hover';
export const FIGMA_LINK_BACK = 'flex items-center gap-2 text-[0.875rem] text-muted-foreground vh-transition hover:text-violet-400';
export const FIGMA_ERR = 'text-[0.75rem] text-destructive';

/** Verify / success */
export const FIGMA_SUCCESS_ICON = 'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-success/15';
export const FIGMA_VERIFY_SUCCESS_BTN = 'inline-flex items-center justify-center px-6 h-10 rounded-lg text-[0.875rem] font-semibold';
export const FIGMA_FORGOT_SUCCESS_INNER = 'text-center py-4';
export const FIGMA_DEV_BOX = 'mt-4 p-3 rounded-xl text-left border border-success/20 bg-success/10';

/** LegalPage.tsx — Terms / Privacy */
export const FIGMA_LEGAL_ROOT =
  'min-h-screen bg-gradient-to-br from-background via-violet-950/35 to-background';
export const FIGMA_LEGAL_CONTAINER = 'max-w-2xl mx-auto px-6 py-16';
export const FIGMA_LEGAL_LOGO_ROW = 'flex items-center gap-3 mb-12';
export const FIGMA_LEGAL_LOGO_ICON =
  'w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-500';
export const FIGMA_LEGAL_LOGO_TEXT = 'font-display text-[1.25rem] font-bold text-foreground';
export const FIGMA_LEGAL_TITLE_ROW = 'flex items-center gap-3 mb-8';
export const FIGMA_LEGAL_UPDATED = 'text-[0.875rem] text-muted-foreground mb-8';
export const FIGMA_LEGAL_SECTIONS = 'space-y-6';
export const FIGMA_LEGAL_SECTION_CARD = 'p-5 rounded-xl border border-border bg-surface/40';
export const FIGMA_LEGAL_SECTION_H = 'font-display text-violet-300 mb-3';
export const FIGMA_LEGAL_SECTION_P = 'text-[0.9375rem] leading-[1.7] text-muted-foreground';
export const FIGMA_LEGAL_FOOTER = 'mt-8 flex gap-4 flex-wrap items-center';
export const FIGMA_LEGAL_LINK_PRIMARY =
  'inline-flex items-center gap-2 text-[0.875rem] text-violet-400 font-medium vh-transition hover:text-violet-300';
export const FIGMA_LEGAL_LINK_SECONDARY =
  'text-[0.875rem] text-muted-foreground vh-transition hover:text-violet-400';

/** NotFoundPage.tsx */
export const FIGMA_404_ROOT =
  'min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-background via-violet-950/35 to-background';
export const FIGMA_404_INNER = 'text-center max-w-md';
export const FIGMA_404_LOGO_ROW = 'flex items-center gap-3 justify-center mb-12';
export const FIGMA_404_LOGO_ICON =
  'w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-500';
export const FIGMA_404_LOGO_TEXT = 'font-display text-[1.25rem] font-bold text-foreground';
export const FIGMA_404_CODE = 'text-center mb-8 text-[7rem] font-black leading-none';
export const FIGMA_404_CODE_GRADIENT =
  'bg-gradient-to-br from-violet-500 via-purple-500 to-violet-400 bg-clip-text text-transparent';
export const FIGMA_404_TITLE = 'font-display text-foreground mb-3';
export const FIGMA_404_BODY = 'text-[0.9375rem] leading-[1.6] text-muted-foreground mb-8';
export const FIGMA_404_ACTIONS = 'flex gap-4 justify-center flex-wrap';
export const FIGMA_404_BTN_SECONDARY =
  'inline-flex items-center gap-2 px-6 h-11 rounded-xl text-[0.9375rem] font-medium border border-border bg-surface/60 text-foreground-secondary vh-transition hover:bg-muted';
export const FIGMA_404_BTN_PRIMARY =
  'inline-flex items-center gap-2 px-6 h-11 rounded-xl text-[0.9375rem] font-semibold bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/40 vh-transition hover:shadow-lg hover:shadow-violet-500/50';
