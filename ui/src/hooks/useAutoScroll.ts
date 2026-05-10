import { useState, useEffect, useRef, useCallback } from "react";

interface UseAutoScrollOptions {
  deps: unknown[];
}

export function useAutoScroll({ deps }: UseAutoScrollOptions) {
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll, deps]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  return { containerRef, autoScroll, setAutoScroll, scrollToBottom };
}
