import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './opportunityWheel.css';

// ── Fırsat çarkı ─────────────────────────────────────────────────────────────
// Tasarım: Claude Design · "Luera Fırsat Modülü v2.html" (birebir uygulandı).
//
// Kayıtlar dikey bir çarkta durur. Ortadaki bant seçili kaydı tutar; üst ve
// alttaki kayıtlar perspektifle yatıp soluklaşır. Aksiyon butonu çarkın DIŞINDA
// sabit durur — ortadaki kayda göre etiketi/rengi değişir, böylece 44px dokunma
// hedefi kaymaz. Çark 96px, kart 130px içinde kalır.
//
// iOS UIPickerView'ın aksine bu bir SEÇİM kontrolü değil: aksiyon her zaman tek
// tık uzakta, kaydırma yalnız kayıtlar arasında gezinmek için.

export type OpportunityKind = 'pkg' | 'gift' | 'conf' | 'plan' | 'lost';

export interface Opportunity {
    id: string;
    kind: OpportunityKind;
    /** Rozet metni: "Paket bitti" */
    label: string;
    /** Müşteri adı */
    name: string;
    /** Bağlam satırı — sayılar <b> ile mono görünür */
    context: ReactNode;
    actionLabel: string;
    /** wa = turuncu (WhatsApp'a çıkan aksiyonlar), ink = koyu */
    actionKind: 'wa' | 'ink';
    disabled?: boolean;
    run: () => void | Promise<void>;
}

const RAIL: Record<OpportunityKind, string> = {
    pkg: 'var(--dc-orange)',
    gift: 'var(--dc-green)',
    conf: 'var(--dc-amber)',
    plan: 'var(--dc-blue)',
    lost: 'var(--dc-red)',
};

// Tasarımdaki ikonlar — birebir aynı path'ler.
const IconWa = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 4.9 4.9 0 001 2.6 11 11 0 004.2 3.7c1.5.6 2 .6 2.7.6a2.4 2.4 0 001.6-1.1 2 2 0 00.1-1.1z" /></svg>
);
const IconCheck = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
);
const IconCal = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M12 15v4M10 17h4" /></svg>
);
const IconGift = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg>
);

const ICON: Record<OpportunityKind, () => ReactNode> = {
    pkg: IconWa, gift: IconGift, conf: IconCheck, plan: IconCal, lost: IconWa,
};

const ROW_H = 32;

export function OpportunityWheel({ items, busy, onAct }: {
    items: Opportunity[];
    /** Aksiyonu süren kaydın id'si — buton kilitlenir */
    busy?: string | null;
    onAct: (op: Opportunity) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const rowsRef = useRef<(HTMLButtonElement | null)[]>([]);
    const settleRef = useRef<number | undefined>(undefined);
    const pitchRef = useRef(ROW_H);
    const [cur, setCur] = useState(0);

    // Kaydırmaya bağlı çizim: her satır merkeze uzaklığına göre yatar, küçülür
    // ve soluklaşır. Prototipteki katsayılar birebir korundu.
    const paint = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const pitch = pitchRef.current || ROW_H;
        const p = track.scrollTop / pitch;
        rowsRef.current.forEach((el, n) => {
            if (!el) return;
            const d = n - p;
            const ad = Math.abs(d);
            el.style.transform = `rotateX(${Math.max(-70, Math.min(70, d * -34))}deg) scale(${1 - Math.min(.22, ad * .09)})`;
            el.style.opacity = String(Math.max(.18, 1 - ad * .46));
            el.style.filter = ad > .5 ? 'saturate(.45)' : 'none';
        });
        const idx = Math.max(0, Math.min(items.length - 1, Math.round(p)));
        setCur((prev) => (prev === idx ? prev : idx));
    }, [items.length]);

    const goTo = useCallback((n: number) => {
        const track = trackRef.current;
        if (!track) return;
        track.scrollTop = Math.max(0, Math.min(items.length - 1, n)) * (pitchRef.current || ROW_H);
        paint();
    }, [items.length, paint]);

    // Ölçüm + ilk konum. Yazı tipleri geç yüklenirse satır yüksekliği değişebilir,
    // prototipteki gibi 60ms sonra bir kez daha ölçülür.
    useEffect(() => {
        const measure = () => {
            const rows = rowsRef.current;
            pitchRef.current = (rows.length > 1 && rows[0] && rows[1]
                ? rows[1]!.offsetTop - rows[0]!.offsetTop
                : ROW_H) || ROW_H;
        };
        measure();
        goTo(0);
        const t = window.setTimeout(() => { measure(); goTo(0); }, 60);
        return () => window.clearTimeout(t);
    }, [items.length, goTo]);

    // Serbest bırakınca en yakın kayda otur
    const onScroll = useCallback(() => {
        paint();
        window.clearTimeout(settleRef.current);
        settleRef.current = window.setTimeout(() => {
            const track = trackRef.current;
            if (!track) return;
            goTo(Math.round(track.scrollTop / (pitchRef.current || ROW_H)));
        }, 110);
    }, [paint, goTo]);

    useEffect(() => () => window.clearTimeout(settleRef.current), []);

    // Kuyruk boşalınca modül tamamen kaybolur — kart sade hâline döner.
    if (items.length === 0) return null;

    const active = items[Math.min(cur, items.length - 1)];
    const Icon = ICON[active.kind];

    return (
        <div className="opp-mod" style={{ '--opp-rail': RAIL[active.kind] } as React.CSSProperties}>
            <div className="opp-pick">
                <div className="opp-band" />
                <div className="opp-track" ref={trackRef} onScroll={onScroll}>
                    <div className="opp-pad" />
                    {items.map((op, n) => (
                        <button
                            type="button"
                            key={op.id}
                            className="opp-row"
                            ref={(el) => { rowsRef.current[n] = el; }}
                            aria-current={n === cur}
                            onClick={() => { window.clearTimeout(settleRef.current); goTo(n); }}
                        >
                            <span className={`opp-badge opp-t-${op.kind}`}><i />{op.label}</span>
                            <span className="opp-nm">{op.name}</span>
                            <span className="opp-ctx">{op.context}</span>
                        </button>
                    ))}
                    <div className="opp-pad" />
                </div>
            </div>
            <div className="opp-right">
                <span className="opp-count">{Math.min(cur, items.length - 1) + 1}/{items.length}</span>
                <button
                    type="button"
                    className={`opp-act ${active.actionKind}`}
                    disabled={active.disabled || busy === active.id}
                    title={active.disabled ? 'Müşterinin telefonu kayıtlı değil' : undefined}
                    onClick={() => onAct(active)}
                >
                    <Icon />{busy === active.id ? '…' : active.actionLabel}
                </button>
            </div>
        </div>
    );
}
