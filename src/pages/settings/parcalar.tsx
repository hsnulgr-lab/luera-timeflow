/**
 * Ayarlar — ortak parçalar (tasarım: "Luera Masaustu - Ayarlar v1.1").
 *
 * Simge seti tasarımın kendi sembolleri: 1.8 çizgi, yuvarlak uç. Kök bileşen
 * (`AyarlarKabuk`) `<AyIkonlar />`'ı bir kez çizer, her yer `<I n="…" />` ile
 * kullanır. İki kez çizilirse aynı `id` iki kez olurdu — bu yüzden kökte.
 */
import { useEffect, type ReactNode } from 'react';
import { useSwitchSave } from './useSwitchSave';
export type { SwitchStatus } from './useSwitchSave';
import type { SaveState } from './useTaslak';

const PATHS: Record<string, string> = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    chl: '<path d="M15 5l-7 7 7 7"/>', chr: '<path d="M9 5l7 7-7 7"/>', chd: '<path d="M5 9l7 7 7-7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    minus: '<path d="M5 12h14"/>',
    wa: '<path d="M4.5 19.5l1.2-3.8a8 8 0 1 1 2.7 2.6z"/>',
};

const APPLE = 'M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z';

export function AyIkonlar() {
    let s = '';
    for (const [k, d] of Object.entries(PATHS)) {
        s += `<symbol id="ay-i-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`;
    }
    s += `<symbol id="ay-i-apple" viewBox="0 0 24 24"><path fill="currentColor" d="${APPLE}"/></symbol>`;
    return (
        <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0 }}
            dangerouslySetInnerHTML={{ __html: `<defs>${s}</defs>` }} />
    );
}

export function I({ n, size, style }: { n: string; size?: number; style?: React.CSSProperties }) {
    return (
        <svg className="ay-i" aria-hidden="true" style={size ? { width: size, height: size, ...style } : style}>
            <use href={`#ay-i-${n}`} />
        </svg>
    );
}

export function Dots({ small }: { small?: boolean }) {
    return <span className={small ? 'ay-dots sm' : 'ay-dots'} aria-hidden="true"><i /><i /><i /></span>;
}

// ── Başlıklar ───────────────────────────────────────────────────────────────

export function Head({ title, lead, large }: { title: ReactNode; lead?: ReactNode; large?: boolean }) {
    return (
        <div className={large ? 'ay-head big' : 'ay-head'}>
            <h1 className="ay-h1">{title}</h1>
            {lead && <p className="ay-lead">{lead}</p>}
        </div>
    );
}

export function Tag({ children }: { children: ReactNode }) {
    return <span className="ay-tag">{children}</span>;
}

/** Etiket sütunu: ad · açıklama · "nerede görünür" rozetleri. */
export function RowLabel({ label, help, tags, htmlFor, narrow }: {
    label: ReactNode; help?: ReactNode; tags?: string[]; htmlFor?: string; narrow?: boolean;
}) {
    return (
        <div className={narrow ? 'ay-row-l narrow' : 'ay-row-l'}>
            {htmlFor ? <label className="ay-lbl" htmlFor={htmlFor}>{label}</label> : <span className="ay-lbl">{label}</span>}
            {help && <span className="ay-help">{help}</span>}
            {tags && tags.length > 0 && <div className="ay-tags">{tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>}
        </div>
    );
}

// ── Anahtar ─────────────────────────────────────────────────────────────────

export function Switch({ checked, label, onChange, disabled, busy }: {
    checked: boolean; label: string; onChange?: () => void; disabled?: boolean; busy?: boolean;
}) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label}
            aria-disabled={disabled || undefined} aria-busy={busy || undefined}
            className="ay-switch" onClick={() => { if (!disabled && !busy) onChange?.(); }} />
    );
}

/** Anahtar satırı: başlık · açıklama · (Kaydedildi) · Açık/Kapalı · anahtar. */
export function SwitchRow({ title, desc, value, onSave, disabled, lockNote, large, titleClass, descLarge, extra }: {
    title: string; desc?: ReactNode; value: boolean; onSave: (next: boolean) => Promise<boolean>;
    disabled?: boolean; lockNote?: ReactNode; large?: boolean; titleClass?: string; descLarge?: boolean; extra?: ReactNode;
}) {
    const sw = useSwitchSave();
    const shown = sw.pending ?? value;
    return (
        <div className={large ? 'ay-swrow big' : 'ay-swrow'}>
            <div className="ay-swrow-t">
                <b className={titleClass}>{title}</b>
                {sw.status === 'error'
                    ? <span className="err" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>
                    : desc && <span className={descLarge ? 'big' : undefined}>{desc}</span>}
                {lockNote && <span className="lock"><I n="lock" />{lockNote}</span>}
                {extra}
            </div>
            {sw.status === 'saved' && <span className="ay-saved" role="status"><I n="check" />Kaydedildi</span>}
            <span className="ay-state">{shown ? 'Açık' : 'Kapalı'}</span>
            <Switch checked={shown} label={title} disabled={disabled} busy={sw.status === 'saving'}
                onChange={() => sw.run(!value, onSave)} />
        </div>
    );
}

