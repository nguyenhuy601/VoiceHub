/**
 * Phase 1 table palette — soft light-blue chrome (thead slightly deeper than toolbar).
 */
export const PHASE1_TABLE_COLORS = Object.freeze({
  /** Soft sky toolbar / page wash */
  toolbar: 'bg-[#E8F4FC]',
  toolbarDark: 'dark:bg-slate-800/90',
  /**
   * Column header — light blue, only a bit deeper than toolbar so it separates
   * without going charcoal/teal-dark. Text stays dark for contrast.
   */
  thead: 'bg-[#C9DFF0]',
  theadDark: 'dark:bg-sky-900/55',
  theadText: 'text-[#1E3A4C]',
  theadBorder: 'border-[#A8C8DE]',
  /** Add CTA */
  primaryBtn: 'bg-[#1677FF] text-white hover:bg-[#0958D9]',
  /** Body zebra */
  rowEven: 'bg-white',
  rowOdd: 'bg-[#F5F7FA]',
  rowHover: 'hover:bg-[#E6F4FF]',
  rowBorder: 'border-[#E8E8E8]',
  /** Priority: solid fill + white text */
  priorityHigh: 'bg-[#FA8C16] text-white border-transparent',
  priorityCritical: 'bg-[#CF1322] text-white border-transparent',
  priorityMedium: 'bg-[#FAAD14] text-white border-transparent',
  priorityLow: 'bg-[#8C8C8C] text-white border-transparent',
  /** CR/FR key chips */
  keyChip:
    'rounded border border-[#D9D9D9] bg-[#FAFAFA] px-1.5 py-0.5 font-mono text-[10px] text-[#262626]',
});
