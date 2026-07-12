import { useState, useEffect, useRef } from 'react';
import { T, STS_BG } from '../theme';
import { useTicker } from '../hooks';

export { useTicker };

// ── Tasarım token'ları — artık uygulama genelindeki tema sistemine (T, CSS
// değişkenleri) bağlı; koyu/açık geçişi ThemeProvider'daki global toggle ile
// otomatik olur (design_handoff_personel_hizmet_light ile birebir eşlenmiştir).
export const D = {
    bg: T.bg, s1: T.surface, s2: T.surface2, s3: T.surface3,
    border: T.border, border2: T.border2,
    ink: T.ink, muted: T.muted, muted2: T.muted2, muted3: T.muted3,
    orange: T.orange, orangeD: T.orangeD, green: T.green, blue: T.blue, amber: T.amber, purple: T.purple, red: T.red,
    font: T.font, mono: T.mono,
    overlay: T.overlay, chipBg: T.chipBg, hero1: T.hero1, hero2: T.hero2, orb1: T.orb1, orb2: T.orb2,
    greenBorder: T.greenBorder, redBorder: T.redBorder, btnInkBg: T.btnInkBg,
} as const;

export const fmtNum = (n: number) => n.toLocaleString('tr-TR');
export const fmtTimer = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export const STS: Record<string, { lbl: string; c: string; bg: string }> = {
    done: { lbl: 'Tamamlandı', c: D.green, bg: STS_BG.completed },
    upcoming: { lbl: 'Onaylandı', c: D.blue, bg: STS_BG.confirmed },
    inService: { lbl: 'Devam ediyor', c: D.orange, bg: 'rgba(255,90,31,.12)' },
    pending: { lbl: 'Onay bekliyor', c: D.amber, bg: STS_BG.pending },
    cancelled: { lbl: 'İptal', c: D.red, bg: STS_BG.cancelled },
};

// Animasyon keyframe'leri — bir kez enjekte edilir (inline style'lar bunlara referans verir)
const ANIM = `
@keyframes lz-fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes lz-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.55)}}
@keyframes lz-ripple{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.2);opacity:0}}
@keyframes lz-floatOrb1{0%,100%{transform:translate(0,0)}40%{transform:translate(30px,20px)}75%{transform:translate(-14px,28px)}}
@keyframes lz-floatOrb2{0%,100%{transform:translate(0,0)}35%{transform:translate(-22px,15px)}70%{transform:translate(18px,-20px)}}
@keyframes lz-arrowHint{0%,100%{opacity:.35;transform:translateX(0)}50%{opacity:.9;transform:translateX(5px)}}
@keyframes lz-thumbGlow{0%,100%{box-shadow:0 4px 20px rgba(255,90,31,.45)}50%{box-shadow:0 4px 32px rgba(255,90,31,.80)}}
@keyframes lz-checkDraw{to{stroke-dashoffset:0}}
@keyframes lz-progressFill{from{width:0}}
`;

export function HizmetKeyframes() {
    useEffect(() => {
        if (document.getElementById('luera-hizmet-anim')) return;
        const el = document.createElement('style');
        el.id = 'luera-hizmet-anim';
        el.textContent = ANIM;
        document.head.appendChild(el);
    }, []);
    return null;
}

// ── Slide-to-Start (iOS "slide to answer" deseni) ──
// onComplete false dönerse (örn. DB yazımı başarısız oldu) sürgü sıfırlanır —
// aksi hâlde swipe "tamamlandı" görünüp donuk kalır, ekran hiç geçiş yapmaz
// ama kullanıcı işlemin aslında başarısız olduğunu fark edemez.
export function SlideToStart({ onComplete, label = 'Hizmete Başla' }: { onComplete: () => void | boolean | Promise<void | boolean>; label?: string }) {
    const [dragX, setDragX] = useState(0);
    const [dragging, setDrag] = useState(false);
    const [done, setDone] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const startRef = useRef(0);
    const THUMB = 56, PAD = 5;

    const maxX = () => (trackRef.current?.offsetWidth || 330) - THUMB - PAD * 2;
    const pct = () => (maxX() > 0 ? dragX / maxX() : 0);

    const begin = (cx: number) => { setDrag(true); startRef.current = cx - dragX; };
    const move = (cx: number) => { if (!dragging) return; setDragX(Math.min(Math.max(0, cx - startRef.current), maxX())); };
    const end = () => {
        if (!dragging) return;
        setDrag(false);
        if (dragX >= maxX() * 0.82) {
            setDone(true); setDragX(maxX());
            setTimeout(async () => {
                const result = await onComplete();
                if (result === false) { setDone(false); setDragX(0); }
            }, 380);
        } else setDragX(0);
    };

    useEffect(() => {
        if (!dragging) return;
        const mm = (e: MouseEvent) => move(e.clientX);
        const mu = () => end();
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
        return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragging, dragX]);

    const p = pct();
    const transition = dragging ? 'none' : 'all .42s cubic-bezier(.2,.8,.2,1)';

    return (
        <div ref={trackRef} style={{
            position: 'relative', height: THUMB + PAD * 2, borderRadius: 20,
            background: `rgba(255,90,31,${0.12 + p * 0.18})`,
            border: `1.5px solid rgba(255,90,31,${0.28 + p * 0.45})`,
            overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none',
            boxShadow: `0 0 0 ${4 + p * 8}px rgba(255,90,31,${0.04 + p * .10})`,
            transition: dragging ? 'none' : 'box-shadow .3s',
        }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: PAD + THUMB + dragX, background: 'linear-gradient(90deg,rgba(255,90,31,.50),rgba(255,90,31,.18))', borderRadius: 20, transition }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none', opacity: done ? 0 : 1 - p * 1.2, transition: 'opacity .2s' }}>
                <span style={{ fontSize: 14.5, fontWeight: 780, color: 'rgba(255,255,255,.85)', letterSpacing: '-.01em', paddingLeft: THUMB * 0.6 }}>{label}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                        <svg key={i} width="6" height="11" viewBox="0 0 6 11" fill="none" style={{ animation: `lz-arrowHint 1.4s ${i * .18}s ease-in-out infinite` }}>
                            <path d="M1 1l4 4.5L1 10" stroke="rgba(255,255,255,.5)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ))}
                </div>
            </div>
            <div
                onMouseDown={(e) => begin(e.clientX)}
                onTouchStart={(e) => { begin(e.touches[0].clientX); }}
                onTouchMove={(e) => { e.preventDefault(); move(e.touches[0].clientX); }}
                onTouchEnd={end}
                style={{
                    position: 'absolute', left: PAD + dragX, top: PAD, width: THUMB, height: THUMB, borderRadius: 16, zIndex: 2,
                    background: done ? D.green : 'linear-gradient(145deg,#FF7040,#E84010)',
                    display: 'grid', placeItems: 'center', cursor: dragging ? 'grabbing' : 'grab',
                    boxShadow: `0 4px 22px rgba(255,90,31,${0.50 + p * 0.35})`,
                    transition: dragging ? 'none' : 'left .42s cubic-bezier(.2,.8,.2,1), background .3s',
                    animation: dragging || done ? 'none' : 'lz-thumbGlow 2s ease-in-out infinite',
                    touchAction: 'none',
                }}
            >
                {done
                    ? <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l5.5 5.5L18 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 2l10 6-10 6V2z" fill="#fff" /></svg>}
            </div>
        </div>
    );
}
