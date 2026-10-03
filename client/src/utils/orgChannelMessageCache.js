/**
 * Ghi tin vào infinite-query GET /messages (org channel).
 * State local mất khi rời /app/company/chat; cache RQ giữ tin khi quay lại (trong staleTime).
 */

function messageRowId(row) {
  return String(row?._id || row?.id || '').trim();
}

/**
 * @param {object|undefined} prev — shape useInfiniteQuery { pages, pageParams }
 * @param {object} message
 */
export function upsertOrgChannelMessageInInfiniteData(prev, message) {
  const id = messageRowId(message);
  if (!id || !message) return prev;

  if (!prev?.pages?.length) {
    return {
      pages: [{ messages: [message], nextPageToken: null, hasMore: false }],
      pageParams: [undefined],
    };
  }

  let found = false;
  const pages = prev.pages.map((page) => {
    const messages = (page.messages || []).map((row) => {
      if (messageRowId(row) !== id) return row;
      found = true;
      return { ...row, ...message };
    });
    return { ...page, messages };
  });

  if (found) return { ...prev, pages };

  const [first, ...rest] = pages;
  return {
    ...prev,
    pages: [{ ...first, messages: [...(first.messages || []), message] }, ...rest],
  };
}

export function removeOrgChannelMessageFromInfiniteData(prev, messageId) {
  const id = String(messageId || '').trim();
  if (!id || !prev?.pages?.length) return prev;
  return {
    ...prev,
    pages: prev.pages.map((page) => ({
      ...page,
      messages: (page.messages || []).filter((row) => messageRowId(row) !== id),
    })),
  };
}
