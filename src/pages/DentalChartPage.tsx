import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, History } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useDentalChart } from '@/hooks/useDentalChart';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { useLabels } from '@/hooks/useLabels';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { ToothIcon } from '@/components/dental/ToothIcon';
import { TreatmentPlans } from '@/components/dental/TreatmentPlans';
import { ToothSVG, UPPER_ORDER, LOWER_ORDER, TYPE_LABEL_TR, TYPE_ACCENT, type ToothType } from '@/components/dental/ToothSVG';
import { useReservations } from '@/hooks/useReservations';
import { formatDateEU } from '@/utils/date';
import type { DentalStatus, ToothSurface } from '@/types';

const STATUS_COLOR: Record<DentalStatus, string> = {
    saglam: 'var(--dc-surface3)', curuk: 'var(--dc-red2)', dolgu: 'var(--dc-blue)',
    kanal: 'var(--dc-purple)', kron: 'var(--dc-amber)', implant: 'var(--dc-green)', cekildi: 'var(--dc-muted2)',
};
const STATUS_LABEL: Record<DentalStatus, string> = {
    saglam: 'Sağlam', curuk: 'Çürük', dolgu: 'Dolgu', kanal: 'Kanal Tedavili',
    kron: 'Kron', implant: 'İmplant', cekildi: 'Çekilmiş',
};
const STATUS_ORDER: DentalStatus[] = ['saglam', 'curuk', 'dolgu', 'kanal', 'kron', 'implant', 'cekildi'];
// Yüzey işaretlemenin anlamlı olduğu durumlar — kron/implant/çekim tüm dişi kapsar
const SURFACE_STATUSES: DentalStatus[] = ['curuk', 'dolgu'];
const SURFACE_ORDER: ToothSurface[] = ['M', 'O', 'D', 'B', 'L'];

// Aynı tipteki ardışık dişleri gruplar (Azı/Küçük Azı/Kanin/Kesici başlıkları için)
function groupSpans(order: typeof UPPER_ORDER) {
    const spans: { type: ToothType; start: number; count: number }[] = [];
    let i = 0;
    while (i < order.length) {
        let j = i;
        while (j < order.length && order[j].type === order[i].type) j++;
        spans.push({ type: order[i].type, start: i, count: j - i });
        i = j;
    }
    return spans;
}

