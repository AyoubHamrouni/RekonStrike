"use client";

import { useRef, useState, useCallback } from "react";

export function useAutoScroll({ deps }: { deps: unknown[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollToBottom = useCallback(() => {
    if (!autoScroll) return;
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScroll, ...deps]);

  return { containerRef, autoScroll, setAutoScroll };
}
