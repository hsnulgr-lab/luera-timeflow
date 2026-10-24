import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, ArrowRight, CalendarCheck2, Check, CheckCircle2, ChevronRight,
    MessageCircle, Plus, Search, ShieldCheck, UserRound, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useResources } from '@/hooks/useResources';
import { useSlotResolver } from '@/hooks/useSlotResolver';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { normalizePhone, hasWa } from '@/lib/phone';
import { clockMin, type AvailableSlot } from '@/lib/slotResolution';
import type { Customer, Service } from '@/types';

// ── Timeflow Randevu Kompozitörü ─────────────────────────────────────────────
// Tek drawer içinde 3 karar + son onay. Hedef masaüstünde 20–30 saniye; ama hız
// doğrulamayı ATLAYARAK sağlanmaz:
//   • Genel girişte hasta, ziyaret türü, hekim, oda ve tarih/saat BOŞ başlar
//     (yanlış ön seçim yasağı). Yalnız bağlamsal "Kontrol randevusu" gibi açık
//     bir eylem hastayı ve ziyaret türünü taslağa taşıyabilir.
//   • Süre sabit yazılmaz; seçilen hizmetin gerçek `duration` değerinden gelir.
//   • Uygun saatler ortak slot çözümleyicisinden gelir (Takvim ile aynı kural).
//   • Kayıttan hemen önce slot YENİDEN doğrulanır; dolduysa taslak korunur.
//   • Kayıt yalnız useReservations.addReservation ile oluşur — paralel store yok.
//
// Bu ekran klinik karar vermez: "uygun" yalnız operasyonel müsaitliktir.

export const VISIT_TYPES = ['İlk muayene', 'Kontrol', 'Sonuç görüşmesi', 'İşlem'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];
/** Ziyaret türü idari sınıflandırmadır; ayrı bir rezervasyon status'ü DEĞİLDİR. */
export const CF_VISIT_TYPE = 'ziyaret_turu';

export interface ComposerSeed {
    customerId?: string;
    visitType?: VisitType;
}

/** Unvanlar baş harfi yutmasın: "Uzm. Dr. Aylin Er" → AE (UD değil). */
const TITLES = /^(uzm|dr|op|prof|doç|doc|yrd|fzt|dt|uz)\.?$/i;
const initialsOf = (n: string) => {
    const parts = n.trim().split(/\s+/).filter((p) => p && !TITLES.test(p));
    const src = parts.length ? parts : n.trim().split(/\s+/);
    return src.map((p) => p.charAt(0)).join('').slice(0, 2).toLocaleUpperCase('tr');
};
const maskName = (full: string, on: boolean) => {
    if (!on) return full;
    const parts = full.trim().split(/\s+/);
    return parts.length < 2 ? parts[0] || full : `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr')}.`;
};
const maskPhone = (phone: string, on: boolean) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return 'Telefon kayıtlı değil';
    if (!on) return phone;
    return `${digits.slice(0, 4)} ••• •• ${digits.slice(-2)}`;
};

