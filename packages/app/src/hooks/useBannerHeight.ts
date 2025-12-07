'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook to track banner height and set CSS custom property
 * Returns a ref to attach to the banner element
 * Only the visible banner should use this hook (only one banner visible at a time)
 */
export function useBannerHeight<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const updateHeight = () => {
      if (ref.current) {
        const height = ref.current.offsetHeight;
        document.documentElement.style.setProperty(
          '--banner-height',
          `${height}px`
        );
      }
    };

    // Initial measurement after a brief delay to ensure element is rendered
    const timeoutId = setTimeout(() => {
      updateHeight();
    }, 0);

    // Watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      // Reset to 0 when banner unmounts (only if this was the active banner)
      // Note: This will be set by the newly visible banner if one exists
      document.documentElement.style.setProperty('--banner-height', '0px');
    };
  }, []);

  return ref;
}
