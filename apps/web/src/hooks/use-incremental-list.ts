"use client";

import { useState } from "react";

/**
 * Renders long lists in pages ("Mostrar más") so the DOM stays small as data
 * grows. The visible count resets whenever `resetKey` changes (new search,
 * filter or day), so results always start from the top.
 */
export function useIncrementalList<T>(items: T[], resetKey: unknown, pageSize = 50) {
  const [limit, setLimit] = useState(pageSize);
  const [lastKey, setLastKey] = useState(resetKey);
  if (!Object.is(lastKey, resetKey)) {
    // Adjust state during render (React-recommended over an effect)
    setLastKey(resetKey);
    setLimit(pageSize);
  }
  return {
    visible: items.slice(0, limit),
    remaining: Math.max(items.length - limit, 0),
    showMore: () => setLimit((l) => l + pageSize),
  };
}
