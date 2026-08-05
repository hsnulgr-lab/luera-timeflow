import { useState } from 'react';
import { useDentalChart } from '@/hooks/useDentalChart';
import { useTheme } from '@/contexts/ThemeContext';
import { ToothArchBoard, ToothLegend } from '@/components/dental/ToothAnatomy';
import { STATUS_LEGEND } from '@/components/dental/dentalStatusMeta';
import { TOOTH_TYPE_BY_NUMBER, TYPE_LABEL_TR } from '@/components/dental/ToothSVG';
import { cn } from '@/utils/cn';
import type { DentalStatus, ToothSurface } from '@/types';
import './dentalChart.css';

const STATUS_META: Record<DentalStatus, { label: string; color: string; bg: string }> = {
    saglam:  { label: 'Sağlam',         color: '#8a8a8a', bg: 'transparent' },
    curuk:   { label: 'Çürük',          color: '#C0392B', bg: 'rgba(192,57,43,0.14)' },
    dolgu:   { label: 'Dolgu',          color: '#2870B0', bg: 'rgba(40,112,176,0.14)' },
    kanal:   { label: 'Kanal Tedavili', color: '#7B44A8', bg: 'rgba(123,68,168,0.14)' },
    kron:    { label: 'Kron',           color: '#B8720A', bg: 'rgba(184,114,10,0.14)' },
    implant: { label: 'İmplant',        color: '#2E8A35', bg: 'rgba(46,138,53,0.14)' },
    cekildi: { label: 'Çekildi',        color: '#6b6b6b', bg: 'rgba(107,107,107,0.14)' },
};
const STATUS_ORDER: DentalStatus[] = ['saglam', 'curuk', 'dolgu', 'kanal', 'kron', 'implant', 'cekildi'];
const SURFACE_ORDER: ToothSurface[] = ['M', 'O', 'D', 'B', 'L'];
const SURFACE_STATUSES: DentalStatus[] = ['curuk', 'dolgu'];
const SWATCH_CLS = new Map(STATUS_LEGEND.map((item) => [item.status, item.cls]));

// Diş numarasından okunabilir konum: "Kanin · Sağ üst"
function toothLocation(n: number): string {
    const quadrant = Math.floor(n / 10);
    const side = quadrant === 1 || quadrant === 4 ? 'Sağ' : 'Sol';
    const jaw = quadrant <= 2 ? 'üst' : 'alt';
    const type = TOOTH_TYPE_BY_NUMBER[n];
    return `${type ? TYPE_LABEL_TR[type] : 'Diş'} · ${side} ${jaw}`;
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }).toLocaleUpperCase('tr');
const fmtYear = (iso: string) => new Date(iso).getFullYear();

interface DentalChartProps {
    customerId: string;
    staffId?: string;
    encounterId?: string;
    reservationId?: string;
    readOnly?: boolean;
}

// Diş hekimi sektörüne özel diş şeması — hasta detayına gömülür (masaüstü +
// mobil paylaşır). Dişe tıkla → durum seç + not ekle → kaydet; geçmiş silinmez,
// güncel durum en son eklenen kayıttan okunur (bkz. useDentalChart).
export function DentalChart(props: DentalChartProps) {
    // Hasta değişiminde açık diş editörü ve taslak kesin olarak sıfırlansın.
    return <DentalChartForCustomer key={`${props.customerId}:${props.reservationId || props.encounterId || 'patient'}`} {...props} />;
}