export function AppointmentComposer({ seed, privateMode, onClose, onCreated }: {
    seed: ComposerSeed | null;
    privateMode: boolean;
    onClose: () => void;
    onCreated?: (reservationId: string) => void;
}) {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, addReservation, updateReservation } = useReservations();
    const { allCustomers, customerById, addCustomer } = useCustomers();
    const { staff } = useStaff();
    const { resources } = useResources();
    const { resolve, findSlots, isReady } = useSlotResolver();

    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);

    // ── Taslak. Bağlamsal açılışta yalnız hasta + ziyaret türü taşınır. ──────
    const [patientId, setPatientId] = useState<string | null>(seed?.customerId ?? null);
    const [newPatient, setNewPatient] = useState<{ name: string; phone: string } | null>(null);
    const [query, setQuery] = useState('');
    const [visitType, setVisitType] = useState<VisitType | ''>(seed?.visitType ?? '');
    const [serviceName, setServiceName] = useState('');
    const [staffId, setStaffId] = useState('');        // '' = ilk uygun hekim
    const [staffTouched, setStaffTouched] = useState(false);
    const [resourceId, setResourceId] = useState<string | null>(null);
    const [date, setDate] = useState('');              // boş başlar — ön seçim yok
    const [slot, setSlot] = useState<AvailableSlot | null>(null);
    const [busy, setBusy] = useState(false);
    const [conflictMsg, setConflictMsg] = useState('');
    const [fallbacks, setFallbacks] = useState<AvailableSlot[]>([]);

    const closeRef = useRef<HTMLButtonElement>(null);
    const dirtyRef = useRef(false);
    // Çift tıklama kilidi REF ile tutulur: setBusy asenkron olduğu için aynı
    // tick içindeki ikinci/üçüncü tık `busy` state'ini hâlâ false görür ve
    // mükerrer randevu oluşurdu (tarayıcıda doğrulandı).
    const submittingRef = useRef(false);
    useEffect(() => { closeRef.current?.focus(); }, []);

    // ESC taslağı kaybettirmez: kirli taslakta onay ister.
    const requestClose = () => {
        if (dirtyRef.current && !window.confirm('Randevu taslağı kapatılsın mı? Girilen bilgiler kaybolacak.')) return;
        onClose();
    };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const patient = patientId ? customerById.get(patientId) : undefined;
    const patientName = patient?.name || newPatient?.name || '';
    const patientPhone = patient?.phone || newPatient?.phone || '';

    // ── Hasta eşleştirme: ad VE normalize edilmiş telefon ────────────────────
    const matches = useMemo(() => {
        const q = query.trim();
        if (!q) {
            // Boş aramada rastgele kayıt değil: son ziyareti bilinen hastalar.
            return allCustomers.filter((c) => c.lastVisit)
                .sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''))
                .slice(0, 4);
        }
        const lower = q.toLocaleLowerCase('tr');
        const qPhone = normalizePhone(q);
        const qDigits = q.replace(/\D/g, '');
        return allCustomers.filter((c) => c.name.toLocaleLowerCase('tr').includes(lower)
            || (qPhone && normalizePhone(c.phone) === qPhone)
            || (qDigits !== '' && c.phone.replace(/\D/g, '').includes(qDigits)))
            .slice(0, 6);
    }, [query, allCustomers]);

    /** Yeni hasta formundaki telefon kayıtlı bir hastayla eşleşiyor mu? */
    const phoneTwin = useMemo(() => {
        const target = normalizePhone(newPatient?.phone);
        if (!target) return undefined;
        return allCustomers.find((c) => normalizePhone(c.phone) === target);
    }, [newPatient?.phone, allCustomers]);

    // ── Ziyaret türü → hizmet. Süre yalnız hizmetin gerçek duration'ından. ───
    useEffect(() => {
        if (!visitType) return;
        // Adı ziyaret türüyle birebir aynı olan bir hizmet varsa onu seçer;
        // yoksa boş bırakır — kullanıcı hizmeti kendisi seçer (süre uydurulmaz).
        const exact = services.find((s) => s.name.toLocaleLowerCase('tr') === visitType.toLocaleLowerCase('tr'));
        setServiceName((current) => current || exact?.name || '');
    }, [visitType, services]);

    const service = services.find((s) => s.name === serviceName);
    const durationMin = service?.duration ?? 0;

    // Taslak değişince seçili slot geçersizleşir.
    useEffect(() => { setSlot(null); setConflictMsg(''); setFallbacks([]); }, [date, serviceName, staffId, resourceId]);
    useEffect(() => {
        dirtyRef.current = Boolean(patientId || newPatient || visitType || date || slot);
    }, [patientId, newPatient, visitType, date, slot]);

    // ── Gerçek uygunluk ──────────────────────────────────────────────────────
    const notBefore = date === todayISO()
        ? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
        : undefined;

    const slots = useMemo(() => {
        if (!date || durationMin <= 0 || !isReady) return [];
        return findSlots({
            date, durationMin, staffId: staffId || undefined, resourceId,
            notBefore, stepMin: settings.slotDuration || 15, limit: 3,
        });
    }, [date, durationMin, staffId, resourceId, notBefore, findSlots, isReady, settings.slotDuration]);

    /** Hekim kartındaki "ilk boş" bilgisi — canlı doğrulamadan geçmiş tek slot. */
    const firstFreeFor = (id: string): string | null => {
        if (!date || durationMin <= 0 || !isReady) return null;
        const found = findSlots({ date, durationMin, staffId: id, resourceId, notBefore, stepMin: settings.slotDuration || 15, limit: 1 });
        return found[0]?.startTime ?? null;
    };

    // ── Aynı hastanın yakın tarihli aktif randevusu ──────────────────────────
    const nearbyExisting = useMemo(() => {
        if (!patientId) return null;
        const from = todayISO();
        const until = toISODate(new Date(Date.now() + 7 * 86_400_000));
        return reservations.find((r) => r.customerId === patientId && r.status !== 'cancelled'
            && r.date >= from && r.date <= until) || null;
    }, [patientId, reservations]);

    const patientReady = Boolean(patientId || (newPatient?.name.trim() && normalizePhone(newPatient.phone)));
    const canCreate = Boolean(patientReady && visitType && service && date && slot && !busy);

    // ── Kayıt ────────────────────────────────────────────────────────────────
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canCreate || !slot || !service) return;
        if (submittingRef.current) return;   // çift tıklama koruması (senkron)
        submittingRef.current = true;
        setBusy(true);
        setConflictMsg('');

        try {
            // 1) Kaydetmeden HEMEN ÖNCE slotu yeniden doğrula (yarış durumu).
            const recheck = resolve({
                date, startTime: slot.startTime, endTime: slot.endTime,
                staffId: staffId || undefined, resourceId,
            });
            if (recheck.issue) {
                setConflictMsg(recheck.issue);
                setSlot(null);
                setFallbacks(findSlots({
                    date, durationMin, staffId: staffId || undefined, resourceId,
                    notBefore, stepMin: settings.slotDuration || 15, limit: 3,
                }));
                return;                      // taslak ve hasta seçimi korunur
            }

            // 2) Hastayı çöz. Mükerrer koruması: önce istemci, son söz store'da.
            let customer: Customer | undefined = patient;
            if (!customer && newPatient) {
                if (phoneTwin) {
                    setPatientId(phoneTwin.id);
                    setNewPatient(null);
                    toast.info(`Bu numara zaten kayıtlı: ${maskName(phoneTwin.name, privateMode)}. Mevcut hasta seçildi.`);
                    return;
                }
                // addCustomer aktif mükerrerde null döner, arşivli kaydı geri getirir.
                const created = await addCustomer({ name: newPatient.name.trim(), phone: newPatient.phone.trim() });
                if (!created) return;        // store zaten sebebi bildirdi
                customer = created;
                setPatientId(created.id);
                setNewPatient(null);
            }
            if (!customer) return;

            // 3) Kayıt yalnız mevcut store üzerinden.
            const created = await addReservation({
                customerId: customer.id,
                customerName: customer.name,
                customerPhone: customer.phone,
                customerEmail: customer.email,
                date,
                startTime: slot.startTime,
                endTime: slot.endTime,
                service: service.name,
                serviceColor: service.color,
                status: 'confirmed',
                staffId: recheck.staffMember?.id || staffId || undefined,
                staffName: recheck.staffMember?.name || activeStaff.find((s) => s.id === staffId)?.name,
                staffColor: recheck.staffMember?.color || activeStaff.find((s) => s.id === staffId)?.color,
                resourceId: resourceId || undefined,
                resourceName: activeResources.find((r) => r.id === resourceId)?.name,
                customFields: { [CF_VISIT_TYPE]: visitType },
                source: 'manual',
            });
            if (!created) return;

            onCreated?.(created.id);
            const label = `${formatDateEU(date)} ${slot.startTime}`;
            // "Geri al" GERÇEK store eylemidir: veri silmez, kurtarılabilir iptal yapar.
            // Teyit mesajı addReservation sırasında gitmiş olabilir; bunu gizlemiyoruz.
            toast.success(`${maskName(customer.name, privateMode)} · ${label} randevusu oluşturuldu`, {
                description: hasWa(customer.phone)
                    ? 'Teyit mesajı gönderilmiş olabilir; geri alırsanız hastayı ayrıca bilgilendirin.'
                    : undefined,
                action: {
                    label: 'Geri al',
                    onClick: () => {
                        void updateReservation(created.id, { status: 'cancelled' });
                        toast.info('Randevu iptal edildi', { description: 'Teyit gittiyse hastaya ayrıca haber verin.' });
                    },
                },
            });
            dirtyRef.current = false;
            onClose();
        } finally {
            submittingRef.current = false;
            setBusy(false);
        }
    };

    const stepOneDone = patientReady;
    const stepTwoDone = Boolean(visitType && service);
    const stepThreeDone = Boolean(date && slot);

    return (
        <div className={cn('dash-theme hc-ops-layer drawer', dark && 'dark')} role="presentation"
            onMouseDown={requestClose}>
            <aside className="booking-drawer" role="dialog" aria-modal="true" aria-labelledby="hc-booking-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="drawer-head">
                    <div>
                        <span className="eyebrow">TIMEFLOW RANDEVU KOMPOZİTÖRÜ</span>
                        <h2 id="hc-booking-title">Randevu oluştur</h2>
                        <p>Doğru hasta, gerçek kaynak ve doğrulanmış uygunluk tek ekranda.</p>
                    </div>
                    <div className="composer-head-progress" aria-label="Randevu adımları">
                        <span className={stepOneDone ? 'done' : 'active'}>1 Hasta</span>
                        <i />
                        <span className={stepTwoDone ? 'done' : stepOneDone ? 'active' : ''}>2 Ziyaret</span>
                        <i />
                        <span className={stepThreeDone ? 'done' : stepTwoDone ? 'active' : ''}>3 Uygunluk</span>
                    </div>
                    <button ref={closeRef} type="button" className="icon-button"
                        aria-label="Randevu panelini kapat" onClick={requestClose}>
                        <X size={19} />
                    </button>
                </div>

                <form className="booking-form" onSubmit={submit}>
                    {/* ── 1 · Hasta ──────────────────────────────────────────── */}
                    <section className="booking-step">
                        <div className="step-title">
                            <span>1</span>
                            <div><strong>Hastayı bul</strong><small>Ad veya telefonla eşleştir</small></div>
                            {stepOneDone && <CheckCircle2 size={20} />}
                        </div>

                        {!patient && !newPatient && (
                            <>
                                <div className="input-shell">
                                    <Search size={17} />
                                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Hasta adı veya telefon" aria-label="Randevu için hasta ara" />
                                </div>
                                <span className="patient-options-label">
                                    {query ? 'Eşleşen hastalar' : 'Son ziyaret eden hastalar'}
                                </span>
                                <div className="patient-options">
                                    {matches.length === 0 && (
                                        <p className="slot-empty">
                                            {query ? 'Eşleşen hasta bulunamadı.' : 'Henüz ziyaret kaydı olan hasta yok.'}
                                        </p>
                                    )}
                                    {matches.map((c) => (
                                        <button type="button" key={c.id} onClick={() => { setPatientId(c.id); setQuery(''); }}>
                                            <span className="avatar">{initialsOf(c.name)}</span>
                                            <span>
                                                <strong>{maskName(c.name, privateMode)}</strong>
                                                <small>
                                                    {maskPhone(c.phone, privateMode)}
                                                    {c.lastVisit ? ` · son ziyaret ${formatDateEU(c.lastVisit)}` : ''}
                                                </small>
                                            </span>
                                            <ChevronRight size={16} />
                                        </button>
                                    ))}
                                </div>
                                <button className="new-patient-button" type="button"
                                    onClick={() => setNewPatient({ name: '', phone: '' })}>
                                    <Plus size={16} /> Yeni hasta oluştur
                                </button>
                            </>
                        )}

                        {newPatient && !patient && (
                            <div className="new-patient-fields">
                                <label>
                                    Ad soyad
                                    <input value={newPatient.name} autoFocus
                                        onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                                        placeholder="Hasta adı soyadı" />
                                </label>
                                <label>
                                    Telefon
                                    <input value={newPatient.phone} inputMode="tel"
                                        onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                                        placeholder="05•• ••• •• ••" />
                                </label>
                                {phoneTwin ? (
                                    <div className="clinical-warning">
                                        <AlertCircle size={17} />
                                        <span>
                                            <strong>Kayıtlı hasta bulundu</strong>
                                            Bu numara {maskName(phoneTwin.name, privateMode)} kaydına ait. İkinci kayıt açılmaz.
                                        </span>
                                        <button type="button" className="button compact"
                                            onClick={() => { setPatientId(phoneTwin.id); setNewPatient(null); }}>
                                            Mevcut kaydı kullan
                                        </button>
                                    </div>
                                ) : (
                                    <div className="duplicate-note">
                                        <ShieldCheck size={17} />
                                        <span>
                                            <strong>Yalnız ad ve telefon yeterli</strong>
                                            Mükerrer kayıt normalize edilmiş telefonla kontrol edilir; arşivli kayıt varsa geri getirilir.
                                        </span>
                                    </div>
                                )}
                                <button className="new-patient-button" type="button" onClick={() => setNewPatient(null)}>
                                    Kayıtlı hasta ara
                                </button>
                            </div>
                        )}

                        {patient && (
                            <div className="selected-booking-patient">
                                <span className="avatar blue">{initialsOf(patient.name)}</span>
                                <span>
                                    <strong>{maskName(patient.name, privateMode)}</strong>
                                    <small>
                                        {maskPhone(patient.phone, privateMode)}
                                        {patient.lastVisit ? ` · son ziyaret ${formatDateEU(patient.lastVisit)}` : ' · ilk başvuru'}
                                    </small>
                                </span>
                                <button type="button" onClick={() => { setPatientId(null); setSlot(null); }}>Değiştir</button>
                                {nearbyExisting && (
                                    <p>
                                        <AlertCircle size={16} />
                                        Yakın tarihli aktif randevu var: {formatDateEU(nearbyExisting.date)} {nearbyExisting.startTime}
                                    </p>
                                )}
                            </div>
                        )}
                    </section>

                    {/* ── 2 · Ziyaret ve kaynak ──────────────────────────────── */}
                    <section className={cn('booking-step', !stepOneDone && 'disabled')}>
                        <div className="step-title">
                            <span>2</span>
                            <div><strong>Ziyaret ve kaynak</strong><small>Tür, hizmet süresi, hekim ve oda</small></div>
                            {stepTwoDone && <CheckCircle2 size={20} />}
                        </div>

                        {stepOneDone && (
                            <>
                                <div className="visit-types">
                                    {VISIT_TYPES.map((type) => {
                                        const match = services.find((s) => s.name.toLocaleLowerCase('tr') === type.toLocaleLowerCase('tr'));
                                        return (
                                            <button type="button" key={type}
                                                className={visitType === type ? 'active' : ''}
                                                aria-pressed={visitType === type}
                                                onClick={() => { setVisitType(type); setServiceName(match?.name || ''); }}>
                                                <span>{type}</span>
                                                <small>{match ? `${match.duration} dk` : 'hizmet seçin'}</small>
                                            </button>
                                        );
                                    })}
                                </div>

                                <span className="patient-options-label">Hizmet ve süre</span>
                                <select className="hc-select" value={serviceName} aria-label="Hizmet seç"
                                    onChange={(e) => setServiceName(e.target.value)} disabled={!visitType}>
                                    <option value="">Hizmet seçin (süre buradan gelir)</option>
                                    {services.map((s) => (
                                        <option key={s.id} value={s.name}>{s.name} · {s.duration} dk</option>
                                    ))}
                                </select>

                                <span className="patient-options-label">Hekim</span>
                                <div className={cn('doctor-options', !serviceName && 'disabled')}>
                                    <button type="button" className={staffTouched && staffId === '' ? 'active' : ''}
                                        aria-pressed={staffTouched && staffId === ''}
                                        onClick={() => { setStaffId(''); setStaffTouched(true); }}>
                                        <span className="avatar">İU</span>
                                        <span>
                                            <strong>İlk uygun hekim</strong>
                                            <small>Yalnız operasyonel müsaitlik — klinik branş uygunluğu değildir</small>
                                        </span>
                                        <i>{staffTouched && staffId === '' && <Check size={14} />}</i>
                                    </button>
                                    {activeStaff.map((s) => {
                                        const free = firstFreeFor(s.id);
                                        return (
                                            <button type="button" key={s.id} className={staffId === s.id ? 'active' : ''}
                                                aria-pressed={staffId === s.id}
                                                onClick={() => { setStaffId(s.id); setStaffTouched(true); }}>
                                                <span className="avatar blue">{initialsOf(s.name)}</span>
                                                <span>
                                                    <strong>{s.name}</strong>
                                                    <small>
                                                        {!date ? 'Tarih seçilince uygunluk hesaplanır'
                                                            : free ? `İlk uygun saat ${free}` : 'Bu gün için uygun saat yok'}
                                                    </small>
                                                </span>
                                                <i>{staffId === s.id && <Check size={14} />}</i>
                                            </button>
                                        );
                                    })}
                                </div>

                                {activeResources.length > 0 && (
                                    <>
                                        <span className="patient-options-label">Oda / kaynak</span>
                                        <select className="hc-select" value={resourceId || ''} aria-label="Oda seç"
                                            onChange={(e) => setResourceId(e.target.value || null)}>
                                            <option value="">Otomatik (oda ayırmadan)</option>
                                            {activeResources.map((r) => (
                                                <option key={r.id} value={r.id}>{r.name}{r.capacity > 1 ? ` · ${r.capacity} kişi` : ''}</option>
                                            ))}
                                        </select>
                                    </>
                                )}
                            </>
                        )}
                    </section>

                    {/* ── 3 · Uygunluk ───────────────────────────────────────── */}
                    <section className={cn('booking-step', !stepTwoDone && 'disabled')}>
                        <div className="step-title">
                            <span>3</span>
                            <div><strong>Uygun zamanı seç</strong><small>Çalışma saati, izin, randevu ve oda birlikte doğrulanır</small></div>
                            {stepThreeDone && <CheckCircle2 size={20} />}
                        </div>

                        {stepTwoDone && (
                            <>
                                <span className="patient-options-label">Tarih</span>
                                <div className="date-row">
                                    <input type="date" className="hc-select" value={date} min={todayISO()}
                                        aria-label="Randevu tarihi" onChange={(e) => setDate(e.target.value)} />
                                    <button type="button" className="button compact" onClick={() => setDate(todayISO())}>Bugün</button>
                                    <button type="button" className="button compact"
                                        onClick={() => setDate(toISODate(new Date(Date.now() + 86_400_000)))}>Yarın</button>
                                </div>

                                {conflictMsg && (
                                    <div className="conflict-note" role="alert">
                                        <AlertCircle size={17} />
                                        <span>
                                            <strong>Bu saat az önce doldu</strong>
                                            {conflictMsg} — taslağınız korundu, aşağıdaki en yakın uygun saatlerden birini seçin.
                                        </span>
                                    </div>
                                )}

                                {!date ? (
                                    <p className="slot-empty">Uygun saatleri görmek için tarih seçin.</p>
                                ) : !isReady ? (
                                    <p className="slot-empty">Personel uygunluğu kontrol ediliyor…</p>
                                ) : (fallbacks.length ? fallbacks : slots).length === 0 ? (
                                    <p className="slot-empty">
                                        Bu tarihte seçili kaynaklarla uygun saat bulunamadı. Hekimi, odayı veya tarihi değiştirin.
                                    </p>
                                ) : (
                                    <div className="slot-options">
                                        {(fallbacks.length ? fallbacks : slots).map((s) => (
                                            <button type="button" key={s.startTime}
                                                className={slot?.startTime === s.startTime ? 'active' : ''}
                                                aria-pressed={slot?.startTime === s.startTime}
                                                onClick={() => { setSlot(s); setConflictMsg(''); setFallbacks([]); }}>
                                                <span>
                                                    <strong>{s.startTime}</strong>
                                                    <small>{s.startTime}–{s.endTime} · doğrulandı</small>
                                                </span>
                                                <em>
                                                    {s.staffName || 'Uygun hekim'}
                                                    {s.resourceName ? ` · ${s.resourceName}` : ''}
                                                    {` · ${durationMin} dk`}
                                                </em>
                                                {slot?.startTime === s.startTime && <Check size={14} />}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <button className="all-slots" type="button" onClick={() => navigate('/calendar')}>
                                    Takvimde tüm saatleri gör <ChevronRight size={15} />
                                </button>
                            </>
                        )}
                    </section>

                    {/* ── Son kontrol ────────────────────────────────────────── */}
                    <div className={cn('booking-summary', !canCreate && 'incomplete')}>
                        <div className="booking-summary-person">
                            <span className="eyebrow">SON KONTROL</span>
                            <strong>{patientName ? maskName(patientName, privateMode) : 'Hasta seçilmedi'}</strong>
                            <small>{visitType || 'Ziyaret seçilmedi'} · {service ? `${service.name} · ${durationMin} dk` : 'süre yok'}</small>
                        </div>
                        <div className="booking-summary-when">
                            <CalendarCheck2 size={18} />
                            <span>
                                <strong>{date && slot ? `${formatDateEU(date)} · ${slot.startTime}` : 'Saat seçilmedi'}</strong>
                                <small>
                                    {slot?.staffName || (staffTouched && !staffId ? 'İlk uygun hekim' : activeStaff.find((s) => s.id === staffId)?.name || 'Hekim seçilmedi')}
                                    {resourceId ? ` · ${activeResources.find((r) => r.id === resourceId)?.name}` : ''}
                                </small>
                            </span>
                        </div>
                        <div className="booking-summary-confirm">
                            <span><Check size={13} /> Oluştururken çakışma yeniden kontrol edilir</span>
                            <span>
                                <MessageCircle size={13} />
                                {hasWa(patientPhone) ? 'WhatsApp teyidi gönderilir' : 'Bildirim kanalı yok'}
                            </span>
                        </div>
                        <button className="button primary" type="submit" disabled={!canCreate}>
                            {busy ? 'Oluşturuluyor…'
                                : canCreate && slot ? `${formatDateEU(date)} ${slot.startTime}’a oluştur`
                                    : 'Seçimleri tamamlayın'}
                            <ArrowRight size={17} />
                        </button>
                        <p>
                            <ShieldCheck size={14} />
                            Yalnız operasyonel müsaitliği doğrular; klinik uygunluk veya öncelik üretmez.
                        </p>
                    </div>
                </form>
            </aside>
        </div>
    );
}

/** Randevusuz hasta kabulü — klinik önceliği yetkili personel belirler. */
export function WalkInModal({ privateMode, onClose }: { privateMode: boolean; onClose: () => void }) {
    const { dark } = useTheme();
    const navigate = useNavigate();
    const { allCustomers } = useCustomers();
    const { reservations, updateReservation } = useReservations();
    const today = todayISO();
    const [query, setQuery] = useState('');

    // Bugünün bekleyen randevuları — kabul burada işaretlenir.
    const waiting = useMemo(() => reservations
        .filter((r) => r.date === today && r.status !== 'cancelled' && !r.customerArrivedAt && !r.arrivedAt)
        .sort((a, b) => clockMin(a.startTime) - clockMin(b.startTime))
        .slice(0, 8), [reservations, today]);

    const results = useMemo(() => {
        const q = query.trim();
        if (!q) return [];
        const lower = q.toLocaleLowerCase('tr');
        const qPhone = normalizePhone(q);
        return allCustomers.filter((c) => c.name.toLocaleLowerCase('tr').includes(lower)
            || (qPhone && normalizePhone(c.phone) === qPhone)).slice(0, 5);
    }, [query, allCustomers]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className={cn('dash-theme hc-ops-layer modal', dark && 'dark')} role="presentation" onMouseDown={onClose}>
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="hc-walkin-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div>
                        <span className="eyebrow">HASTA KABULÜ</span>
                        <h2 id="hc-walkin-title">Kliniğe gelen hastayı işaretle</h2>
                    </div>
                    <button type="button" className="icon-button" autoFocus aria-label="Kapat" onClick={onClose}>
                        <X size={19} />
                    </button>
                </div>

                <div className="walkin-form">
                    <div className="clinical-boundary">
                        <UserRound size={18} />
                        <span>
                            <strong>Klinik önceliği yetkili personel belirler.</strong>
                            Kabul yalnız hastanın geldiğini kaydeder; sistem triyaj veya tanı üretmez.
                        </span>
                    </div>

                    <span className="patient-options-label">Bugün bekleyen randevular</span>
                    <div className="modal-list">
                        {waiting.length === 0 && <p className="modal-empty">Bekleyen randevu yok.</p>}
                        {waiting.map((r) => (
                            <button type="button" key={r.id} onClick={async () => {
                                const ok = await updateReservation(r.id, { customerArrivedAt: new Date().toISOString() });
                                if (ok) toast.success(`${maskName(r.customerName, privateMode)} kabul edildi`);
                                onClose();
                            }}>
                                <span className="avatar">{initialsOf(r.customerName)}</span>
                                <span>
                                    <strong>{maskName(r.customerName, privateMode)}</strong>
                                    <small>{r.startTime} · {r.service}</small>
                                </span>
                                <em>Geldi</em>
                            </button>
                        ))}
                    </div>

                    <span className="patient-options-label">Randevusuz gelen hastayı bul</span>
                    <div className="input-shell">
                        <Search size={17} />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ad veya telefon" aria-label="Hasta ara" />
                    </div>
                    <div className="modal-list">
                        {query.trim() && results.length === 0 && <p className="modal-empty">Sonuç bulunamadı.</p>}
                        {results.map((c) => (
                            <button type="button" key={c.id}
                                onClick={() => { onClose(); navigate(`/calendar?new=1&customer=${c.id}`); }}>
                                <span className="avatar">{initialsOf(c.name)}</span>
                                <span>
                                    <strong>{maskName(c.name, privateMode)}</strong>
                                    <small>{maskPhone(c.phone, privateMode)}</small>
                                </span>
                                <em>Randevu aç</em>
                            </button>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
