export const PROJECTS_LANDING_PAGE_SIZE = 4;

/**
 * @param {unknown[]} items
 * @param {number} page
 * @param {number} [pageSize]
 */
export function paginateList(items, page, pageSize = PROJECTS_LANDING_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(pageSize) || PROJECTS_LANDING_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(list.length / size) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    items: list.slice(start, start + size),
    page: safePage,
    totalPages,
    showPager: list.length > size,
  };
}
