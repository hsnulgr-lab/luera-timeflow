import type { CSSProperties, ReactNode } from 'react';
import { NEREDEN_KEYS, NEREDEN_LABEL, neredenLabel, type NeredenKey } from '@/lib/nereden';

// Müşteri nereden geldi? (135) — panelde yeni müşteri açılırken isteğe bağlı
// çip seçici ve müşteri kartındaki küçük etiket. Görünüm her ekranın kendi
// çip sınıflarından gelir; burada yeni bir görsel dil yok.
//
// Seçici YALNIZ yeni müşteride gösterilir (karar 2026-11-01): kayıtlı
// müşterinin nereden geldiği kartında durur, resepsiyon yavaşlamaz.

export function NeredenSecici({
    value, onChange, label, className, chipsClassName, chipClassName, onClassName = 'on',
}: {
    value: NeredenKey | null;
    onChange: (next: NeredenKey | null) => void;
    /** Ekranın kendi bölüm başlığı (yoksa çıplak çip satırı). */
    label?: ReactNode;
    className?: string;
    chipsClassName?: string;
    chipClassName?: string;
    onClassName?: string;
}) {
    return (
        <div className={className}>
            {label}
            <div className={chipsClassName} role="group" aria-label="Nereden geldi?">
                {NEREDEN_KEYS.map((k) => {
                    const on = value === k;
                    return (
                        <button key={k} type="button" aria-pressed={on}
                            className={[chipClassName, on ? onClassName : ''].filter(Boolean).join(' ')}
                            // Seçiliye yeniden dokunmak seçimi kaldırır: "bilmiyorum" da geçerli.
                            onClick={() => onChange(on ? null : k)}>
                            {NEREDEN_LABEL[k]}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Müşteri kartında "Nereden: Instagram ▾". Eski müşteriler boş gelir
 * (geri doldurma yok); salon buradan elle seçer ya da düzeltir.
 */
export function NeredenEtiketi({
    value, onChange, className, style,
}: {
    value: NeredenKey | null | undefined;
    onChange: (next: NeredenKey | null) => void;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <label className={className} title="Müşteri nereden geldi?"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', ...style }}>
            <span>Nereden: {value ? neredenLabel(value) : '—'}</span>
            <span aria-hidden style={{ fontSize: '0.8em', opacity: 0.6 }}>▾</span>
            <select
                aria-label="Müşteri nereden geldi?"
                value={value ?? ''}
                onChange={(e) => onChange((e.target.value || null) as NeredenKey | null)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            >
                <option value="">Belirtilmemiş</option>
                {NEREDEN_KEYS.map((k) => <option key={k} value={k}>{NEREDEN_LABEL[k]}</option>)}
            </select>
        </label>
    );
}
