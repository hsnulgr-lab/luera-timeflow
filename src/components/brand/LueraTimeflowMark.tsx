import { useEffect, useRef } from 'react';

interface LueraTimeflowMarkProps {
    /** Wordmark font-size in px. Pill + text scale relative to this. */
    size?: number;
    /** Play the entrance animation. If false, jumps straight to final state. */
    animate?: boolean;
    /**
     * Pill height as a fraction of the wordmark font-size.
     * Design default is 0.38; bump it up for small UI contexts so the
     * "timeflow" label stays legible.
     */
    pillHeightRatio?: number;
    /** "timeflow" text size as a fraction of the pill height. Design default 0.52. */
    textRatio?: number;
    /**
     * Dark variant. Mirrors "Luera LeadFlow Animation.html" (ink zemin):
     * wordmark cream'e döner. Pill turuncu kalır.
     */
    dark?: boolean;
    className?: string;
}

// Module-level flag so the entrance animation only plays once per page load,
// not every time the sidebar collapses/expands and remounts the component.
let hasPlayedOnce = false;

const INK = '#0E0E0E'; // dark wordmark
const ORANGE = '#FF5A1F'; // pill
const CREAM = '#F3ECE0'; // text inside pill

/**
 * Animated "luera" wordmark whose trailing dot blooms into an orange pill
 * containing "timeflow". Mirrors Luera TimeFlow Light Animation.html exactly:
 *   1. wordmark slides up + fades in
 *   2. dot pops (scale 0.3 → 1)
 *   3. dot opens horizontally into a pill
 *   4. "timeflow" fades/slides in
 */
export const LueraTimeflowMark = ({
    size = 28,
    animate = true,
    pillHeightRatio = 0.38,
    textRatio = 0.52,
    dark = false,
    className,
}: LueraTimeflowMarkProps) => {
    const wordmarkColor = dark ? CREAM : INK;
    // Dark sürümde "timeflow" rozet yazısı ink olur (tasarım: ink on orange).
    const badgeTextColor = dark ? INK : CREAM;
    const wmRef = useRef<HTMLSpanElement>(null);
    const badgeRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const wm = wmRef.current;
        const badge = badgeRef.current;
        const btext = textRef.current;
        if (!wm || !badge || !btext) return;

        let cancelled = false;
        const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Measure final pill dimensions from the rendered text.
        const measure = () => {
            const fs = parseFloat(getComputedStyle(wm).fontSize);
            const pillH = fs * pillHeightRatio;
            btext.style.fontSize = pillH * textRatio + 'px';
            btext.style.padding = '0 ' + pillH * 0.38 + 'px';
            btext.style.opacity = '0';
            void btext.offsetWidth;
            const textW = btext.scrollWidth;
            const pillW = Math.max(textW, pillH * 2.6);
            return { pillH, pillW };
        };

        const showFinal = () => {
            const { pillH, pillW } = measure();
            wm.style.transition = 'none';
            wm.style.opacity = '1';
            wm.style.transform = 'translateY(0)';
            badge.style.transition = 'none';
            badge.style.transform = 'scale(1)';
            badge.style.width = pillW + 'px';
            badge.style.height = pillH + 'px';
            btext.style.opacity = '1';
            btext.style.transform = 'translateX(0)';
        };

        const run = async (dotOnly = false) => {
            // reset — keep the wordmark in place when only replaying the dot
            wm.style.transition = 'none';
            wm.style.opacity = dotOnly ? '1' : '0';
            wm.style.transform = dotOnly ? 'translateY(0)' : 'translateY(10px)';
            badge.style.transition = 'none';
            badge.style.transform = 'scale(1)';
            badge.style.width = '0.215em';
            badge.style.height = '0.215em';
            btext.style.opacity = '0';
            btext.style.transform = 'translateX(-4px)';
            void wm.offsetWidth;

            const { pillH, pillW } = measure();
            btext.style.opacity = '0';
            await delay(30);
            if (cancelled) return;

            // 1 — wordmark slides in (skipped on dot-only replay)
            if (!dotOnly) {
                wm.style.transition =
                    'opacity .65s cubic-bezier(.22,.8,.2,1), transform .65s cubic-bezier(.22,.8,.2,1)';
                wm.style.opacity = '1';
                wm.style.transform = 'translateY(0)';
                await delay(700);
                if (cancelled) return;
            }

            // 2 — dot pops
            badge.style.transition = 'none';
            badge.style.transform = 'scale(0.3)';
            void badge.offsetWidth;
            badge.style.transition =
                'transform .38s cubic-bezier(.2,.7,.2,1.4), width .52s cubic-bezier(.4,0,.15,1), height .52s cubic-bezier(.4,0,.15,1)';
            badge.style.transform = 'scale(1)';
            await delay(420);
            if (cancelled) return;

            // 3 — pill opens
            badge.style.width = pillW + 'px';
            badge.style.height = pillH + 'px';
            await delay(520);
            if (cancelled) return;

            // 4 — text appears
            btext.style.opacity = '1';
            btext.style.transform = 'translateX(0)';

            hasPlayedOnce = true;
        };

        const boot = () => {
            const ready =
                (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ??
                Promise.resolve();
            ready.then(() => {
                if (cancelled) return;
                if (animate && !hasPlayedOnce) run();
                else showFinal();
            });
        };

        // Match the design: if the tab is hidden, wait until it's visible so the
        // entrance animation isn't thrown off by background timer throttling.
        let onVisible: (() => void) | null = null;
        if (document.hidden) {
            onVisible = () => {
                if (!document.hidden) {
                    document.removeEventListener('visibilitychange', onVisible!);
                    boot();
                }
            };
            document.addEventListener('visibilitychange', onVisible);
        } else {
            boot();
        }

        // Every 30s replay only the dot → pill → "timeflow" animation; the
        // "luera" wordmark stays put. (Only while the tab is visible so
        // background timer throttling doesn't break the sequence.)
        let replayTimer: ReturnType<typeof setInterval> | null = null;
        if (animate) {
            replayTimer = setInterval(() => {
                if (cancelled || document.hidden) return;
                run(true);
            }, 30000);
        }

        return () => {
            cancelled = true;
            if (onVisible) document.removeEventListener('visibilitychange', onVisible);
            if (replayTimer) clearInterval(replayTimer);
        };
    }, [animate, size, pillHeightRatio, textRatio]);

    return (
        <span
            ref={wmRef}
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'flex-end',
                fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                fontWeight: 900,
                fontSize: size,
                letterSpacing: '-0.045em',
                lineHeight: 0.8,
                whiteSpace: 'nowrap',
                color: wordmarkColor,
                opacity: 0,
                transform: 'translateY(10px)',
                userSelect: 'none',
            }}
        >
            luera
            <span
                ref={badgeRef}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: ORANGE,
                    borderRadius: 999,
                    overflow: 'hidden',
                    width: '0.215em',
                    height: '0.215em',
                    marginLeft: '0.045em',
                    marginBottom: '0.012em',
                    flexShrink: 0,
                }}
            >
                <span
                    ref={textRef}
                    style={{
                        fontSize: 0,
                        fontWeight: 800,
                        color: badgeTextColor,
                        whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em',
                        opacity: 0,
                        transform: 'translateX(-4px)',
                    }}
                >
                    timeflow
                </span>
            </span>
        </span>
    );
};
