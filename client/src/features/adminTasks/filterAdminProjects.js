/**
 * Client-side filter for Admin «Tổng quan Project» list.
 * @param {object[]} list
 * @param {{ q?: string, status?: string }} [filters]
 * @returns {object[]}
 */
export function filterAdminProjects(list, { q = '', status = '' } = {}) {
  const query = String(q || '')
    .trim()
    .toLowerCase();
  const statusFilter = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return (Array.isArray(list) ? list : []).filter((p) => {
    if (!p || p.isActive === false) return false;
    const projectStatus = String(p?.status || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (statusFilter && projectStatus !== statusFilter) return false;
    if (!query) return true;
    const title = String(p?.title || p?.name || '')
      .trim()
      .toLowerCase();
    const code = String(p?.projectCode || '')
      .trim()
      .toLowerCase();
    const id = String(p?._id || p?.projectId || p?.id || '')
      .trim()
      .toLowerCase();
    return title.includes(query) || code.includes(query) || id.includes(query);
  });
}