// Tam diş şeması sayfası — design_handoff_dis_klinigi_dashboard v3. Gerçekçi
// diş silüetleri, FDI gruplu/etiketli düzen, dişe tıklayınca durum + MODBL
// yüzey + planlı işlem + geçmiş düzenleme. Sidebar "Diş Şeması" ve dashboard'daki
// tüm giriş noktaları (?patient= ile) buraya deep-link yapar.
export function DentalChartPage() {
    const { dark } = useTheme();
    const { sector, isLoading: settingsLoading } = useLabels();
    const { allCustomers, updateCustomer } = useCustomers();
    const [params, setParams] = useSearchParams();

    // Kullanıcı seçimi > ?patient= parametresi. Otomatik "ilk hasta" seçilmez —
    // hekim farkında olmadan yanlış hastanın şemasını düzenlemesin (klinik risk).
    const [selectedId, setSelectedId] = useState('');
    const customerId = selectedId || params.get('patient') || '';
    const customer = allCustomers.find((c) => c.id === customerId);

    // Aramalı hasta seçici (combobox) — 50+ hastada <select> kullanılamaz oluyor
    const [custQuery, setCustQuery] = useState('');
    const [custOpen, setCustOpen] = useState(false);
    const custMatches = useMemo(() => {
        const q = custQuery.trim().toLowerCase();
        if (!q) return allCustomers.slice(0, 8);
        return allCustomers
            .filter((c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))
            .slice(0, 8);
    }, [custQuery, allCustomers]);

    const { current, planned, historyFor, setTooth } = useDentalChart(customerId || undefined);
    const { addPlan } = useTreatmentPlans(customerId || undefined);
    const { settings } = useReservations();

    const [active, setActive] = useState<{ n: number; type: ToothType } | null>(null);
    const [draftStatus, setDraftStatus] = useState<DentalStatus>('saglam');
    const [draftSurfaces, setDraftSurfaces] = useState<ToothSurface[]>([]);
    const [planSvcId, setPlanSvcId] = useState('');
    const [addingPlan, setAddingPlan] = useState(false);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    // Sağ tık hızlı menüsü — dişe sağ tıkla → durumu tek tıkla kaydet (modal yok)
    const [ctxMenu, setCtxMenu] = useState<{ n: number; x: number; y: number } | null>(null);
    const quickSet = async (n: number, status: DentalStatus) => {
        setCtxMenu(null);
        const rec = current.get(n);
        await setTooth(n, status, { surfaces: rec && rec.status === status ? rec.surfaces : [] });
    };

    // Recall (kontrol çağrısı) tarihi — hasta bazında, başlık satırından yönetilir
    const [recallDraft, setRecallDraft] = useState('');
    useEffect(() => { setRecallDraft(customer?.recallDate || ''); }, [customer?.id, customer?.recallDate]);

    const upperGroups = useMemo(() => groupSpans(UPPER_ORDER), []);
    const lowerGroups = useMemo(() => groupSpans(LOWER_ORDER), []);

    // Medikal uyarılar — custom fields (alerji / ilaçlar / kronik) doluysa göster
    const medicalAlerts = useMemo(() => {
        const cf = customer?.customFields || {};
        return [
            cf.alerji ? `Alerji: ${cf.alerji}` : null,
            cf.ilaclar ? `İlaç: ${cf.ilaclar}` : null,
            cf.kronik ? `Kronik: ${cf.kronik}` : null,
        ].filter((x): x is string => !!x);
    }, [customer?.customFields]);

    // Settings yüklenmeden sector 'genel' okunur; hemen redirect etme yoksa
    // doğrudan URL/yenileme her seferinde Dashboard'a düşer.
    if (settingsLoading) return null;
    if (sector !== 'dis') return <Navigate to="/" replace />;

    const pick = (n: number, type: ToothType) => {
        setActive({ n, type });
        const rec = current.get(n);
        setDraftStatus(rec?.status ?? 'saglam');
        setDraftSurfaces(rec?.surfaces ?? []);
        setPlanSvcId('');
        setNote(rec?.note ?? '');
    };

    const pickStatus = (s: DentalStatus) => {
        setDraftStatus(s);
        if (!SURFACE_STATUSES.includes(s)) setDraftSurfaces([]);
    };

    const save = async () => {
        if (!active) return;
        setSaving(true);
        const ok = await setTooth(active.n, draftStatus, {
            note: note.trim() || undefined,
            surfaces: SURFACE_STATUSES.includes(draftStatus) ? draftSurfaces : [],
        });
        setSaving(false);
        if (ok) setActive(null);
    };

    // v5 "Plana Ekle": seçili tedaviyi bu diş için tedavi planına dönüştürür +
    // şemaya plana bağlı 'planned' kaydı düşer (turuncu kesikli halka).
    const addToPlan = async () => {
        if (!active || !planSvcId || addingPlan) return;
        const svc = settings.services.find((s) => s.id === planSvcId);
        if (!svc) return;
        setAddingPlan(true);
        const plan = await addPlan(`${active.n} ${svc.name}`, svc.price ?? 0);
        if (plan) {
            await setTooth(active.n, draftStatus === 'saglam' ? 'dolgu' : draftStatus, {
                recordType: 'planned', treatmentPlanId: plan.id,
                surfaces: SURFACE_STATUSES.includes(draftStatus) ? draftSurfaces : [],
                note: `Planlı: ${svc.name}`,
            });
        }
        setAddingPlan(false);
        setPlanSvcId('');
    };

    const saveRecall = async (value: string) => {
        if (!customer) return;
        setRecallDraft(value);
        // Boş string DB'de null'a çevrilir (updateCustomer) — tarih temizleme desteklenir
        await updateCustomer(customer.id, { recallDate: value });
    };

    const selectCustomer = (id: string) => {
        setSelectedId(id);
        setActive(null);
        setParams((p) => { p.set('patient', id); return p; }, { replace: true });
    };

    // Diş render yardımcısı — güncel durum rengi + yüzeyler + planlı işlem halkası
    const renderTooth = (t: { n: number; type: ToothType }, flip?: boolean) => {
        const rec = current.get(t.n);
        const plan = planned.get(t.n);
        const color = rec ? STATUS_COLOR[rec.status] : STATUS_COLOR.saglam;
        return (
            <div key={t.n} role="button" tabIndex={0} aria-label={`Diş ${t.n}: ${rec ? STATUS_LABEL[rec.status] : 'Sağlam'}${plan ? ', planlı işlem var' : ''}`}
                className={cn('w-[34px] flex justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)] rounded-md transition-colors hover:bg-[var(--dc-surface2)]',
                    active?.n === t.n && 'bg-[rgba(255,90,31,.08)] ring-1 ring-[var(--dc-orange)]')}
                onClick={() => pick(t.n, t.type)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(t.n, t.type); } }}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ n: t.n, x: e.clientX, y: e.clientY }); }}
                title={`Diş ${t.n}${rec ? ` · ${STATUS_LABEL[rec.status]}` : ''}${plan ? ` · Planlı: ${STATUS_LABEL[plan.status]}` : ''} — sağ tık: hızlı işlem`}>
                <ToothSVG type={t.type} color={color} size={40} flip={flip}
                    surfaces={rec?.surfaces} ring={plan ? 'var(--dc-orange)' : undefined} />
            </div>
        );
    };

    const activeHistory = active ? historyFor(active.n) : [];

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-[1480px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden">
                        <div className="flex items-center gap-[11px] px-5 py-4 border-b border-[var(--dc-border)]">
                            <div className="w-8 h-8 rounded-[9px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><ToothIcon size={16} /></div>
                            <div><div className="text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">Diş Şeması</div><div className="text-[11px] text-[var(--dc-muted)] mt-px">FDI numaralandırma · 32 diş</div></div>
                        </div>

                        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--dc-border)] flex-wrap">
                            <span className="text-xs text-[var(--dc-muted)]">Hasta:</span>
                            <div className="relative">
                                <input value={custOpen ? custQuery : (customer?.name ?? custQuery)} aria-label="Hasta ara ve seç"
                                    placeholder="Hasta ara…"
                                    onFocus={() => { setCustOpen(true); setCustQuery(''); }}
                                    onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                                    onChange={(e) => setCustQuery(e.target.value)}
                                    className="px-3 py-2 w-[220px] rounded-[11px] border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] font-semibold text-[var(--dc-ink)] outline-none" />
                                {custOpen && custMatches.length > 0 && (
                                    <div className="absolute z-30 left-0 right-0 top-[calc(100%+5px)] rounded-[11px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] shadow-[0_4px_16px_rgba(14,14,14,0.11),0_16px_48px_rgba(14,14,14,0.10)] overflow-hidden" role="listbox">
                                        {custMatches.map((c) => (
                                            <button key={c.id} type="button" role="option" aria-selected={c.id === customerId}
                                                onMouseDown={() => { selectCustomer(c.id); setCustQuery(''); setCustOpen(false); }}
                                                className="w-full text-left px-3 py-2 hover:bg-[var(--dc-surface2)] transition-colors">
                                                <span className="block text-[12.5px] font-semibold text-[var(--dc-ink)] truncate">{c.name}</span>
                                                <span className="block text-[10.5px] text-[var(--dc-muted)] font-mono">{c.phone}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {customer && <span className="text-xs text-[var(--dc-muted)]">{customer.phone}</span>}
                            <span className="hidden lg:inline text-[11px] text-[var(--dc-muted2)] font-semibold">Sol tık: düzenle · Sağ tık: hızlı durum</span>
                            {medicalAlerts.map((a) => (
                                <span key={a} className="flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[var(--dc-red-bg)] text-[var(--dc-red2)]">
                                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />{a}
                                </span>
                            ))}
                            {customer && (
                                <label className="ml-auto flex items-center gap-2 text-[11px] font-semibold text-[var(--dc-muted)]">
                                    <CalendarClock className="w-[14px] h-[14px]" /> Kontrol çağrısı:
                                    <input type="date" value={recallDraft} onChange={(e) => saveRecall(e.target.value)}
                                        className="px-2.5 py-1.5 rounded-[9px] border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[12px] font-semibold text-[var(--dc-ink)] outline-none" />
                                </label>
                            )}
                        </div>

                        {!customer && (
                            <div className="py-16 text-center">
                                <div className="text-[14px] font-bold text-[var(--dc-ink)] mb-1">Hasta seçin</div>
                                <div className="text-[12px] text-[var(--dc-muted)]">Şemayı görüntülemek için yukarıdan bir hasta arayın</div>
                            </div>
                        )}

                        {customer && active && (
                            <div className="mx-5 mt-4 rounded-[14px] bg-[var(--dc-surface2)] border border-[var(--dc-border)] overflow-hidden" style={{ animation: 'dc-panel-in 180ms ease' }}>
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--dc-border)]">
                                    <ToothSVG type={active.type} color={STATUS_COLOR[draftStatus]} size={44}
                                        surfaces={SURFACE_STATUSES.includes(draftStatus) ? draftSurfaces : undefined} />
                                    <div>
                                        <div className="text-[14px] font-extrabold text-[var(--dc-ink)]">Diş {active.n} · {TYPE_LABEL_TR[active.type]}</div>
                                        <div className="text-[11.5px] text-[var(--dc-muted)] mt-px">{STATUS_LABEL[draftStatus]}{draftSurfaces.length > 0 && SURFACE_STATUSES.includes(draftStatus) && ` — ${SURFACE_ORDER.filter((s) => draftSurfaces.includes(s)).join('·')} yüzeyi`}</div>
                                    </div>
                                    <button type="button" aria-label="Paneli kapat" onClick={() => setActive(null)}
                                        className="ml-auto w-[34px] h-[34px] rounded-lg grid place-items-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface3)] hover:text-[var(--dc-ink)] transition-colors">✕</button>
                                </div>
                                <div className="flex flex-col lg:flex-row gap-4 p-4">
                                    {/* Sol: durum + yüzey + plan + not */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-bold tracking-[.05em] uppercase text-[var(--dc-muted)] mb-2">Durum</div>
                                        <div className="flex flex-wrap gap-1.5 mb-4">
                                            {STATUS_ORDER.map((s) => (
                                                <button key={s} type="button" onClick={() => pickStatus(s)}
                                                    className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold border transition-all',
                                                        draftStatus === s
                                                            ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]'
                                                            : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border)] hover:border-[var(--dc-border2)] hover:text-[var(--dc-ink)]')}>
                                                    <span className="w-[8px] h-[8px] rounded-[2px] flex-shrink-0" style={{ background: STATUS_COLOR[s] }} />
                                                    {STATUS_LABEL[s]}
                                                </button>
                                            ))}
                                        </div>

                                        {SURFACE_STATUSES.includes(draftStatus) && (
                                            <div className="mb-4">
                                                <div className="text-[11px] font-bold tracking-[.05em] uppercase text-[var(--dc-muted)] mb-1">Yüzey (MODBL)</div>
                                                <div className="text-[11.5px] text-[var(--dc-muted2)] mb-2">Tüm diş değil, işlem gören yüzey işaretlenir.</div>
                                                <div className="grid gap-1" style={{ gridTemplateColumns: '44px 44px 44px', gridTemplateRows: '44px 44px 44px', gridTemplateAreas: "'. b .' 'm o d' '. l .'" }} role="group" aria-label="Yüzey seçici">
                                                    {([['B', 'b', 'Bukkal'], ['M', 'm', 'Mesial'], ['O', 'o', 'Oklüzal'], ['D', 'd', 'Distal'], ['L', 'l', 'Lingual']] as const).map(([s, area, lbl]) => {
                                                        const on = draftSurfaces.includes(s);
                                                        return (
                                                            <button key={s} type="button" role="checkbox" aria-checked={on} aria-label={lbl} title={lbl}
                                                                onClick={() => setDraftSurfaces((p) => on ? p.filter((x) => x !== s) : [...p, s])}
                                                                className={cn('rounded-[9px] text-[13px] font-extrabold border transition-all',
                                                                    on ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border2)] hover:border-[var(--dc-ink)] hover:text-[var(--dc-ink)]')}
                                                                style={{ gridArea: area }}>
                                                                {s}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {settings.services.length > 0 && (
                                            <div className="mb-4">
                                                <div className="text-[11px] font-bold tracking-[.05em] uppercase text-[var(--dc-muted)] mb-1">Planlı işlem</div>
                                                <div className="text-[11.5px] text-[var(--dc-muted2)] mb-2">Tedavi planına bağlanır; ödemesi plan üzerinden takip edilir.</div>
                                                <div className="flex gap-2">
                                                    <select value={planSvcId} onChange={(e) => setPlanSvcId(e.target.value)} aria-label="Planlanacak tedavi"
                                                        className="flex-1 px-3 py-2 rounded-[9px] border border-[var(--dc-border2)] bg-[var(--dc-surface)] text-[13px] font-semibold text-[var(--dc-ink)] outline-none">
                                                        <option value="">Tedavi seçin…</option>
                                                        {settings.services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.price ? ` · ${s.price.toLocaleString('tr-TR')} ₺` : ''}</option>)}
                                                    </select>
                                                    <button type="button" disabled={!planSvcId || addingPlan} onClick={addToPlan}
                                                        className="px-4 py-2 rounded-full text-[12.5px] font-bold border border-[var(--dc-border2)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)] hover:bg-[var(--dc-surface)] transition-colors disabled:opacity-40">
                                                        {addingPlan ? 'Ekleniyor…' : 'Plana Ekle'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="text-[11px] font-bold tracking-[.05em] uppercase text-[var(--dc-muted)] mb-2">Not</div>
                                        <div className="flex gap-2">
                                            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kısa klinik not…"
                                                className="flex-1 px-3 py-2 rounded-[9px] border border-[var(--dc-border2)] bg-[var(--dc-surface)] text-[12.5px] text-[var(--dc-ink)] outline-none" />
                                            <button type="button" disabled={saving} onClick={save}
                                                className="px-5 py-2 rounded-full text-[12.5px] font-bold text-white disabled:opacity-50 transition-colors hover:bg-[var(--dc-orange)]"
                                                style={{ background: 'var(--dc-ink)' }}>
                                                {saving ? 'Kaydediliyor…' : 'Kaydet'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Sağ: diş geçmişi */}
                                    <div className="lg:w-[320px] flex-shrink-0 lg:border-l lg:border-[var(--dc-border)] lg:pl-4">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--dc-ink)] mb-2">
                                            <History className="w-[13px] h-[13px]" /> Diş Geçmişi
                                        </div>
                                        {activeHistory.length === 0 ? (
                                            <div className="text-[11px] text-[var(--dc-muted2)] py-2">Bu diş için kayıt yok</div>
                                        ) : (
                                            <div aria-label="Diş geçmişi" className="relative flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1"
                                                style={{ maskImage: activeHistory.length > 4 ? 'linear-gradient(to bottom, black calc(100% - 20px), transparent)' : undefined }}>
                                                {activeHistory.map((h) => (
                                                    <div key={h.id} className="flex items-start gap-2 px-2.5 py-2 rounded-[9px] bg-[var(--dc-surface)] border border-[var(--dc-border)]">
                                                        <span className="w-[8px] h-[8px] rounded-[2px] mt-[3px] flex-shrink-0" style={{ background: STATUS_COLOR[h.status] }} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[11.5px] font-bold text-[var(--dc-ink)]">
                                                                {STATUS_LABEL[h.status]}
                                                                {h.surfaces.length > 0 && <span className="font-mono font-semibold text-[var(--dc-muted)]"> · {h.surfaces.join('')}</span>}
                                                                {h.recordType === 'planned' && <span className="text-[var(--dc-orange)]"> · planlı</span>}
                                                            </div>
                                                            {h.note && <div className="text-[10.5px] text-[var(--dc-muted)] truncate">{h.note}</div>}
                                                        </div>
                                                        <span className="text-[10px] text-[var(--dc-muted2)] flex-shrink-0">{formatDateEU(h.createdAt.slice(0, 10))}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {customer && (
                        <div className="px-5 pt-7 pb-5 overflow-x-auto">
                            <div className="flex justify-center gap-0.5" style={{ minWidth: 920 }}>
                                {upperGroups.map((g, gi) => (
                                    <div key={gi} className="flex flex-col items-center">
                                        <div className="flex">
                                            {UPPER_ORDER.slice(g.start, g.start + g.count).map((t) => (
                                                <div key={t.n} className="w-[34px] flex flex-col items-center">
                                                    <span className="font-mono text-[10px] font-bold text-[var(--dc-muted)] mb-0.5">{t.n}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-0.5" style={{ minWidth: 920 }}>
                                {upperGroups.map((g, gi) => (
                                    <div key={gi} className="flex flex-col items-center">
                                        <div className="text-[9.5px] font-bold tracking-[.04em] pb-[3px] mb-1 border-b-2" style={{ color: TYPE_ACCENT[g.type], borderColor: TYPE_ACCENT[g.type] }}>{TYPE_LABEL_TR[g.type]}</div>
                                        <div className="flex">
                                            {UPPER_ORDER.slice(g.start, g.start + g.count).map((t) => renderTooth(t, true))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="rounded-md my-0.5 h-[34px] flex items-center justify-center" style={{ minWidth: 920, background: 'linear-gradient(180deg, rgba(255,90,31,.16), rgba(255,90,31,.05) 60%, transparent)' }}>
                                <span className="text-[9px] font-bold tracking-[.12em] uppercase text-[var(--dc-muted2)]">Diş Eti</span>
                            </div>

                            <div className="flex justify-center gap-0.5" style={{ minWidth: 920 }}>
                                {lowerGroups.map((g, gi) => (
                                    <div key={gi} className="flex flex-col items-center">
                                        <div className="flex">
                                            {LOWER_ORDER.slice(g.start, g.start + g.count).map((t) => renderTooth(t))}
                                        </div>
                                        <div className="text-[9.5px] font-bold tracking-[.04em] pt-[3px] mt-1 border-t-2" style={{ color: TYPE_ACCENT[g.type], borderColor: TYPE_ACCENT[g.type] }}>{TYPE_LABEL_TR[g.type]}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-0.5" style={{ minWidth: 920 }}>
                                {lowerGroups.map((g, gi) => (
                                    <div key={gi} className="flex">
                                        {LOWER_ORDER.slice(g.start, g.start + g.count).map((t) => (
                                            <div key={t.n} className="w-[34px] flex flex-col items-center">
                                                <span className="font-mono text-[10px] font-bold text-[var(--dc-muted)] mt-0.5">{t.n}</span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                        )}

                        {customer && (
                        <div className="flex flex-wrap items-center gap-x-[9px] gap-y-[5px] px-5 pb-5">
                            {STATUS_ORDER.map((s) => (
                                <div key={s} className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--dc-muted)]">
                                    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] }} />
                                    {STATUS_LABEL[s]}
                                </div>
                            ))}
                            <div className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--dc-muted)]">
                                <span className="w-[7px] h-[7px] rounded-full flex-shrink-0 border border-dashed border-[var(--dc-orange)]" />
                                Planlı işlem
                            </div>
                            <span className="ml-auto text-[9.5px] text-[var(--dc-muted2)] font-semibold">İşaretlenmemiş dişler sağlam kabul edilir</span>
                        </div>
                        )}
                    </div>

                    {/* Tedavi planları — hekim şemada çalışırken planları ve bakiyeyi görsün */}
                    {customer && (
                        <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--dc-border)]">
                                <div className="text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">Tedavi Planı</div>
                                <div className="text-[11px] text-[var(--dc-muted)] mt-px">{customer.name}</div>
                            </div>
                            <div className="p-4">
                                <TreatmentPlans customerId={customer.id} T={{
                                    ink: 'var(--dc-ink)', muted: 'var(--dc-muted)', surface: 'var(--dc-surface)',
                                    surface2: 'var(--dc-surface2)', border: 'var(--dc-border)', border2: 'var(--dc-border2)',
                                }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sağ tık hızlı menüsü */}
            {ctxMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
                    <div className="fixed z-50 rounded-[11px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] shadow-[0_4px_16px_rgba(14,14,14,0.14),0_16px_48px_rgba(14,14,14,0.12)] py-1.5 min-w-[168px]"
                        style={{ left: Math.min(ctxMenu.x, window.innerWidth - 190), top: Math.min(ctxMenu.y, window.innerHeight - 300) }}>
                        <div className="px-3 py-1.5 text-[10px] font-bold tracking-[.08em] uppercase text-[var(--dc-muted2)] border-b border-[var(--dc-border)]">Diş {ctxMenu.n} · hızlı işlem</div>
                        {STATUS_ORDER.map((s) => (
                            <button key={s} type="button" onClick={() => quickSet(ctxMenu.n, s)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">
                                <span className="w-[9px] h-[9px] rounded-[3px] flex-shrink-0" style={{ background: STATUS_COLOR[s] }} />
                                {STATUS_LABEL[s]}
                            </button>
                        ))}
                        <div className="border-t border-[var(--dc-border)] mt-1 pt-1">
                            <button type="button" onClick={() => { const t = [...UPPER_ORDER, ...LOWER_ORDER].find(x => x.n === ctxMenu.n); setCtxMenu(null); if (t) pick(t.n, t.type); }}
                                className="w-full px-3 py-2 text-left text-[12px] font-semibold text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] transition-colors">
                                Detaylı düzenle… (yüzey / plan / not)
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