function DentalChartForCustomer({ customerId, staffId, encounterId, reservationId, readOnly = false }: DentalChartProps) {
    const { dark } = useTheme();
    const { current, planned, historyFor, isLoading, setTooth } = useDentalChart(customerId);
    const [active, setActive] = useState<number | null>(null);
    const [draftStatus, setDraftStatus] = useState<DentalStatus>('saglam');
    const [draftSurfaces, setDraftSurfaces] = useState<ToothSurface[]>([]);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const activeRecord = active === null ? undefined : current.get(active);
    const activeHistory = active === null ? [] : historyFor(active);

    const openTooth = (n: number) => {
        setActive(n);
        const rec = current.get(n);
        setDraftStatus(rec?.status ?? 'saglam');
        setDraftSurfaces(rec?.surfaces ?? []);
        setNote(rec?.note ?? '');
    };

    const save = async () => {
        if (readOnly || !active) return;
        setSaving(true);
        // Durum değişmediyse mevcut yüzeyler korunur — yalnız not güncellenmiş olabilir.
        const rec = current.get(active);
        const ok = await setTooth(active, draftStatus, {
            note: note.trim() || undefined, staffId,
            encounterId,
            reservationId,
            surfaces: SURFACE_STATUSES.includes(draftStatus)
                ? draftSurfaces
                : (rec && rec.status === draftStatus ? rec.surfaces : []),
        });
        setSaving(false);
        if (ok) setActive(null);
    };

    const markedCount = current.size;

    return (
        <div className={cn('dchart dash-theme', dark && 'dark')}>
            <header className="dchart-header">
                <div className="eyebrow">Diş Kliniği · Kalıcı dişler</div>
                <div className="dchart-heading">
                    <h2>Diş Şeması</h2>
                    <span className="dchart-count">{markedCount > 0 ? `${markedCount} kayıt` : '32 diş'}</span>
                </div>
                <p className="dchart-subtitle">FDI numaralandırma · işaretlenmemiş dişler sağlam kabul edilir</p>
            </header>

            <section className="dchart-body" aria-label="Odontogram">
                {isLoading ? (
                    /* Kayıtlar gelmeden ark çizilirse tüm dişler "sağlam" görünür — klinik olarak yanıltıcı. */
                    <div role="status" aria-live="polite" aria-label="Diş şeması yükleniyor">
                        <div className="dchart-skeleton-arch" aria-hidden="true">
                            {Array.from({ length: 16 }, (_, i) => <span className="dchart-skeleton" key={`u${i}`} />)}
                        </div>
                        <div className="dchart-skeleton-arch" aria-hidden="true">
                            {Array.from({ length: 16 }, (_, i) => <span className="dchart-skeleton" key={`l${i}`} />)}
                        </div>
                    </div>
                ) : (
                    <ToothArchBoard
                        statusOf={(n) => current.get(n)?.status}
                        plannedOf={(n) => planned.has(n)}
                        selected={active}
                        onSelect={openTooth}
                    />
                )}
                <ToothLegend />
            </section>

            {active !== null && (
                <section className="dchart-selected" aria-label={`Diş ${active} detayı`}>
                    <div className="dchart-selected-head">
                        <span className="dchart-tooth-badge">{active}</span>
                        <div className="dchart-selected-copy">
                            <div style={{ minWidth: 0 }}>
                                <h3>{toothLocation(active)}</h3>
                                <p>
                                    {activeRecord ? 'Mevcut durum' : 'Bu diş için kayıt yok'}
                                    {activeRecord && activeRecord.surfaces.length > 0 ? ` · yüzey ${activeRecord.surfaces.join('')}` : ''}
                                </p>
                            </div>
                            <span className={cn('dchart-current', activeRecord?.status ?? 'saglam')}>
                                {STATUS_META[activeRecord?.status ?? 'saglam'].label}
                            </span>
                        </div>
                        <button type="button" className="dchart-close" aria-label="Diş detayını kapat" onClick={() => setActive(null)}>×</button>
                    </div>

                    {!readOnly && (
                        <div className="dchart-form">
                            <span className="field-label">Durumu değiştir</span>
                            <div className="dchart-chips">
                                {STATUS_ORDER.map((s) => (
                                    <button key={s} type="button"
                                        className={cn('dchart-chip', s, draftStatus === s && 'on')}
                                        onClick={() => { setDraftStatus(s); if (!SURFACE_STATUSES.includes(s)) setDraftSurfaces([]); }}>
                                        <span className={cn('dt-swatch', SWATCH_CLS.get(s))} />{STATUS_META[s].label}
                                    </button>
                                ))}
                            </div>

                            {SURFACE_STATUSES.includes(draftStatus) && (
                                <>
                                    <span className="field-label" style={{ display: 'block', marginTop: 13 }}>Yüzey (MODBL)</span>
                                    <div className="dchart-surfaces">
                                        {SURFACE_ORDER.map((surface) => {
                                            const selected = draftSurfaces.includes(surface);
                                            return (
                                                <button key={surface} type="button" aria-pressed={selected}
                                                    className={cn('dchart-surface', selected && 'on')}
                                                    onClick={() => setDraftSurfaces((prev) => selected ? prev.filter((x) => x !== surface) : [...prev, surface])}>
                                                    {surface}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            <div className="dchart-note">
                                <label className="field-label" htmlFor={`dchart-note-${active}`}>Kısa klinik not</label>
                                <textarea id={`dchart-note-${active}`} value={note} maxLength={180} rows={2}
                                    placeholder="Muayene bulgusunu kısa ve net yazın"
                                    onChange={(e) => setNote(e.target.value)} />
                                <span className="dchart-note-help">En fazla 180 karakter</span>
                            </div>

                            <div className="dchart-footer">
                                <span className="dchart-last-edit">
                                    {activeRecord ? `Son düzenleme ${new Date(activeRecord.createdAt).toLocaleDateString('tr-TR')}` : 'Henüz kayıt yok'}
                                </span>
                                <button type="button" className="dchart-save" disabled={saving} onClick={save}>
                                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {active !== null && (
                <section className="dchart-history" aria-label="Diş geçmişi">
                    <div className="dchart-history-head">
                        <h3>Diş geçmişi</h3>
                        <span className="dchart-history-count">{activeHistory.length} kayıt</span>
                    </div>
                    {activeHistory.length === 0 ? (
                        <div className="dchart-empty">
                            <div className="dchart-empty-icon" aria-hidden="true">↺</div>
                            <h3>Bu diş için kayıt yok</h3>
                            <p>Durum değişiklikleri ve klinik notlar burada görünecek.</p>
                        </div>
                    ) : (
                        <div>
                            {activeHistory.map((record) => (
                                <div className="dchart-row" key={record.id}>
                                    <time className="dchart-row-date" dateTime={record.createdAt}>
                                        <strong>{fmtDay(record.createdAt)}</strong>{fmtYear(record.createdAt)}
                                    </time>
                                    <span className={cn('dchart-dot', record.status)} aria-hidden="true" />
                                    <div className="dchart-row-body">
                                        <strong>
                                            {STATUS_META[record.status].label}
                                            {record.surfaces.length > 0 ? ` · ${record.surfaces.join('')}` : ''}
                                            {record.recordType === 'planned' ? ' · planlı' : ''}
                                        </strong>
                                        {record.note && <span>{record.note}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
