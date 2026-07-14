import { useState } from 'react';
import { useDentalChart } from '@/hooks/useDentalChart';
import { ToothSVG, UPPER_ORDER, LOWER_ORDER } from '@/components/dental/ToothSVG';
import type { DentalStatus } from '@/types';

export const STATUS_META: Record<DentalStatus, { label: string; color: string; bg: string }> = {
    saglam:  { label: 'Sağlam',         color: '#8a8a8a', bg: 'transparent' },
    curuk:   { label: 'Çürük',          color: '#C0392B', bg: 'rgba(192,57,43,0.14)' },
    dolgu:   { label: 'Dolgu',          color: '#2870B0', bg: 'rgba(40,112,176,0.14)' },
    kanal:   { label: 'Kanal Tedavili', color: '#7B44A8', bg: 'rgba(123,68,168,0.14)' },
    kron:    { label: 'Kron',           color: '#B8720A', bg: 'rgba(184,114,10,0.14)' },
    implant: { label: 'İmplant',        color: '#2E8A35', bg: 'rgba(46,138,53,0.14)' },
    cekildi: { label: 'Çekildi',        color: '#6b6b6b', bg: 'rgba(107,107,107,0.14)' },
};
const STATUS_ORDER: DentalStatus[] = ['saglam', 'curuk', 'dolgu', 'kanal', 'kron', 'implant', 'cekildi'];

interface T { ink: string; muted: string; surface: string; surface2: string; border: string; border2: string }

// Diş hekimi sektörüne özel diş şeması — hasta detayına gömülür (masaüstü +
// mobil paylaşır). Dişe tıkla → durum seç + not ekle → kaydet; geçmiş silinmez,
// güncel durum en son eklenen kayıttan okunur (bkz. useDentalChart).
export function DentalChart({ customerId, staffId, T }: { customerId: string; staffId?: string; T: T }) {
    const { current, setTooth } = useDentalChart(customerId);
    const [active, setActive] = useState<number | null>(null);
    const [draftStatus, setDraftStatus] = useState<DentalStatus>('saglam');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const openTooth = (n: number) => {
        setActive(n);
        const rec = current.get(n);
        setDraftStatus(rec?.status ?? 'saglam');
        setNote(rec?.note ?? '');
    };

    const save = async () => {
        if (!active) return;
        setSaving(true);
        // Kompakt görünümde yüzey seçici yok — durum değişmediyse mevcut yüzeyler korunur
        const rec = current.get(active);
        const ok = await setTooth(active, draftStatus, {
            note: note.trim() || undefined, staffId,
            surfaces: rec && rec.status === draftStatus ? rec.surfaces : [],
        });
        setSaving(false);
        if (ok) setActive(null);
    };

    const Tooth = ({ n, type, flip }: { n: number; type: (typeof UPPER_ORDER)[number]['type']; flip?: boolean }) => {
        const rec = current.get(n);
        const color = rec ? STATUS_META[rec.status].color : STATUS_META.saglam.color;
        return (
            <button
                type="button"
                onClick={() => openTooth(n)}
                title={rec ? `${n} · ${STATUS_META[rec.status].label}` : `${n} · Sağlam`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 2, flexShrink: 0 }}
            >
                <span style={{ fontSize: 8, fontWeight: 800, color: T.muted, opacity: 0.75 }}>{n}</span>
                <ToothSVG type={type} color={color} size={26} flip={flip}
                    surfaces={rec?.surfaces} neutralColor={STATUS_META.saglam.color} />
            </button>
        );
    };

    return (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', padding: '12px 8px', background: T.surface2, borderRadius: 14, border: `1px solid ${T.border}`, overflowX: 'auto' }}>
                <div style={{ display: 'flex', gap: 1 }}>{UPPER_ORDER.map((t) => <Tooth key={t.n} n={t.n} type={t.type} flip />)}</div>
                <div style={{ width: '100%', height: 1, background: T.border, margin: '2px 0' }} />
                <div style={{ display: 'flex', gap: 1 }}>{LOWER_ORDER.map((t) => <Tooth key={t.n} n={t.n} type={t.type} />)}</div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {STATUS_ORDER.filter((s) => s !== 'saglam').map((s) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: T.muted }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_META[s].color }} />
                        {STATUS_META[s].label}
                    </div>
                ))}
            </div>

            {active !== null && (
                <div style={{ marginTop: 12, padding: 14, borderRadius: 14, border: `1px solid ${T.border2}`, background: T.surface }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>
                            Diş {active}
                            {/* Korunan yüzeyler görünür olsun — durum değişmeden kaydedilirse aynen kalır */}
                            {(() => { const r = current.get(active); return r && r.surfaces.length > 0
                                ? <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: T.muted, marginLeft: 6 }}>yüzey: {r.surfaces.join('')}</span>
                                : null; })()}
                        </div>
                        <button type="button" onClick={() => setActive(null)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {STATUS_ORDER.map((s) => (
                            <button key={s} type="button" onClick={() => setDraftStatus(s)}
                                style={{
                                    padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                    border: `1px solid ${STATUS_META[s].color}55`,
                                    background: draftStatus === s ? STATUS_META[s].color : 'transparent',
                                    color: draftStatus === s ? '#fff' : STATUS_META[s].color,
                                }}>
                                {STATUS_META[s].label}
                            </button>
                        ))}
                    </div>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (ops.)"
                        style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                    <button type="button" disabled={saving} onClick={save}
                        style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: saving ? T.border2 : '#0E0E0E', color: '#F3EDE3', fontSize: 12.5, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                </div>
            )}
        </div>
    );
}
