import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildGridTemplate,
  clampColWidth,
  readStoredColumnWidths,
  widthsFromColumns,
  writeStoredColumnWidths,
} from './resizableTableColumns';

/**
 * Cột CSS grid co giãn — persist localStorage.
 * Cột `resizable: false` vẫn có width cố định, không hiện handle.
 */
const RESIZE_EDGE_PAD_PX = 8;

export function useResizableTableColumns({
  storageKey = '',
  columns = [],
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  containerRef = null,
} = {}) {
  const colsRef = useRef(columns);
  colsRef.current = columns;

  const [widths, setWidths] = useState(() =>
    widthsFromColumns(columns, readStoredColumnWidths(storage, storageKey))
  );

  useEffect(() => {
    setWidths(widthsFromColumns(colsRef.current, readStoredColumnWidths(storage, storageKey)));
  }, [storageKey, storage]);

  useEffect(() => {
    writeStoredColumnWidths(storage, storageKey, widths);
  }, [widths, storageKey, storage]);

  const gridTemplateColumns = useMemo(
    () => buildGridTemplate(columns, widths),
    [columns, widths]
  );

  const minWidthPx = useMemo(
    () => (columns || []).reduce((sum, col) => sum + (widths[col.id] || col.defaultPx || 0), 0),
    [columns, widths]
  );

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns,
      minWidth: minWidthPx,
    }),
    [gridTemplateColumns, minWidthPx]
  );

  const resizeColumn = useCallback((id, nextPx, maxPx) => {
    setWidths((prev) => {
      const col = (colsRef.current || []).find((c) => c.id === id);
      if (!col || col.resizable === false) return prev;
      const next = clampColWidth(nextPx, col.minPx, maxPx);
      if (prev[id] === next) return prev;
      return { ...prev, [id]: next };
    });
  }, []);

  const onResizeStart = useCallback(
    (id, event) => {
      const col = (colsRef.current || []).find((c) => c.id === id);
      if (!col || col.resizable === false) return;
      const startX = event.clientX;
      const startW = widths[id] ?? col.defaultPx;
      const handleEl = event.currentTarget;
      const headerCell = handleEl?.parentElement || handleEl;
      const cellLeft = headerCell?.getBoundingClientRect?.().left;
      const containerRight =
        containerRef?.current?.getBoundingClientRect?.().right ?? window.innerWidth;
      const maxPx =
        Number.isFinite(cellLeft)
          ? Math.max(col.minPx || 16, containerRight - cellLeft - RESIZE_EDGE_PAD_PX)
          : Infinity;
      event.preventDefault();
      event.stopPropagation();

      const onMove = (e) => {
        resizeColumn(id, startW + (e.clientX - startX), maxPx);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [resizeColumn, widths, containerRef]
  );

  return { widths, gridStyle, gridTemplateColumns, onResizeStart, resizeColumn };
}