// ── Bölümlü seçim ───────────────────────────────────────────────────────────

export function Seg<T extends string | number>({ value, options, onChange, label, wide }: {
    value: T; options: { v: T; t: ReactNode }[]; onChange: (v: T) => void; label: string; wide?: boolean;
}) {
    return (
        <div role="radiogroup" aria-label={label} className={wide ? 'ay-seg wide' : 'ay-seg'}>
            {options.map((o) => (
                <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)}>{o.t}</button>
            ))}
        </div>
    );
}

// ── Kaydet çubuğu ───────────────────────────────────────────────────────────

/**
 * Tasarım S3'ün altı hâli tek bileşende. `state`:
 *   dirty   → "Kaydedilmemiş değişiklik · Vazgeç · Kaydet"
 *   invalid → alt satır kırmızı, Kaydet kapalı
 *   saving  → "Kaydediliyor…", ikisi de kilitli
 *   saved   → "Kaydedildi" (1,2 sn sonra kapanır — çağıran kapatır)
 *   unknown → "Kaydedildiğini doğrulayamadık" + Sayfayı yenile
 *   error   → sunucu açıkça reddetti; Kaydet açık kalır
 *   offline → "İnternet yok", Kaydet kapalı
 */
export function SaveBar({ state, summary, error, onSave, onDiscard, maxWidth, inPanel }: {
    state: SaveState; summary: string; error?: string | null; onSave: () => void; onDiscard: () => void;
    maxWidth?: number; inPanel?: boolean;
}) {
    if (state === 'clean') return null;
    const style = maxWidth ? { maxWidth } : undefined;
    if (state === 'saved') {
        const done = (
            <div className="ay-bar done" role="status" style={style}><I n="check" /><b>Kaydedildi</b></div>
        );
        return inPanel ? <div className="ay-panel-f"><I n="check" style={{ color: 'var(--grt)' }} /><b style={{ fontSize: 15, fontWeight: 800 }}>Kaydedildi</b></div>
            : <div className="ay-bar-wrap">{done}</div>;
    }
    if (state === 'unknown') {
        const body = (
            <>
                <span className="ay-dot s9 warn" />
                <div className="ay-bar-t"><b>Kaydedildiğini doğrulayamadık.</b><span>Sayfayı yenileyip kontrol edin.</span></div>
                <button type="button" className="ay-btn" onClick={() => window.location.reload()}><I n="refresh" />Sayfayı yenile</button>
            </>
        );
        return inPanel ? <div className="ay-panel-f">{body}</div>
            : <div className="ay-bar-wrap"><div className="ay-bar unk" role="status" style={style}>{body}</div></div>;
    }
    const saving = state === 'saving';
    const sub = state === 'invalid' ? <span className="err">{error}</span>
        : state === 'error' ? <span className="err">{error || 'Kaydedilemedi — tekrar deneyin.'}</span>
            : state === 'offline' ? <span className="strong">İnternet yok — bağlanınca kaydedebilirsiniz.</span>
                : summary ? <span>{summary}</span> : null;
    const canSave = state === 'dirty' || state === 'error';
    const body = (
        <>
            <span className="ay-dot s9 or" />
            <div className="ay-bar-t"><b>{saving ? 'Kaydediliyor…' : 'Kaydedilmemiş değişiklik'}</b>{!saving && sub}</div>
            <button type="button" className="ay-btn" disabled={saving} onClick={onDiscard}>Vazgeç</button>
            <button type="button" className="ay-btn-pri" disabled={!canSave} onClick={onSave}
                style={saving ? { opacity: .55, background: 'var(--or)', color: 'var(--btx)' } : undefined}>
                {saving && <Dots small />}Kaydet
            </button>
        </>
    );
    return inPanel ? <div className="ay-panel-f">{body}</div>
        : <div className="ay-bar-wrap"><div className="ay-bar" role="region" aria-label="Kaydedilmemiş değişiklik" style={style}>{body}</div></div>;
}

// ── Pencere ─────────────────────────────────────────────────────────────────

/** Esc ve perdeye tıklama `onClose` — veri kaybettiren seçenek varsayılan değil. */
export function Modal({ children, onClose, labelledBy, small, alert, closable = true }: {
    children: ReactNode; onClose: () => void; labelledBy: string; small?: boolean; alert?: boolean; closable?: boolean;
}) {
    useEffect(() => {
        if (!closable) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, closable]);
    return (
        <div className="ay-modal-back" onMouseDown={(e) => { if (closable && e.target === e.currentTarget) onClose(); }}>
            <div role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={labelledBy}
                className={small ? 'ay-modal sm' : 'ay-modal'}>
                {children}
            </div>
        </div>
    );
}

// ── Görsel ──────────────────────────────────────────────────────────────────

export function Pic({ url, className, style, children }: { url?: string; className?: string; style?: React.CSSProperties; children?: ReactNode }) {
    return url
        ? <div className={`ay-img ${className ?? ''}`} style={{ backgroundImage: `url("${url}")`, ...style }}>{children}</div>
        : <div className={`ay-ph ${className ?? ''}`} style={style}>{children}</div>;
}
