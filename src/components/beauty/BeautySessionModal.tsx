import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { activeRiskFlags, evaluateEligibility, firstBlocked } from '@/lib/serviceEligibility';
import { allResourcesFull, isResourceFull, pickFreeResource } from '@/lib/resourceCapacity';
import { useStaff } from '@/hooks/useStaff';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { cn } from '@/utils/cn';
import { toISODate } from '@/utils/date';
import type { Customer, Resource, Service, TreatmentPlan, WorkingHours } from '@/types';

// Güzellik "Yeni Seans" modalı — tasarım: Guzellik Salonu.html modal bölümü.
// Fark: klasik randevu modalının aksine paket-farkındalıklı çalışır — müşterinin
// aktif paketi varsa otomatik önerilir (ücret ₺0), hamilelik kaydı varsa lazer
// tipi hizmetler kapatılır. Hedef: telefonda konuşurken 5 tıkta seans.

/** Takvimdeki boş saatten açıldığında önden doldurulan alanlar. */
export interface SessionPreset {
    date?: string;          // ISO (YYYY-MM-DD)
    slot?: string;          // HH:mm
    staffId?: string;
    resourceId?: string;
}

interface Props {
    customer: Customer | null;          // null = müşteri aramayla seçilecek
    preset?: SessionPreset;             // gün planındaki "+" bunu doldurur
    onClose: () => void;
    onCreated: () => void;
}

// Saat listesi işletmenin ÇALIŞMA SAATLERİNDEN türetilir. Eskiden 09:00–17:30
// sabitti; Ayarlar'dan "Pazar 09:00–23:59" denince modal bunu görmüyordu.
// Adım aralığı settings.slotDuration (yoksa 30 dk).
function slotTimesFor(
    dateISO: string,
    workingHours: WorkingHours[] = [],
    stepMin = 30,
    preset?: string,
): string[] {
    const weekday = new Date(`${dateISO}T12:00:00`).getDay();
    const wh = workingHours.find((w) => w.day === weekday);
    // Kapalı gün: hiç slot yok — kullanıcı "bugün kapalıyız" bilgisini görsün.
    if (wh?.isOff) return preset ? [preset] : [];

    const toMinutes = (t: string) => {
        const [h, m] = (t || '').split(':').map(Number);
        return Number.isFinite(h) ? h * 60 + (m || 0) : NaN;
    };
    const start = toMinutes(wh?.start || '09:00');
    const end = toMinutes(wh?.end || '18:00');
    const step = Math.max(5, stepMin || 30);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return preset ? [preset] : [];
    }

    const out: string[] = [];
    for (let m = start; m < end; m += step) {
        out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    // Izgaradaki "+" mesai dışı bir saate denk gelebilir; seçili görünsün diye eklenir.
    if (preset && !out.includes(preset)) out.push(preset);
    return out.sort();
}

function addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function BeautySessionModal({ customer: initialCustomer, preset, onClose, onCreated }: Props) {
    const { customers, addCustomer } = useCustomers();
    const { reservations, settings, addReservation } = useReservations();
    const { resources } = useResources();
    const { staff } = useStaff();

    const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
    const [query, setQuery] = useState('');
    // Kayıtlı olmayan müşteri: aramadan çıkmadan hızlı ekle.
    // null = kullanıcı henüz dokunmadı → değer sorgudan türetilir (effect'siz).
    const [quickNameRaw, setQuickNameRaw] = useState<string | null>(null);
    const [quickPhoneRaw, setQuickPhoneRaw] = useState<string | null>(null);
    const [quickAdding, setQuickAdding] = useState(false);
    const { plans } = useTreatmentPlans(customer?.id);

    const activePlans = useMemo(
        () => plans.filter((p) => p.status === 'active' && p.sessionsDone < p.sessionCount),
        [plans],
    );
    // Kontrendikasyon tek kaynaktan okunur (lib/serviceEligibility): aynı kural
    // takvim, mobil oluşturucu, düzenleme ve paket satışında da uygulanır.
    const riskFlags = useMemo(() => activeRiskFlags(customer, settings.sector), [customer, settings.sector]);
    const blockedFor = useMemo(
        () => (target: { name: string; tags?: string[] }) => evaluateEligibility(customer, target, settings.sector),
        [customer, settings.sector],
    );

    // Seçim durumu: paket (plan) VEYA bir ya da daha fazla tekil hizmet.
    // Tek seansta birden fazla işlem çok yaygın (kaş + cilt bakımı, dolgu +
    // diş temizliği); süre ve ücret seçilenlerin toplamıdır.
    const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(null);
    const [selectedServices, setSelectedServices] = useState<Service[]>([]);
    const [staffId, setStaffId] = useState(preset?.staffId || '');
    const [resourceId, setResourceId] = useState(preset?.resourceId || '');
    const [date, setDate] = useState(() => preset?.date || toISODate(new Date()));
    const [slot, setSlot] = useState(preset?.slot || '');
    const [saving, setSaving] = useState(false);

    const slotTimes = useMemo(
        () => slotTimesFor(date, settings.workingHours, settings.slotDuration, preset?.slot),
        [date, settings.workingHours, settings.slotDuration, preset?.slot],
    );

    const hasServices = selectedServices.length > 0;
    const toggleService = (s: Service) => {
        setSelectedPlan(null);
        setSelectedServices((prev) => prev.some((x) => x.id === s.id)
            ? prev.filter((x) => x.id !== s.id)
            : [...prev, s]);
    };

    // Müşteri seçilince aktif paketi otomatik öner (async yüklenen plandan tek sefer
    // başlangıç seçimi — meşru effect kullanımı).
    useEffect(() => {
        if (activePlans.length > 0 && !hasServices) {
            const allowed = activePlans.filter((p) => !blockedFor({ name: p.title }).blocked);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedPlan(allowed[0] || null);
        }
    }, [activePlans, blockedFor, hasServices]);

    const services: Service[] = settings.services || [];
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);

    // Paket → hizmet eşlemesi (isim benzerliği) süre/renk için
    const planService = (plan: TreatmentPlan): Service | undefined =>
        services.find((s) => plan.title.toLocaleLowerCase('tr').includes(s.name.toLocaleLowerCase('tr')) || s.name.toLocaleLowerCase('tr').includes(plan.title.toLocaleLowerCase('tr')));

    // Birden fazla hizmet seçiliyse süreler toplanır — çakışma kontrolü, slot
    // doluluğu ve bitiş saati hepsi bu toplam üzerinden hesaplanır.
    const duration = selectedPlan
        ? (planService(selectedPlan)?.duration || 60)
        : (hasServices ? selectedServices.reduce((s, x) => s + (x.duration || 0), 0) || 60 : 60);
    const totalPrice = hasServices ? selectedServices.reduce((s, x) => s + (x.price || 0), 0) : 0;

    const dateOptions = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const iso = toISODate(d);
        const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday: 'long' });
        return { iso, label: `${label} · ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` };
    }), []);

    /** Belirli bir personel [t, t+süre) aralığında dolu mu? */
    const isBusy = (t: string, sId: string): boolean => {
        const start = toMin(t);
        const end = start + duration;
        return reservations.some((r) => r.date === date && r.status !== 'cancelled'
            && r.staffId === sId && toMin(r.startTime) < end && toMin(r.endTime) > start);
    };

    // Kaynak doluluğu KAPASİTEYE göre ölçülür (bkz. lib/resourceCapacity).
    // Eskiden tek bir çakışma yeterliydi: kapasitesi 2 olan bir kabin ilk
    // seanstan sonra eleniyordu — oysa DB guard'ı (060) kapasiteye kadar izin
    // veriyor, yani UI kendini DB'den daha katı kısıtlıyordu.
    const busyIntervals = useMemo(() => reservations
        .filter((r) => r.date === date && r.status !== 'cancelled' && r.resourceId)
        .map((r) => ({ resourceId: r.resourceId, start: toMin(r.startTime), end: toMin(r.endTime) })),
        [reservations, date]);

    const freeResource = (t: string): Resource | undefined =>
        pickFreeResource(activeResources, busyIntervals, toMin(t), toMin(t) + duration);

    // Kabin tanımlı bir salonda kabinsiz seans yürümez. Eskiden hepsi doluyken
    // autoResource sessizce undefined dönüyor ve kayıt kabinsiz oluşuyordu:
    // takvimde kabin şeridine düşmeyen, kimsenin fark etmediği bir seans.
    const resourceBusy = (t: string): boolean => {
        const start = toMin(t);
        const end = start + duration;
        const picked = resourceId ? activeResources.find((r) => r.id === resourceId) : undefined;
        if (picked) return isResourceFull(picked, busyIntervals, start, end);
        if (resourceId) return false;   // silinmiş/pasif kaynak seçili kalmış
        return allResourcesFull(activeResources, busyIntervals, start, end);
    };

    // Personeli atanmamış randevular DB'de tek bir kişi gibi çakışır
    // (060 guard'ında `staff_id IS NOT DISTINCT FROM`, NULL = NULL sayılır).
    // Personel kaydı hiç yoksa randevu atanmamış kaydedileceği için UI de
    // aynı kuralı uygulamalı — yoksa boş görünen saat kayıtta reddedilir.
    const unassignedBusy = (t: string): boolean => {
        const start = toMin(t);
        const end = start + duration;
        return reservations.some((r) => r.date === date && r.status !== 'cancelled' && !r.staffId
            && toMin(r.startTime) < end && toMin(r.endTime) > start);
    };

    /** O gün personele düşen randevu sayısı — otomatik atamada yük dengesi için. */
    const dayLoad = (sId: string) =>
        reservations.filter((r) => r.date === date && r.status !== 'cancelled' && r.staffId === sId).length;

    // "Personel fark etmez" = "sen seç" demektir. Rastgele değil: o saatte müsait
    // olanlar arasından o gün en az randevusu olana verilir (eşitlikte isim
    // sırası) — hem yük dengeli hem deterministik.
    const autoStaff = (t: string): string | undefined => {
        if (staffId) return staffId;
        const free = activeStaff.filter((s) => !isBusy(t, s.id));
        if (free.length === 0) return undefined;
        return [...free].sort((a, b) => dayLoad(a.id) - dayLoad(b.id) || a.name.localeCompare(b.name, 'tr'))[0].id;
    };

    /** Kabin de aynı mantıkla: kapasitesi dolmamış ilk kabin atanır. */
    const autoResource = (t: string): string | undefined => {
        if (resourceId) return resourceId;
        return freeResource(t)?.id;
    };

    // Slot doluluğu: seçim varsa onun, yoksa "atanabilecek biri kaldı mı" sorusu.
    const busySlot = (t: string): boolean => {
        if (resourceBusy(t)) return true;
        if (staffId) return isBusy(t, staffId);
        if (activeStaff.length > 0) return !activeStaff.some((s) => !isBusy(t, s.id));   // herkes dolu
        return unassignedBusy(t);
    };

    const searchResults = useMemo(() => {
        if (!query.trim() || customer) return [];
        const q = query.toLocaleLowerCase('tr');
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(q) || c.phone.includes(q)).slice(0, 5);
    }, [query, customers, customer]);

    const noResults = Boolean(query.trim()) && searchResults.length === 0 && !customer;
    // Sorgu telefon mu isim mi? Ona göre hızlı-ekle alanları türetilir (dokunulmadıysa).
    const queryIsPhone = /^[\d\s+()-]+$/.test(query.trim());
    const quickName = quickNameRaw ?? (queryIsPhone ? '' : query.trim());
    const quickPhone = quickPhoneRaw ?? (queryIsPhone ? query.trim() : '');

    const quickAdd = async () => {
        const name = quickName.trim();
        const phone = quickPhone.replace(/\s+/g, '').trim();
        if (!name || phone.replace(/\D/g, '').length < 10 || quickAdding) return;
        setQuickAdding(true);
        const created = await addCustomer({ name, phone });
        setQuickAdding(false);
        if (created) {
            setCustomer(created);
            setQuery('');
            setQuickNameRaw(null);
            setQuickPhoneRaw(null);
            toast.success(`${created.name} eklendi ✨`);
        }
    };

    const serviceNames = selectedServices.map((s) => s.name).join(' + ');
    const serviceLabel = selectedPlan
        ? `${selectedPlan.title} (paketten, ₺0)`
        : hasServices ? `${serviceNames} · ${duration} dk${totalPrice ? ` · ₺${totalPrice.toLocaleString('tr-TR')}` : ''}` : '—';
    const canSave = Boolean(customer && (selectedPlan || hasServices) && slot);

    const create = async () => {
        if (!customer || saving) return;
        // Kaydetme anında son kontrol: seçim yapıldıktan sonra müşteri
        // değiştirilmiş olabilir (buton kilidi o an için doğruydu).
        const targets = selectedPlan ? [{ name: selectedPlan.title }] : selectedServices;
        const hit = firstBlocked(customer, targets, settings.sector);
        if (hit) {
            toast.error(`${hit.target.name} bu müşteriye uygulanamaz — ${hit.verdict.message}`);
            return;
        }
        // Kabin tanımlıysa kabinsiz kayıt oluşturulmaz. Slot listesi bunu zaten
        // dolu gösteriyor; burası aradaki boşluk için (başka cihazda az önce
        // dolmuş olabilir) — sessizce kabinsiz kaydetmektense reddetmek doğru.
        if (activeResources.length > 0 && !autoResource(slot)) {
            toast.error('Bu saatte uygun kabin yok — başka bir saat veya kabin seçin');
            return;
        }
        setSaving(true);
        const svc = selectedPlan ? planService(selectedPlan) : selectedServices[0];
        // "Fark etmez" seçiliyken atamayı burada yap: kayıt anındaki müsaitliğe
        // göre kişi/kabin belirlenir. Eskiden staff_id boş gidiyordu ve DB tüm
        // atanmamış randevuları aynı kişi sayıp çakışma hatası veriyordu.
        const pickedStaff = autoStaff(slot);
        const pickedResource = autoResource(slot);
        const created = await addReservation({
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            date,
            startTime: slot,
            endTime: addMinutes(slot, duration),
            service: selectedPlan ? selectedPlan.title : (serviceNames || 'Seans'),
            serviceColor: svc?.color,
            status: 'confirmed',
            staffId: pickedStaff,
            staffName: activeStaff.find((s) => s.id === pickedStaff)?.name,
            resourceId: pickedResource,
            // Çoklu hizmette kalemler ayrı ayrı da saklanır: Kasa hesabı
            // kalem kalem gösterebilsin, `service` metnine bağlı kalmasın.
            customFields: selectedPlan
                ? { paket_plan_id: selectedPlan.id, paket_seans: `${selectedPlan.sessionsDone + 1}/${selectedPlan.sessionCount}` }
                : selectedServices.length > 1
                    ? {
                        // custom_fields düz bir Record<string, string|number|boolean>;
                        // kalem listesi JSON metni olarak saklanır.
                        hizmetler: JSON.stringify(selectedServices.map((s) => ({ id: s.id, name: s.name, price: s.price ?? 0, duration: s.duration ?? 0 }))),
                        hizmet_ucreti: totalPrice,
                    }
                    : undefined,
        });
        setSaving(false);
        if (created) {
            toast.success(`Seans oluşturuldu · ${customer.name} ✨`);
            onCreated();
        }
    };

    // Portal ile body'ye taşınır: aksi halde .bpk (Paketler) gibi kapsayıcıların
    // scoped `button{color:inherit}` reset'i modalın Tailwind metin renklerini ezip
    // seçili (siyah) kartlardaki yazıyı görünmez yapıyordu.
    return createPortal(
        <div className="dash-theme fixed inset-0 z-[100]">
            <div className="absolute inset-0 bg-[rgba(14,14,14,0.48)] backdrop-blur-[2px]" onClick={onClose} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[920px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] bg-[var(--dc-surface)] rounded-3xl border border-[var(--dc-border2)] shadow-2xl flex flex-col overflow-hidden">
                {/* başlık */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--dc-border)] flex-shrink-0">
                    <div className="w-[38px] h-[38px] rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center"><CalendarDays className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                    <div>
                        <div className="text-base font-extrabold text-[var(--dc-ink)] tracking-[-0.02em]">Yeni Seans</div>
                        <div className="text-[11.5px] text-[var(--dc-muted)]">Telefonda konuşurken bile 5 tıkta biter</div>
                    </div>
                    <button onClick={onClose} aria-label="Kapat" className="ml-auto w-[38px] h-[38px] rounded-lg flex items-center justify-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] hover:text-[var(--dc-ink)] transition-colors"><X className="w-4 h-4" /></button>
                </div>

                <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
                        {/* Sol: müşteri + hizmet/paket */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-5 h-5 rounded-full bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold flex items-center justify-center">1</span>
                                <span className="text-[12.5px] font-extrabold text-[var(--dc-ink)]">Müşteri</span>
                            </div>
                            {!customer ? (
                                <>
                                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya telefon yaz…"
                                        className="w-full px-3.5 py-3 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13.5px] text-[var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)] focus:-outline-offset-1" />
                                    <div className="mt-2 space-y-1.5">
                                        {searchResults.map((c) => (
                                            <button key={c.id} onClick={() => { setCustomer(c); setQuery(''); }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] hover:border-[var(--dc-ink)] transition-colors text-left">
                                                <span className="w-[30px] h-[30px] rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">{c.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr')}</span>
                                                <span className="min-w-0"><span className="block text-[13px] font-bold text-[var(--dc-ink)] truncate">{c.name}</span><span className="block text-[11px] text-[var(--dc-muted)]">{c.phone}</span></span>
                                            </button>
                                        ))}
                                        {noResults && (
                                            <div className="px-3 py-3 rounded-xl border border-dashed border-[var(--dc-border2)] bg-[var(--dc-surface2)]">
                                                <p className="text-[12px] font-bold text-[var(--dc-ink)] mb-2">Kayıtlı değil — hemen ekle</p>
                                                <input value={quickName} onChange={(e) => setQuickNameRaw(e.target.value)} placeholder="Ad Soyad"
                                                    className="w-full px-3 py-2.5 mb-1.5 rounded-lg border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] text-[var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)] focus:-outline-offset-1" />
                                                <input value={quickPhone} onChange={(e) => setQuickPhoneRaw(e.target.value)} placeholder="05xx xxx xx xx" inputMode="tel"
                                                    className="w-full px-3 py-2.5 mb-2 rounded-lg border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] text-[var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)] focus:-outline-offset-1"
                                                    style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                                                <button onClick={quickAdd} disabled={!quickName.trim() || quickPhone.replace(/\D/g, '').length < 10 || quickAdding}
                                                    className="w-full flex items-center justify-center gap-1.5 bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] px-3 py-2.5 rounded-lg text-[12.5px] font-bold transition-all hover:-translate-y-px disabled:opacity-35 disabled:cursor-not-allowed disabled:translate-y-0">
                                                    <Check className="w-3.5 h-3.5" />{quickAdding ? 'Ekleniyor…' : 'Ekle ve seç'}
                                                </button>
                                                {(() => {
                                                    const digits = quickPhone.replace(/\D/g, '').length;
                                                    if (!quickName.trim()) return <p className="mt-1.5 text-[11px] text-[var(--dc-muted)]">Ad Soyad gerekli</p>;
                                                    if (digits > 0 && digits < 10) return <p className="mt-1.5 text-[11px] text-[var(--dc-orange-d)]">Telefon en az 10 haneli olmalı ({digits}/10)</p>;
                                                    if (digits === 0) return <p className="mt-1.5 text-[11px] text-[var(--dc-muted)]">Telefon numarası gerekli</p>;
                                                    return null;
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)]">
                                    <span className="w-[34px] h-[34px] rounded-[11px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12px] font-extrabold flex items-center justify-center flex-shrink-0">{customer.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr')}</span>
                                    <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-bold text-[var(--dc-ink)] truncate">{customer.name}</span><span className="block text-[11.5px] text-[var(--dc-muted)]">{customer.phone}{activePlans.length > 0 && ` · ${activePlans.length} aktif paket`}</span></span>
                                    {!initialCustomer && <button onClick={() => { setCustomer(null); setSelectedPlan(null); }} className="text-[12px] font-bold text-[var(--dc-orange-d)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-2 rounded-lg transition-colors">Değiştir</button>}
                                </div>
                            )}
                            {customer && selectedPlan && (
                                <div className="mt-2 px-3.5 py-2.5 rounded-lg bg-[var(--dc-green-bg)] text-[var(--dc-green)] text-[12px] font-semibold leading-snug">Aktif paketi bulundu: <b>{selectedPlan.title}</b> — otomatik seçildi, ücret alınmaz.</div>
                            )}
                            {customer && riskFlags.map((flag) => (
                                <div key={flag.key} className="mt-2 px-3.5 py-2.5 rounded-lg bg-[var(--dc-red-bg)] text-[var(--dc-red)] text-[12px] font-semibold leading-snug">
                                    ⚠ {flag.label} kaydı var{flag.note ? ` — ${flag.note}` : ''}; ilgili hizmetler kapalı.
                                </div>
                            ))}

                            <div className="flex items-center gap-2 mb-2 mt-5">
                                <span className="w-5 h-5 rounded-full bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold flex items-center justify-center">2</span>
                                <span className="text-[12.5px] font-extrabold text-[var(--dc-ink)]">Hizmet / Paket</span>
                                <span className="ml-auto text-[11px] text-[var(--dc-muted)]">Birden fazla seçebilirsiniz</span>
                            </div>
                            {hasServices && (
                                <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--dc-surface2)] text-[11.5px] text-[var(--dc-muted)]">
                                    <b className="text-[var(--dc-ink)]">{selectedServices.length} hizmet</b>
                                    <span>· {duration} dk{totalPrice > 0 && ` · ₺${totalPrice.toLocaleString('tr-TR')}`}</span>
                                    <button onClick={() => setSelectedServices([])} className="ml-auto font-bold text-[var(--dc-orange-d)] hover:underline">Temizle</button>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                {activePlans.map((p) => {
                                    const verdict = blockedFor({ name: p.title });
                                    const blocked = verdict.blocked;
                                    const activeSel = selectedPlan?.id === p.id;
                                    return (
                                        <button key={p.id} disabled={blocked} onClick={() => { setSelectedPlan(p); setSelectedServices([]); }}
                                            title={verdict.message}
                                            className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors',
                                                blocked ? 'opacity-45 cursor-not-allowed border-[var(--dc-border)]'
                                                    : activeSel ? 'border-[var(--dc-inkbox)] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)]'
                                                        : 'border-[var(--dc-border)] bg-[var(--dc-surface)] hover:border-[var(--dc-border2)] hover:bg-[var(--dc-surface2)]')}>
                                            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: planService(p)?.color || 'var(--dc-purple)' }} />
                                            <span className="flex-1 min-w-0">
                                                <span className={cn('block text-[13px] font-bold truncate', !activeSel && 'text-[var(--dc-ink)]')}>{p.title} — paketten</span>
                                                <span className={cn('block text-[11px] mt-px', activeSel ? 'opacity-70' : 'text-[var(--dc-muted)]')}>{blocked ? verdict.message : `${planService(p)?.duration || 60} dk`}</span>
                                            </span>
                                            <span className={cn('flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap', activeSel ? 'bg-white/15' : blocked ? 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]' : 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]')} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                                {blocked ? 'kapalı' : `kalan ${p.sessionCount - p.sessionsDone} seans · ₺0`}
                                            </span>
                                        </button>
                                    );
                                })}
                                {services.map((s) => {
                                    const blocked = blockedFor(s).blocked;
                                    const order = selectedServices.findIndex((x) => x.id === s.id);
                                    const activeSel = order >= 0;
                                    return (
                                        <button key={s.id} disabled={blocked} onClick={() => toggleService(s)}
                                            aria-pressed={activeSel}
                                            title={blocked ? 'Hamilelik nedeniyle kapalı' : activeSel ? 'Seçimden çıkar' : 'Seansa ekle'}
                                            className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors',
                                                blocked ? 'opacity-45 cursor-not-allowed border-[var(--dc-border)]'
                                                    : activeSel ? 'border-[var(--dc-inkbox)] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)]'
                                                        : 'border-[var(--dc-border)] bg-[var(--dc-surface)] hover:border-[var(--dc-border2)] hover:bg-[var(--dc-surface2)]')}>
                                            {activeSel
                                                ? <span className="w-[18px] h-[18px] rounded-md bg-white/20 text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">{order + 1}</span>
                                                : <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} />}
                                            <span className="flex-1 min-w-0">
                                                <span className={cn('block text-[13px] font-bold truncate', !activeSel && 'text-[var(--dc-ink)]')}>{s.name}</span>
                                                <span className={cn('block text-[11px] mt-px', activeSel ? 'opacity-70' : 'text-[var(--dc-muted)]')}>{blocked ? 'Hamilelik nedeniyle uygulanamaz' : `Tekil seans · ${s.duration} dk`}</span>
                                            </span>
                                            <span className={cn('flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap', activeSel ? 'bg-white/15' : 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]')} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                                {blocked ? 'kapalı' : s.price ? `₺${s.price.toLocaleString('tr-TR')}` : '—'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sağ: personel · kabin · saat */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-5 h-5 rounded-full bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold flex items-center justify-center">3</span>
                                <span className="text-[12.5px] font-extrabold text-[var(--dc-ink)]">Personel · Kabin · Saat</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Personel"
                                    className="w-full px-3.5 py-3 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] font-semibold text-[var(--dc-ink)] outline-none">
                                    <option value="">Personel fark etmez</option>
                                    {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} aria-label="Kabin"
                                    className="w-full px-3.5 py-3 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] font-semibold text-[var(--dc-ink)] outline-none">
                                    <option value="">Kabin fark etmez</option>
                                    {activeResources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                            <select value={date} onChange={(e) => { setDate(e.target.value); setSlot(''); }} aria-label="Tarih"
                                className="w-full mt-2.5 px-3.5 py-3 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] font-semibold text-[var(--dc-ink)] outline-none">
                                {dateOptions.map((d) => <option key={d.iso} value={d.iso}>{d.label}</option>)}
                            </select>

                            {slotTimes.length === 0 && (
                                <div className="mt-3 px-3.5 py-3 rounded-xl border border-dashed border-[var(--dc-border2)] bg-[var(--dc-surface2)] text-[12.5px] text-[var(--dc-muted)]">
                                    Bu gün işletme kapalı — çalışma saatlerini Ayarlar'dan değiştirebilirsiniz.
                                </div>
                            )}
                            <div className="grid grid-cols-6 gap-[7px] mt-3">
                                {slotTimes.map((t) => {
                                    const busy = busySlot(t);
                                    const past = date === toISODate(new Date()) && toMin(t) <= new Date().getHours() * 60 + new Date().getMinutes();
                                    const disabled = busy || past;
                                    const sel = slot === t;
                                    return (
                                        <button key={t} disabled={disabled} onClick={() => setSlot(t)}
                                            className={cn('py-2.5 px-1 rounded-[10px] border text-[12px] font-bold text-center transition-colors min-h-[40px]',
                                                sel ? 'bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] border-[var(--dc-inkbox)]'
                                                    : disabled ? 'opacity-30 cursor-not-allowed bg-[var(--dc-surface3)] border-transparent line-through text-[var(--dc-ink)]'
                                                        : 'bg-[var(--dc-page)] border-[var(--dc-border)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)]')}
                                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                            {t}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--dc-muted)]">
                                <span><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-1 align-[-1px] bg-[var(--dc-page)] border border-[var(--dc-border2)]" />Uygun</span>
                                <span><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-1 align-[-1px] bg-[var(--dc-surface3)]" />Dolu / kabin çakışması</span>
                                <span><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-1 align-[-1px] bg-[var(--dc-inkbox)]" />Seçili</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* alt bar */}
                <div className="flex items-center gap-3.5 px-5 py-4 border-t border-[var(--dc-border)] flex-shrink-0">
                    <div className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-[var(--dc-surface2)] text-[12px] text-[var(--dc-muted)] whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <b className="text-[var(--dc-ink)]">{customer?.name || 'Müşteri seçin'}</b>
                        {' · '}{serviceLabel}
                        {/* Otomatik atananı da göster — kullanıcı kime/nereye verildiğini
                            kaydetmeden önce görsün. */}
                        {slot && (() => {
                            const sId = autoStaff(slot);
                            const rId = autoResource(slot);
                            const sName = activeStaff.find((s) => s.id === sId)?.name;
                            const rName = activeResources.find((r) => r.id === rId)?.name;
                            return (<>
                                {sName && <> · {sName}{!staffId && ' (otomatik)'}</>}
                                {rName && <> · {rName}{!resourceId && ' (otomatik)'}</>}
                            </>);
                        })()}
                        {slot && <> · <b className="text-[var(--dc-ink)]">{dateOptions.find((d) => d.iso === date)?.label.split(' · ')[1]} {slot}</b></>}
                    </div>
                    <button onClick={create} disabled={!canSave || saving}
                        className="flex-shrink-0 flex items-center gap-2 bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] px-5 py-3 rounded-full text-[13px] font-bold transition-all hover:-translate-y-px disabled:opacity-35 disabled:cursor-not-allowed disabled:translate-y-0">
                        <Check className="w-3.5 h-3.5" />{saving ? 'Kaydediliyor…' : 'Seansı Oluştur'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
