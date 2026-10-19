/**
 * A4 · {Kaynak}lar — sektörün kelimesiyle (güzellikte Kabinler, kuaförde
 * Koltuklar, dişte Üniteler…). Sektörde kaynak türü yoksa bu bölüm hiç yok.
 *
 * Ad, tür ve kapasite satırda düzenlenir; ekleme ve silme de bölüm taslağına
 * girer, silme onay ister. Silinen kaynağa bağlı randevular personelde kalır
 * (`reservations.resource_id … ON DELETE SET NULL`, 051; silme de zaten
 * `is_active=false`).
 */
import { useState } from 'react';
import { useResources } from '@/hooks/useResources';
import type { Resource } from '@/types';
import { dativeTr, genitiveTr } from '../ayarlarModel';
import { useTaslak } from '../useTaslak';
import { Head, I, Modal, SaveBar } from '../parcalar';

interface Row { id: string; name: string; type: string; capacity: number; isNew?: boolean }
interface Draft { rows: Row[] }

const lower = (s: string) => s.toLocaleLowerCase('tr');

export function Kaynaklar({ label, types }: { label: string; types: string[] }) {
    const { resources, isLoading, error, addResource, updateResource, removeResource } = useResources();
    const [ask, setAsk] = useState<Row | null>(null);
    const single = types[0] ?? '';

    const saved: Draft = {
        rows: resources.map((r: Resource) => ({ id: r.id, name: r.name, type: r.type, capacity: r.capacity ?? 1 })),
    };

    const t = useTaslak<Draft>({
        saved,
        sectionLabel: label,
        labels: { rows: label },
        validate: (d) => (d.rows.some((r) => !r.name.trim()) ? `Her ${lower(single)} için bir ad yazın.` : null),
        save: async (d, s) => {
            const keep = new Set(d.rows.map((r) => r.id));
            for (const old of s.rows) {
                if (!keep.has(old.id) && !(await removeResource(old.id))) return false;
            }
            for (const r of d.rows) {
                if (r.isNew) {
                    const made = await addResource({ type: r.type, name: r.name.trim(), capacity: r.capacity });
                    if (!made) return false;
                    continue;
                }
                const prev = s.rows.find((x) => x.id === r.id);
                if (prev && (prev.name !== r.name || prev.type !== r.type || prev.capacity !== r.capacity)) {
                    if (!(await updateResource(r.id, { name: r.name.trim(), type: r.type, capacity: r.capacity }))) return false;
                }
            }
            return true;
        },
    });
    const rows = t.draft.rows;
    const setRow = (id: string, patch: Partial<Row>) => t.set({ rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    const add = () => t.set({ rows: [...rows, { id: `new-${Date.now()}`, name: `${single} ${rows.length + 1}`, type: single, capacity: 1, isNew: true }] });

    const lead = `Randevular personelin yanında bir ${dativeTr(single)} de bağlanabilir.`;

    return (
        <>
            <div className="ay-col">
                <Head title={label} lead={lead} />

                {isLoading && rows.length === 0 ? (
                    <div className="ay-help" style={{ padding: '24px 0', borderTop: '1px solid var(--bd)' }}>Yükleniyor…</div>
                ) : error && rows.length === 0 ? (
                    <div role="status" className="ay-box plain" style={{ justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="ay-dot unk" />{label} okunamadı — yenileyin.</span>
                        <button type="button" className="ay-btn" style={{ height: 38, fontSize: 14 }} onClick={() => window.location.reload()}><I n="refresh" size={16} />Yenile</button>
                    </div>
                ) : rows.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, padding: '32px 0', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
                        <span style={{ fontSize: 18, fontWeight: 800 }}>Henüz {lower(single)} yok.</span>
                        <span className="ay-help" style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 520 }}>
                            {single} eklerseniz randevu alırken {lower(single)} de seçilir ve aynı saate {genitiveTr(single)} kapasitesi kadar kişi alınır.
                        </span>
                        <button type="button" className="ay-btn-pri" onClick={add}><I n="plus" />{single} ekle</button>
                    </div>
                ) : (
                    <>
                        <div role="table" aria-label={label} className="ay-table">
                            <div role="row" className="ay-tr ay-res-t head" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)' }}>
                                <span>Ad</span><span>Tür</span><span>Kapasite · aynı saate</span><span />
                            </div>
                            {rows.map((r) => {
                                const opts = types.includes(r.type) ? types : [r.type, ...types];
                                const prev = saved.rows.find((x) => x.id === r.id);
                                const changed = r.isNew || (prev && (prev.name !== r.name || prev.type !== r.type || prev.capacity !== r.capacity));
                                return (
                                    <div role="row" key={r.id} className="ay-tr ay-res-t">
                                        {changed && <span aria-hidden="true" className="ay-changed" style={{ top: 10, bottom: 10 }} />}
                                        <input className="ay-input" style={{ height: 44, borderRadius: 11, padding: '0 14px' }} aria-label={`${single} adı`}
                                            value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                                        <select className="ay-select sm" aria-label={`${r.name} türü`} value={r.type} onChange={(e) => setRow(r.id, { type: e.target.value })}>
                                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                        <div className="ay-stepper">
                                            <button type="button" aria-label="Kapasiteyi azalt" disabled={r.capacity <= 1} onClick={() => setRow(r.id, { capacity: Math.max(1, r.capacity - 1) })}><I n="minus" /></button>
                                            <span>{r.capacity} kişi</span>
                                            <button type="button" aria-label="Kapasiteyi artır" onClick={() => setRow(r.id, { capacity: r.capacity + 1 })}><I n="plus" /></button>
                                        </div>
                                        <button type="button" className="ay-icon-btn" aria-label={`${r.name} sil`}
                                            onClick={() => (r.isNew ? t.set({ rows: rows.filter((x) => x.id !== r.id) }) : setAsk(r))}><I n="trash" /></button>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
                            <button type="button" className="ay-btn h44" onClick={add}><I n="plus" />{single} ekle</button>
                            <span className="ay-help">Silmeden önce sorulur; o {dativeTr(single)} bağlı randevular personelde kalır.</span>
                        </div>
                    </>
                )}
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} />

            {ask && (
                <Modal labelledBy="ay-ksil" small alert onClose={() => setAsk(null)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                        <h2 id="ay-ksil" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>“{ask.name}” silinsin mi?</h2>
                        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)' }}>
                            Bağlı randevular personelde kalır. Silme, Kaydet'e basınca yapılır.
                        </p>
                    </div>
                    <div className="ay-modal-f">
                        <button type="button" className="ay-btn" autoFocus onClick={() => setAsk(null)}>Vazgeç</button>
                        <button type="button" className="ay-btn-danger" onClick={() => { t.set({ rows: rows.filter((x) => x.id !== ask.id) }); setAsk(null); }}>Sil</button>
                    </div>
                </Modal>
            )}
        </>
    );
}
