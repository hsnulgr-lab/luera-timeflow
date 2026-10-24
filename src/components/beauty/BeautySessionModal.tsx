import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useTheme } from '@/contexts/ThemeContext';
import { activeRiskFlags, evaluateEligibility, firstBlocked } from '@/lib/serviceEligibility';
import { allResourcesFull, isResourceFull, pickFreeResource } from '@/lib/resourceCapacity';
import { useStaff } from '@/hooks/useStaff';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { cn } from '@/utils/cn';
import { toISODate } from '@/utils/date';
import type { Customer, Resource, Service, TreatmentPlan, WorkingHours } from '@/types';
import './beautySessionModal.css';

// Güzellik "Yeni Seans" modalı — paket-farkındalıklı: müşterinin aktif paketi
// varsa otomatik önerilir (ücret ₺0), hamilelik kaydı varsa lazer tipi
// hizmetler kapatılır.
//
// Zaman çizelgesi (2026-10-21, kullanıcı üç taslak arasından C'yi seçti):
// saat kutuları yerine günün çizelgesi. Her uzman bir sütun, dolu saatler gri
// blok; boş yere tıklayınca seans süresi kadar turuncu blok oraya oturur.
// "Fark etmez" sütunu herkesin dolu olduğu saatleri gösterir — oraya konan
// seansın uzmanını kayıt anında yük dengesiyle sistem seçer (autoStaff).
// Önce yataydı; 08–24 gibi uzun günde yarım saat ~25 px'e düşüp okunmuyordu
// ("pratik ve okunaklı değil"). Takvimin Gün görünümü gibi DİKEY oldu.

/** Dikey çizelgede saat başına yükseklik — yarım saat 26 px, tıklanabilir */
const HOUR_PX = 52;

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
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');

/** Çizelge şeridi: uzman, "fark etmez" ya da (personel kaydı yoksa) tek şerit. */
interface Lane {
    key: string;
    label: string;
    /** '' = fark etmez (otomatik), undefined = personel kaydı yok (atanmamış) */
    staffId: string | undefined;
    load?: number;
}

/** Ardışık adımları tek bloğa birleştirir: [başlangıç, bitiş) dakika. */
function runsOf(times: string[], step: number, hit: (t: string) => boolean): [number, number][] {
    const out: [number, number][] = [];
    for (const t of times) {
        if (!hit(t)) continue;
        const s = toMin(t), e = s + step;
        const last = out[out.length - 1];
        if (last && last[1] >= s) last[1] = Math.max(last[1], e);
        else out.push([s, e]);
    }
    return out;
}

