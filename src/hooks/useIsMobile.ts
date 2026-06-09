import { useState, useEffect } from 'react';

/**
 * Ekran genişliği verilen eşiğin altındaysa true döner.
 * Inline-style ile yazılmış sayfalarda mobil/masaüstü ayrımı için kullanılır.
 * @param breakpoint px cinsinden eşik (varsayılan 768 = tablet altı)
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
