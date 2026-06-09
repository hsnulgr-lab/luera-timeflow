import { useEffect, useRef, useState } from 'react';

/**
 * Luera TimeFlow — Karşılama animasyonu
 * Sadece login sonrası 1 kez çalışır (~4s), sonra onDone() çağrılır.
 *
 * Animasyon sırası (tasarım: Luera TimeFlow Light Animation.html):
 *   0ms  → sahne görünür (cream bg)
 *  30ms  → "luera" wordmark kayarak yukarı gelir (0.65s)
 * 930ms  → turuncu nokta spring pop (0.38s)
 * 1390ms → nokta yatay olarak pill'e açılır (0.52s)
 * 1950ms → "timeflow" yazısı soldan kayarak girer (0.35s)
 * 3800ms → tüm sahne cream'e fade-out (0.6s)
 * 4400ms → onDone() → dashboard
 */

interface Props { onDone: () => void; }

export function SplashScreen({ onDone }: Props) {
  const wmRef    = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const btextRef = useRef<HTMLSpanElement>(null);

  // Measured pill dimensions
  const [pillW, setPillW]   = useState<number | null>(null);
  const [pillH, setPillH]   = useState<number | null>(null);

  // Animation step flags
  const [wmIn,       setWmIn]       = useState(false);  // wordmark visible
  const [dotPop,     setDotPop]     = useState(false);  // dot spring scale
  const [pillOpen,   setPillOpen]   = useState(false);  // badge → pill
  const [textIn,     setTextIn]     = useState(false);  // timeflow text
  const [fadeOut,    setFadeOut]    = useState(false);  // whole stage fades

  useEffect(() => {
    // Measure text dimensions after first render
    const measure = () => {
      if (!wmRef.current || !btextRef.current) return;
      const fs = parseFloat(getComputedStyle(wmRef.current).fontSize);
      const ph = fs * 0.38;
      // Temporarily reveal text to measure width
      btextRef.current.style.fontSize  = `${ph * 0.52}px`;
      btextRef.current.style.padding   = `0 ${ph * 0.38}px`;
      btextRef.current.style.opacity   = '0';
      const tw = btextRef.current.scrollWidth;
      const pw = Math.max(tw, ph * 2.6);
      setPillH(ph);
      setPillW(pw);
    };

    // Wait for fonts to load then start
    const timers: ReturnType<typeof setTimeout>[] = [];

    document.fonts.ready.then(() => {
      measure();
      timers.push(
        setTimeout(() => setWmIn(true),     30),
        setTimeout(() => setDotPop(true),   930),
        setTimeout(() => setPillOpen(true), 1390),
        setTimeout(() => setTextIn(true),   1950),
        setTimeout(() => setFadeOut(true),  3400),
        setTimeout(() => onDone(),          4100),
      );
    });

    // Cleanup: component unmount'ta timer'ları iptal et
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dot size = 0.215em of wordmark font-size
  const dotEm = '0.215em';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@700;800;900&display=swap');
        @keyframes dotPop {
          0%   { transform: scale(0.25); }
          55%  { transform: scale(1.18); }
          80%  { transform: scale(0.93); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Full-screen cream stage */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#F3ECE0',
        display: 'grid', placeItems: 'center',
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? 'opacity 0.65s cubic-bezier(.4,0,.2,1)' : 'none',
        pointerEvents: 'all',
      }}>
        {/* Wordmark + badge */}
        <span
          ref={wmRef}
          style={{
            display: 'inline-flex',
            alignItems: 'flex-end',
            fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(72px, 10vw, 148px)',
            letterSpacing: '-0.045em',
            lineHeight: 0.80,
            whiteSpace: 'nowrap',
            color: '#0E0E0E',
            // entrance animation
            opacity:   wmIn ? 1 : 0,
            transform: wmIn ? 'translateY(0)' : 'translateY(10px)',
            transition: wmIn
              ? 'opacity 0.65s cubic-bezier(.22,.8,.2,1), transform 0.65s cubic-bezier(.22,.8,.2,1)'
              : 'none',
          }}
        >
          luera
          {/* Orange badge — starts as the dot, morphs to pill */}
          <span
            ref={badgeRef}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#FF5A1F',
              borderRadius: 999,
              overflow: 'hidden',
              flexShrink: 0,
              marginLeft: '0.045em',
              marginBottom: '0.012em',
              // size
              width:  pillOpen && pillW ? `${pillW}px` : dotEm,
              height: pillOpen && pillH ? `${pillH}px` : dotEm,
              // pop animation on dot stage
              animation: dotPop && !pillOpen ? 'dotPop 0.42s cubic-bezier(.2,.7,.2,1.4) forwards' : 'none',
              // smooth pill expansion
              transition: pillOpen
                ? 'width 0.52s cubic-bezier(.4,0,.15,1), height 0.52s cubic-bezier(.4,0,.15,1)'
                : 'none',
            }}
          >
            {/* "timeflow" text inside pill */}
            <span
              ref={btextRef}
              style={{
                fontWeight: 800,
                color: '#0E0E0E',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
                // size set by measure() via style attr, but also set here as fallback
                fontSize:   pillH ? `${pillH * 0.52}px` : 0,
                padding:    pillH ? `0 ${pillH * 0.38}px` : 0,
                // fade + slide in
                opacity:   textIn ? 1 : 0,
                transform: textIn ? 'translateX(0)' : 'translateX(-4px)',
                transition: textIn
                  ? 'opacity 0.35s cubic-bezier(.22,.8,.2,1), transform 0.35s cubic-bezier(.22,.8,.2,1)'
                  : 'none',
              }}
            >
              timeflow
            </span>
          </span>
        </span>
      </div>
    </>
  );
}