export function BeautySessionModal({ customer: initialCustomer, preset, onClose, onCreated }: Props) {
    const { customers, addCustomer } = useCustomers();
    const { reservations, settings, addReservation } = useReservations();
    const { resources } = useResources();
    const { staff } = useStaff();
    const { dark } = useTheme();

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
    // Çizelgede imlecin altındaki adım — süre kadar hayalet blok çizilir
    const [hover, setHover] = useState<{ lane: string; t: string } | null>(null);

    const step = Math.max(5, settings.slotDuration || 30);
    // "+" ile gelen mesai dışı saat yalnız kendi gününde eklenir
    const presetSlot = preset?.slot && (!preset.date || preset.date === date) ? preset.slot : undefined;
    const slotTimes = useMemo(
        () => slotTimesFor(date, settings.workingHours, step, presetSlot),
        [date, settings.workingHours, step, presetSlot],
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

    // 7 günlük şerit + hafta okları (‹ ›). Lazer/paket seansları çoğu zaman 3–6
    // hafta sonraya yazılıyor; 7 gün yetmiyordu. Takvimden ileri bir günle
    // açıldıysa şerit o haftadan başlar. Geçmiş haftaya gidilmez.
    const todayISO = toISODate(new Date());
    const daysFromToday = (iso: string) => Math.round(
        (new Date(`${iso}T12:00:00`).getTime() - new Date(`${todayISO}T12:00:00`).getTime()) / 86_400_000,
    );
    const [week, setWeek] = useState(() => Math.max(0, Math.floor(daysFromToday(preset?.date || todayISO) / 7)));
    const MAX_WEEK = 52;
    const dateOptions = useMemo(() => {
        const opt = (d: Date, top: string) => {
            const wh = (settings.workingHours || []).find((w) => w.day === d.getDay());
            return {
                iso: toISODate(d), top, day: d.getDate(), off: Boolean(wh?.isOff),
                long: d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
            };
        };
        return Array.from({ length: 7 }, (_, i) => {
            const n = week * 7 + i;
            const d = new Date();
            d.setDate(d.getDate() + n);
            return opt(d, n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday: 'short' }));
        });
    }, [week, settings.workingHours]);
    // Şeridin hangi haftayı gösterdiği: "21–27 Ekim" ya da "28 Ekim – 3 Kasım"
    const weekRange = (() => {
        const a = new Date(`${dateOptions[0].iso}T12:00:00`);
        const b = new Date(`${dateOptions[dateOptions.length - 1].iso}T12:00:00`);
        const month = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'long' });
        return a.getMonth() === b.getMonth()
            ? `${a.getDate()}–${b.getDate()} ${month(b)}`
            : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
    })();
    // "Diğer" tarih düğmesi (yerel tarih seçici) denendi ve kaldırıldı
    // (2026-10-21): tarayıcının penceresi koyu temada bembeyaz açılıyor,
    // pencerenin diline hiç benzemiyordu ("basit"). Yerine hafta okları.

    // O günün kayıtları bir kez süzülür: çizelge her adımda bunlara bakıyor.
    const dayRes = useMemo(
        () => reservations.filter((r) => r.date === date && r.status !== 'cancelled'),
        [reservations, date],
    );

    /** Belirli bir personel [t, t+süre) aralığında dolu mu? */
    const isBusy = (t: string, sId: string, len = duration): boolean => {
        const start = toMin(t);
        const end = start + len;
        return dayRes.some((r) => r.staffId === sId && toMin(r.startTime) < end && toMin(r.endTime) > start);
    };

    // Kaynak doluluğu KAPASİTEYE göre ölçülür (bkz. lib/resourceCapacity).
    // Eskiden tek bir çakışma yeterliydi: kapasitesi 2 olan bir kabin ilk
    // seanstan sonra eleniyordu — oysa DB guard'ı (060) kapasiteye kadar izin
    // veriyor, yani UI kendini DB'den daha katı kısıtlıyordu.
    const busyIntervals = useMemo(() => dayRes
        .filter((r) => r.resourceId)
        .map((r) => ({ resourceId: r.resourceId, start: toMin(r.startTime), end: toMin(r.endTime) })),
        [dayRes]);

    const freeResource = (t: string): Resource | undefined =>
        pickFreeResource(activeResources, busyIntervals, toMin(t), toMin(t) + duration);

    // Kabin tanımlı bir salonda kabinsiz seans yürümez. Eskiden hepsi doluyken
    // autoResource sessizce undefined dönüyor ve kayıt kabinsiz oluşuyordu:
    // takvimde kabin şeridine düşmeyen, kimsenin fark etmediği bir seans.
    const resourceBusy = (t: string, len = duration): boolean => {
        const start = toMin(t);
        const end = start + len;
        const picked = resourceId ? activeResources.find((r) => r.id === resourceId) : undefined;
        if (picked) return isResourceFull(picked, busyIntervals, start, end);
        if (resourceId) return false;   // silinmiş/pasif kaynak seçili kalmış
        return allResourcesFull(activeResources, busyIntervals, start, end);
    };

    // Personeli atanmamış randevular DB'de tek bir kişi gibi çakışır
    // (060 guard'ında `staff_id IS NOT DISTINCT FROM`, NULL = NULL sayılır).
    // Personel kaydı hiç yoksa randevu atanmamış kaydedileceği için UI de
    // aynı kuralı uygulamalı — yoksa boş görünen saat kayıtta reddedilir.
    const unassignedBusy = (t: string, len = duration): boolean => {
        const start = toMin(t);
        const end = start + len;
        return dayRes.some((r) => !r.staffId && toMin(r.startTime) < end && toMin(r.endTime) > start);
    };

    /** O gün personele düşen randevu sayısı — otomatik atamada yük dengesi için. */
    const dayLoad = (sId: string) => dayRes.filter((r) => r.staffId === sId).length;

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

    // Şeritler: tek uzmanda "fark etmez" anlamsız; personel kaydı yoksa tek şerit.
    const lanes: Lane[] = activeStaff.length === 0
        ? [{ key: '__none', label: 'Seans', staffId: undefined }]
        : [
            ...(activeStaff.length > 1 ? [{ key: '__any', label: 'Fark etmez', staffId: '' }] : []),
            ...activeStaff.map((s) => ({ key: s.id, label: s.name, staffId: s.id, load: dayLoad(s.id) })),
        ];
    const laneOf = (sId: string): string => sId
        || (activeStaff.length === 0 ? '__none' : activeStaff.length === 1 ? activeStaff[0].id : '__any');
    const selectedLane = laneOf(staffId);

    // Bir şeritte [t, t+len) dolu mu? Eski busySlot'un şerit başına hâli.
    const laneBusy = (lane: Lane, t: string, len = duration): boolean => {
        if (resourceBusy(t, len)) return true;
        if (lane.staffId === undefined) return unassignedBusy(t, len);
        if (lane.staffId === '') return !activeStaff.some((s) => !isBusy(t, s.id, len));   // herkes dolu
        return isBusy(t, lane.staffId, len);
    };

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const isToday = date === toISODate(now);
    const isPast = (t: string) => isToday && toMin(t) <= nowMin;

    // Çizelgenin ölçeği: ilk adımın saat başından son adımın bittiği saate.
    const viewStart = slotTimes.length ? Math.floor(toMin(slotTimes[0]) / 60) * 60 : 0;
    const workEnd = slotTimes.length ? toMin(slotTimes[slotTimes.length - 1]) + step : 0;
    const viewEnd = Math.max(viewStart + 60, Math.ceil(workEnd / 60) * 60);
    const hours = (viewEnd - viewStart) / 60;
    const y = (m: number) => ((Math.min(Math.max(m, viewStart), viewEnd) - viewStart) / 60) * HOUR_PX;
    const box = (a: number, b: number) => ({ top: y(a), height: Math.max(0, y(b) - y(a)) });
    const hourMarks = Array.from({ length: hours + 1 }, (_, i) => viewStart / 60 + i);

    // Açılışta ve gün değişince ilgili saate kay: seçili saat, bugünse şu an,
    // değilse mesai başı — bir saat öncesi de görünsün. Tıklayınca kaymaz.
    const calRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = calRef.current;
        if (!el) return;
        const target = slot ? toMin(slot) : isToday ? nowMin : viewStart;
        el.scrollTop = Math.max(0, y(target) - HOUR_PX);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

    // Kabinlerin hepsi doluysa o saatler HER şeritte kapalı — taralı bant
    const cabinFull = useMemo(
        () => activeResources.length === 0 ? [] : runsOf(slotTimes, step, (t) => resourceBusy(t, step)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [slotTimes, step, activeResources, busyIntervals, resourceId],
    );

    const slotLane = lanes.find((l) => l.key === selectedLane);
    const slotBad = Boolean(slot && slotLane && (laneBusy(slotLane, slot) || isPast(slot)));

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
            toast.success(`${created.name} eklendi`);
        }
    };

    const serviceNames = selectedServices.map((s) => s.name).join(' + ');
    const canSave = Boolean(customer && (selectedPlan || hasServices) && slot && !slotBad);

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
        // Kabin tanımlıysa kabinsiz kayıt oluşturulmaz. Çizelge bunu zaten
        // kapalı gösteriyor; burası aradaki boşluk için (başka cihazda az önce
        // dolmuş olabilir) — sessizce kabinsiz kaydetmektense reddetmek doğru.
        if (activeResources.length > 0 && !autoResource(slot)) {
            toast.error('Bu saatte boş kabin yok', { description: 'Başka saat ya da kabin seçin.' });
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
            toast.success(`Seans eklendi · ${customer.name}`);
            onCreated();
        }
    };

    // Form dolu mu? Dışarı tıklama yalnız boş formu kapatır — yanlışlıkla
    // pencerenin dışına tıklamak girilen her şeyi siliyordu (2026-10-21).
    // Bilinçli kapatma için çarpı ve Esc var. Pakedin kendiliğinden seçilmesi
    // kullanıcı girişi sayılmaz.
    const dirty = Boolean(
        (customer && customer !== initialCustomer) || query.trim() || hasServices || slot !== (preset?.slot || '')
        || date !== (preset?.date || todayISO) || resourceId !== (preset?.resourceId || ''),
    );
    const [nudge, setNudge] = useState(false);
    const onScrim = () => {
        if (!dirty) { onClose(); return; }
        setNudge(true);
        window.setTimeout(() => setNudge(false), 320);
    };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Alt bardaki özet: eksik parça soluk bir istemle yazılır, otomatik
    // atanan uzman ve kabin işaretli — kullanıcı kime/nereye verildiğini
    // kaydetmeden önce görsün.
    // Seçili gün şeritte görünmeyebilir (oklarla başka haftaya geçildiyse);
    // etiket şeritten değil doğrudan tarihten üretilir.
    const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const summary: React.ReactNode[] = [
        customer ? <b key="c">{customer.name}</b> : <span key="c" className="ask">Müşteri seçin</span>,
        selectedPlan ? <span key="s">{selectedPlan.title} · paketten</span>
            : hasServices ? <span key="s">{serviceNames}</span>
                : <span key="s" className="ask">hizmet seçin</span>,
        slot ? <b key="t" className={cn(slotBad && 'bad')}>{dayLabel} · {slot}–{addMinutes(slot, duration)}</b>
            : <span key="t" className="ask">çizelgeden saat seçin</span>,
    ];
    if (slot && !slotBad) {
        const sId = autoStaff(slot);
        const rId = autoResource(slot);
        const sName = activeStaff.find((s) => s.id === sId)?.name;
        const rName = activeResources.find((r) => r.id === rId)?.name;
        if (sName) summary.push(<span key="u">{sName}{!staffId && <i className="auto">otomatik</i>}</span>);
        if (rName) summary.push(<span key="k">{rName}{!resourceId && <i className="auto">otomatik</i>}</span>);
    }
    if (slotBad) summary.push(<span key="x" className="bad">bu saat artık uygun değil</span>);
    // Fiyat özetin sonunda değil, düğmenin yanında sabit: üç hizmet seçilince
    // özet sığmıyor ve en önemli rakam "₺2.3" diye kesiliyordu (2026-10-21).
    const priceLabel = selectedPlan ? '₺0' : totalPrice > 0 ? `₺${totalPrice.toLocaleString('tr-TR')}` : '';

    // Portal ile body'ye taşınır: aksi halde .bpk (Paketler) gibi kapsayıcıların
    // scoped `button{color:inherit}` reset'i modalın metin renklerini ezip
    // seçili (siyah) satırlardaki yazıyı görünmez yapıyordu.
    return createPortal(
        <div className={cn('dash-theme bsm fixed inset-0 z-[100]', dark && 'dark')}>
            <div className="bsm-scrim" onClick={onScrim} />
            <div className={cn('bsm-modal', nudge && 'nudge')} role="dialog" aria-modal="true" aria-label="Yeni seans">
                <div className="bsm-head">
                    <h2>Yeni seans</h2>
                    {/* Seçili gün — eskiden hep bugünün tarihi yazıyordu, Cumartesi
                        seçilince de "Çarşamba" diyordu (2026-10-21) */}
                    <span className="ctx">· {dayLabel}</span>
                    <button type="button" onClick={onClose} aria-label="Kapat" className="bsm-x"><X /></button>
                </div>

                <div className="bsm-body">
                    {/* Sol: müşteri + hizmet/paket */}
                    <div className="bsm-col bsm-left">
                        <section>
                            <div className="bsm-sec-h"><span className="eyebrow">Müşteri</span></div>
                            {!customer ? (
                                <>
                                    <label className="bsm-search">
                                        <Search />
                                        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya telefon yaz…" />
                                    </label>
                                    {searchResults.length > 0 && (
                                        <div className="bsm-results">
                                            {searchResults.map((c) => (
                                                <button key={c.id} type="button" onClick={() => { setCustomer(c); setQuery(''); }}>
                                                    <span className="av">{initialsOf(c.name)}</span>
                                                    <span className="tx"><b>{c.name}</b><small>{c.phone}</small></span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {noResults && (
                                        <div className="bsm-quick">
                                            <p>Kayıtlı değil — hemen ekle</p>
                                            <input value={quickName} onChange={(e) => setQuickNameRaw(e.target.value)} placeholder="Ad Soyad" />
                                            <input value={quickPhone} onChange={(e) => setQuickPhoneRaw(e.target.value)} placeholder="05xx xxx xx xx" inputMode="tel" />
                                            <button type="button" onClick={quickAdd} disabled={!quickName.trim() || quickPhone.replace(/\D/g, '').length < 10 || quickAdding}>
                                                <Check />{quickAdding ? 'Ekleniyor…' : 'Ekle ve seç'}
                                            </button>
                                            {(() => {
                                                const digits = quickPhone.replace(/\D/g, '').length;
                                                if (!quickName.trim()) return <small>Ad Soyad gerekli</small>;
                                                if (digits > 0 && digits < 10) return <small className="warn">Telefon en az 10 haneli olmalı ({digits}/10)</small>;
                                                if (digits === 0) return <small>Telefon numarası gerekli</small>;
                                                return null;
                                            })()}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="bsm-cust">
                                    <span className="av">{initialsOf(customer.name)}</span>
                                    <span className="tx"><b>{customer.name}</b><small>{customer.phone}{activePlans.length > 0 && ` · ${activePlans.length} aktif paket`}</small></span>
                                    {!initialCustomer && <button type="button" onClick={() => { setCustomer(null); setSelectedPlan(null); }}>Değiştir</button>}
                                </div>
                            )}
                            {customer && selectedPlan && (
                                <p className="bsm-note ok">Aktif paketi bulundu: <b>{selectedPlan.title}</b> — otomatik seçildi, ücret alınmaz.</p>
                            )}
                            {customer && riskFlags.map((flag) => (
                                <p key={flag.key} className="bsm-note risk">
                                    {flag.label} kaydı var{flag.note ? ` — ${flag.note}` : ''}; ilgili hizmetler kapalı.
                                </p>
                            ))}
                        </section>

                        <section>
                            <div className="bsm-sec-h">
                                <span className="eyebrow">Hizmet</span>
                                {hasServices
                                    ? <span className="note">{selectedServices.length} seçili · {duration} dk<button type="button" onClick={() => setSelectedServices([])}>Temizle</button></span>
                                    : <span className="note">Birden fazla seçilebilir</span>}
                            </div>
                            <div className="bsm-list">
                                {activePlans.map((p) => {
                                    const verdict = blockedFor({ name: p.title });
                                    const blocked = verdict.blocked;
                                    const on = selectedPlan?.id === p.id;
                                    return (
                                        <button key={p.id} type="button" disabled={blocked} title={verdict.message}
                                            onClick={() => { setSelectedPlan(p); setSelectedServices([]); }}
                                            className={cn('bsm-svc', on && 'on')}>
                                            {on ? <span className="ord"><Check /></span> : <i style={{ background: planService(p)?.color || 'var(--dc-purple)' }} />}
                                            <span className="n">{p.title}</span>
                                            {/* Süre yok: dar sütunda paketin adı kesiliyordu; süre alt barda */}
                                            {blocked ? <span className="d">kapalı</span> : <span className="pkg" title="Paketten · ücret alınmaz">kalan {p.sessionCount - p.sessionsDone}</span>}
                                        </button>
                                    );
                                })}
                                {services.map((s) => {
                                    const blocked = blockedFor(s).blocked;
                                    const order = selectedServices.findIndex((x) => x.id === s.id);
                                    const on = order >= 0;
                                    return (
                                        <button key={s.id} type="button" disabled={blocked} onClick={() => toggleService(s)}
                                            aria-pressed={on}
                                            title={blocked ? 'Hamilelik nedeniyle kapalı' : on ? 'Seçimden çıkar' : 'Seansa ekle'}
                                            className={cn('bsm-svc', on && 'on')}>
                                            {on ? <span className="ord">{order + 1}</span> : <i style={{ background: s.color }} />}
                                            <span className="n">{s.name}</span>
                                            <span className="d">{blocked ? 'kapalı' : `${s.duration} dk`}</span>
                                            <span className="p">{blocked ? '' : s.price ? `₺${s.price.toLocaleString('tr-TR')}` : ''}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    </div>

                    {/* Sağ: gün şeridi + zaman çizelgesi + kabin */}
                    <div className="bsm-col bsm-right">
                        <section>
                            <div className="bsm-sec-h">
                                <span className="eyebrow">Gün</span>
                                <span className="note">{weekRange}</span>
                            </div>
                            <div className="bsm-days" style={{ '--n': dateOptions.length } as React.CSSProperties}>
                                <button type="button" className="nav" aria-label="Önceki hafta" title="Önceki hafta"
                                    disabled={week === 0} onClick={() => setWeek((w) => Math.max(0, w - 1))}>
                                    <ChevronLeft />
                                </button>
                                {dateOptions.map((d) => (
                                    <button key={d.iso} type="button" onClick={() => { setDate(d.iso); setSlot(''); setHover(null); }}
                                        className={cn(d.iso === date && 'on', d.off && 'off')} title={d.off ? `${d.long} · kapalı` : d.long}>
                                        <small>{d.top}</small><b>{d.day}</b>
                                    </button>
                                ))}
                                <button type="button" className="nav" aria-label="Sonraki hafta" title="Sonraki hafta"
                                    disabled={week >= MAX_WEEK} onClick={() => setWeek((w) => Math.min(MAX_WEEK, w + 1))}>
                                    <ChevronRight />
                                </button>
                            </div>
                        </section>

                        <section>
                            <div className="bsm-sec-h">
                                <span className="eyebrow">Saat</span>
                                {/* İmlecin altındaki yer yazılır — tıklamadan nereye konacağı görünsün */}
                                <span className={cn('note', hover && 'live')}>
                                    {hover
                                        ? `${lanes.find((l) => l.key === hover.lane)?.label} · ${hover.t}–${addMinutes(hover.t, duration)}`
                                        : slot ? `${duration} dk · ${slot}–${addMinutes(slot, duration)}` : `Boş yere tıkla · ${duration} dk`}
                                </span>
                            </div>
                            {slotTimes.length === 0 ? (
                                <p className="bsm-closed">Bu gün işletme kapalı — çalışma saatlerini Ayarlar'dan değiştirebilirsiniz.</p>
                            ) : (
                                <div className="bsm-cal" ref={calRef} style={{ '--cols': lanes.length } as React.CSSProperties}
                                    onMouseLeave={() => setHover(null)}>
                                    {/* Sütun başlıkları kayarken üstte kalır */}
                                    <div className="bsm-cal-head">
                                        <span />
                                        {lanes.map((lane) => (
                                            <span key={lane.key} className={cn(lane.staffId === '' && 'any')} title={lane.label}>
                                                <b>{lane.label}</b>
                                                <small>{lane.staffId === '' ? 'ilk boş uzman' : lane.load ? `${lane.load} seans` : 'boş'}</small>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="bsm-cal-body" style={{ height: y(viewEnd) }}>
                                        <div className="times">
                                            {hourMarks.map((h) => <span key={h} style={{ top: y(h * 60) }}>{String(h).padStart(2, '0')}:00</span>)}
                                        </div>
                                        {lanes.map((lane) => {
                                            const blocks = lane.staffId === ''
                                                ? runsOf(slotTimes, step, (t) => !activeStaff.some((s) => !isBusy(t, s.id, step))).map(([a, b]) => ({ a, b, time: '', text: 'herkes dolu' }))
                                                : dayRes
                                                    .filter((r) => (lane.staffId === undefined ? !r.staffId : r.staffId === lane.staffId))
                                                    .map((r) => ({ a: toMin(r.startTime), b: toMin(r.endTime), time: r.startTime.slice(0, 5), text: r.service || 'Seans' }));
                                            const isSel = slot && selectedLane === lane.key;
                                            const ghost = hover?.lane === lane.key && !(isSel && hover.t === slot) ? hover.t : null;
                                            return (
                                                <div key={lane.key} className={cn('col', lane.staffId === '' && 'any')}>
                                                    {/* Mesai dışı, geçmiş ve kabinlerin dolduğu saatler */}
                                                    {toMin(slotTimes[0]) > viewStart && <span className="off" style={box(viewStart, toMin(slotTimes[0]))} />}
                                                    {workEnd < viewEnd && <span className="off" style={box(workEnd, viewEnd)} />}
                                                    {isToday && nowMin > viewStart && <span className="past" style={box(viewStart, nowMin)} />}
                                                    {cabinFull.map(([a, b]) => <span key={`k${a}`} className="cab" style={box(a, b)} />)}
                                                    {blocks.map((x, i) => (
                                                        <span key={i} className="busy" style={box(x.a, x.b)}>
                                                            {y(x.b) - y(x.a) >= 20 && <>{x.time && <b>{x.time}</b>}{x.text}</>}
                                                        </span>
                                                    ))}
                                                    {/* Tıklanabilir adımlar — her biri bir düğme */}
                                                    {slotTimes.map((t) => {
                                                        const bad = laneBusy(lane, t) || isPast(t);
                                                        return (
                                                            <button key={t} type="button" className="cell" style={box(toMin(t), toMin(t) + step)}
                                                                aria-label={`${lane.label} · ${t}`} aria-disabled={bad}
                                                                onMouseEnter={() => setHover({ lane: lane.key, t })}
                                                                onFocus={() => setHover({ lane: lane.key, t })}
                                                                onClick={() => {
                                                                    if (bad) return;
                                                                    setSlot(t);
                                                                    setStaffId(lane.staffId ?? '');
                                                                }} />
                                                        );
                                                    })}
                                                    {ghost && (
                                                        <span className={cn('ghost', (laneBusy(lane, ghost) || isPast(ghost)) && 'bad')}
                                                            style={box(toMin(ghost), toMin(ghost) + duration)}>
                                                            {duration >= 25 && <b>{ghost}–{addMinutes(ghost, duration)}</b>}
                                                        </span>
                                                    )}
                                                    {isSel && (
                                                        <span className={cn('sel', slotBad && 'bad')} style={box(toMin(slot), toMin(slot) + duration)}>
                                                            <b>{slot}–{addMinutes(slot, duration)}</b>
                                                        </span>
                                                    )}
                                                    {isToday && nowMin > viewStart && nowMin < viewEnd && <span className="now" style={{ top: y(nowMin) }} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="bsm-legend">
                                <span><i className="l-busy" />Dolu</span>
                                {activeResources.length > 0 && <span><i className="l-cab" />Kabinler dolu</span>}
                                <span><i className="l-sel" />Yeni seans</span>
                            </div>
                        </section>

                        {activeResources.length > 0 && (
                            <section>
                                <div className="bsm-sec-h"><span className="eyebrow">Kabin</span></div>
                                <div className="bsm-chips">
                                    <button type="button" className={cn(!resourceId && 'on')} onClick={() => setResourceId('')}>Fark etmez</button>
                                    {activeResources.map((r) => (
                                        <button key={r.id} type="button" className={cn(resourceId === r.id && 'on')} onClick={() => setResourceId(r.id)}>{r.name}</button>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                </div>

                {/* alt bar */}
                <div className="bsm-foot">
                    <p className="bsm-sum">
                        {summary.map((node, i) => <Fragment key={i}>{i > 0 && <span className="sep" />}{node}</Fragment>)}
                    </p>
                    {priceLabel && (
                        <span className="bsm-price">
                            {selectedPlan && <small>paketten</small>}
                            <b>{priceLabel}</b>
                        </span>
                    )}
                    <button type="button" onClick={create} disabled={!canSave || saving} className="bsm-go">
                        <Check />{saving ? 'Kaydediliyor…' : 'Seansı oluştur'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
