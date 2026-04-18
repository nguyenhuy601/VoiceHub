/**
 * Chuỗi class shell — đồng bộ tông auth (navy + teal / light slate + cyan).
 * Chỉ export chuỗi Tailwind, không logic.
 */

export function appShellBg(isDark) {
  return isDark ? 'bg-[#050810]' : 'bg-[#f5f7fa]';
}

export function navSidebarRail(isDark) {
  return isDark
    ? 'bg-[#101827]/96 backdrop-blur-xl border-r border-slate-700/55'
    : 'bg-white/95 backdrop-blur-xl border-r border-slate-200/90 shadow-[inset_-1px_0_0_rgba(15,23,42,0.05)]';
}

export function navOuterStrip(isDark) {
  return isDark ? 'border-slate-800/80' : 'border-slate-200/90';
}

export function navLogoTile() {
  return 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-900/25';
}

export function navItemActive() {
  return 'bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-900/30';
}

export function navItemInactiveHover(isDark) {
  return isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100';
}

export function navTimeText(isDark) {
  return isDark ? 'text-slate-500' : 'text-slate-500';
}

export function navDivider(isDark) {
  return isDark ? 'bg-white/10' : 'bg-slate-200';
}

export function threeFrameRightPanel(isDark) {
  return isDark
    ? 'bg-[#101827]/92 backdrop-blur-xl border-l border-slate-700/50'
    : 'bg-white/95 backdrop-blur-xl border-l border-slate-200/90';
}

export function tooltipBubble(isDark) {
  return isDark
    ? 'bg-slate-800 border border-slate-600/80 text-white shadow-xl'
    : 'bg-white border border-slate-200 text-slate-900 shadow-xl';
}

export function profileDropdownCard(isDark) {
  return isDark
    ? 'bg-[#151c2c]/98 border border-slate-600/50 shadow-2xl'
    : 'bg-white border border-slate-200/90 shadow-2xl';
}

export function profileDropdownHeader() {
  return 'bg-gradient-to-br from-cyan-600/90 to-teal-700/85';
}

export function profileDropdownBody(isDark) {
  return isDark ? 'bg-[#151c2c] px-4 py-3' : 'bg-slate-50 px-4 py-3';
}

export function profileMenuRow(isDark) {
  return isDark
    ? 'rounded-lg hover:bg-white/5 text-sm text-slate-100'
    : 'rounded-lg hover:bg-slate-100 text-sm text-slate-800';
}
