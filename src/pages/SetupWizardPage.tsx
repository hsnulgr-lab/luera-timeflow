import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useStaff } from '@/hooks/useStaff';
import { useStaffLimit } from '@/hooks/useStaffLimit';
import { readOrgSolo } from '@/hooks/useOrgSolo';
import { useModules } from '@/hooks/useModules';
import { useOrgProfile, slugify } from '@/hooks/useOrgProfile';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useEntitlement } from '@/hooks/useEntitlement';
import { waConnect, waSetFeatures, waState } from '@/services/whatsapp';
import { personelEklendiBildirimi } from '@/lib/uygulamaBaglantisi';
import { SECTOR_PROFILES, profileForSector } from '@/lib/sectorProfiles';
import { serviceSeedFor } from '@/lib/serviceSeeds';
import { SETUP_SCREENS, isSavedServiceId, ownBusinessName, screenFor, type ScreenKey } from '@/lib/setupProgress';
import { TRIAL_DAYS, formatTRY, planById, priceOf } from '@/lib/plans';
import { slugLive } from '@/pages/settings/ayarlarModel';
import { isTimeout, withTimeout } from '@/pages/settings/useTaslak';
import { KurulumIkon as Ic, KurulumIkonlar } from './kurulumIkonlar';
import type { Service, WorkingHours } from '@/types';
import './setupWizard.css';

// ============================================================================
// Kurulum sihirbazı v2 — /kurulum
// ----------------------------------------------------------------------------
// Tasarım: "Luera Masaustu - Kurulum v2" (Claude Design, 2026-10-19); ölçüler
// ve metinler oradan. Kullanıcı kararı: "çok az adım, az ve öz" — sekiz ekran
// üçe indi: İşletmeniz, Hizmetler ve saatler, WhatsApp; ardından bitiş.
// Sorulmayan her şey (adres, telefon, logo, randevu aralığı, hizmet rengi,
// roller) varsayılanla kurulur ve Ayarlar'da aynı adla durur.
//
// Korunan kararlar:
//   1. HİZMET LİSTESİ DOLU AÇILIR. Kullanıcının işi eklemek değil çıkarmak.
//   2. "YALNIZ BEN ÇALIŞIYORUM" eşit ağırlıkta bir kart — hedef kitlenin
//      büyük kısmı tek kişilik. Telefondaki tek kişilik kiple AYNI bayrak
//      (`set_business_mode`, göç 108); v1 onu hiç yazmıyordu.
//   3. SEKTÖR SÖZCÜKLERİ GÖMÜLÜ DEĞİL: "Koltuk/Kabin", "tedavi/ders"
//      registry'den (sectorProfiles) gelir.
//   4. HER EKRAN DEVAM'DA KAYDEDER; sunucu onaylamadan sonraki ekran açılmaz
//      (Ş3). Sonda topluca kaydetmek, yarıda bırakanın hiçbir şeyini
//      saklamamaktı.
//
// Yazılan yerler v1 ile aynı: ad ve sektör `settings` (updateSettings),
// modüller `applySectorDefaults`, randevu adresi `organizations.slug`, ekip
// `staff` (addStaff), yerler `resources`, saatler ve hizmetler
// `updateSettings`, asistan `waSetFeatures`.
// ============================================================================

const uid = () => Math.random().toString(36).slice(2, 10);
const SERVICE_COLORS = ['#FF5A1F', '#3F9D9A', '#8E70B2', '#5B7CC2', '#E8973C', '#5E9C6C', '#C95A8E'];

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
/** Pazartesiden başlar — takvim sırası değil, insan sırası. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Hazır çalışma düzenleri. Yedi günü tek tek girmek en yorucu adımdı. */
const HOUR_PRESETS: { label: string; build: () => WorkingHours[] }[] = [
    {
        label: 'Hafta içi 09:00–19:00 · Cmt 10:00–16:00 · Paz kapalı',
        build: () => DAY_NAMES.map((dayName, day) => ({
            day, dayName,
            start: day === 6 ? '10:00' : '09:00',
            end: day === 6 ? '16:00' : '19:00',
            isOff: day === 0,
        })),
    },
    {
        label: 'Her gün 10:00–20:00',
        build: () => DAY_NAMES.map((dayName, day) => ({ day, dayName, start: '10:00', end: '20:00', isOff: false })),
    },
    {
        label: 'Hafta içi 08:00–17:00',
        build: () => DAY_NAMES.map((dayName, day) => ({
            day, dayName, start: '08:00', end: '17:00', isOff: day === 0 || day === 6,
        })),
    },
];

const sameHours = (a: WorkingHours[], b: WorkingHours[]) => DAY_ORDER.every((d) => {
    const x = a.find((h) => h.day === d);
    const y = b.find((h) => h.day === d);
    if (!x || !y) return false;
    return x.isOff === y.isOff && (x.isOff || (x.start === y.start && x.end === y.end));
});

/** Addan randevu adresi: Türkçe harfler sadeleşir, boşluk tire olur. */
const slugFromName = (v: string) => slugify(slugLive(v));

/**
 * Adres boş mu? Herkese açık randevu ucu (`public-booking`) adresi çözer:
 * 404 = boş; 200 ya da 403 (işletme var, kapısı kapalı) = alınmış. Ağ
 * hatasında null — bilinmiyor, uyarı çizilmez; kayıtta 23505 yine yakalanır.
 */
async function slugIsFree(slug: string): Promise<boolean | null> {
    const { error } = await supabase.functions.invoke('public-booking', { body: { action: 'profile', slug } });
    if (!error) return false;
    const status = (error as { context?: Response }).context?.status;
    return status === 404 ? true : status === 403 ? false : null;
}

/** "26 Ekim'de" — ayın adına gelen bulunma eki. */
const MONTH_AT = ["'ta", "'ta", "'ta", "'da", "'ta", "'da", "'da", "'ta", "'de", "'de", "'da", "'ta"];
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

type Team = 'solo' | 'team';
type Screen = ScreenKey | 'bitti';
/** Kaydetme sonucu: sunucu reddetti ya da cevap gelmedi (Ş3). */
type SaveFail = 'error' | 'unknown';
type SeedRow = {
    id: string; name: string; duration: number; price?: number; color: string; on: boolean;
    /** Kullanıcının eklediği satır — ad alanı yazılabilir. */
    custom?: boolean;
    /** Kayıtlı hizmetin kendisi: reçete, etiket ve dönüş günü kayıtta korunur. */
    orig?: Service;
    recallDays?: number; tags?: string[];
};
type Qr =
    | { st: 'idle' } | { st: 'loading' } | { st: 'fail' }
    | { st: 'live'; src: string; left: number } | { st: 'dead'; src: string };

export function SetupWizardPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { dark } = useTheme();
    const { user, orgId } = useAuth();
    const { settings, updateSettings, isSettingsLoading, settingsError, reservations } = useReservations();
    const { resources, addResource, isLoading: resLoading, error: resError } = useResources();
    const { staff, addStaff, refetch: refetchStaff, isLoading: staffLoading, error: staffError } = useStaff();
    const activeStaff = staff.filter((s) => s.isActive);
    const { ensureRoom } = useStaffLimit(staff.filter((s) => s.isActive).length);
    const { applySectorDefaults } = useModules();
    const { profile: org, savePartial, loading: orgLoading, error: orgError } = useOrgProfile();
    const { connection, refresh: refreshWa, loading: waLoading } = useWhatsApp();
    const ent = useEntitlement();

    // Ekran ANAHTARLA tutulur, indisle değil. `?adim=` şeritten ekran
    // anahtarı (hizmetler), ödeme duvarından adım anahtarı (identity) taşır;
    // ikisi de ekrana çevrilir — şerit "2 / 3" deyip sihirbazı baştan açmak,
    // bitmiş ekranları yeniden gezdirmek demekti.
    const [screen, setScreenState] = useState<Screen>(() => screenFor(searchParams.get('adim')) ?? 'isletme');
    const setScreen = (s: Screen) => {
        setScreenState(s);
        setFail(null);
        if (s !== 'bitti') setSearchParams({ adim: s }, { replace: true });
    };
    const [saving, setSaving] = useState(false);
    const [fail, setFail] = useState<SaveFail | null>(null);

    // ── K1 ──
    const [name, setName] = useState('');
    const [sector, setSector] = useState('');
    const [team, setTeam] = useState<Team | null>(null);
    const [names, setNames] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState('');
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [slug, setSlug] = useState('');
    const [slugEdited, setSlugEdited] = useState(false);
    const [slugEditing, setSlugEditing] = useState(false);
    const [slugAlt, setSlugAlt] = useState<string | null>(null);
    const [paidBandClosed, setPaidBandClosed] = useState(false);
    // ── K2 ──
    const [rows, setRows] = useState<SeedRow[] | null>(null);
    const [rowsSector, setRowsSector] = useState('');
    const [hours, setHours] = useState<WorkingHours[]>(() => HOUR_PRESETS[0].build());
    const [presetIdx, setPresetIdx] = useState<number | null>(0);
    const [daysOpen, setDaysOpen] = useState(false);
    // ── K3 ──
    const [qr, setQr] = useState<Qr>({ st: 'idle' });
    const [assistant, setAssistant] = useState(false);
    const [copied, setCopied] = useState(false);

    // ── Okuma ──
    // Tek kişilik bayrak ayrı okunur: undefined = okunuyor, null = okunamadı.
    const [soloFlag, setSoloFlag] = useState<boolean | null | undefined>(undefined);
    useEffect(() => {
        if (!orgId) return;
        let live = true;
        void readOrgSolo(orgId).then((v) => { if (live) setSoloFlag(v); });
        return () => { live = false; };
    }, [orgId]);

    const loading = !orgId || isSettingsLoading || orgLoading || staffLoading || resLoading || soloFlag === undefined;
    // Okunamayan bilgi boş liste gibi çizilmez (Ş7): boş sanıp kaydetmek
    // var olan randevu adresini ya da ekibi ezerdi.
    const loadError = Boolean(settingsError || orgError || staffError || resError) || soloFlag === null;

    const savedServices = settings.services.filter((s) => isSavedServiceId(s.id));
    const savedSector = settings.sector && settings.sector !== 'genel' ? settings.sector : '';

    // Form, bilgiler okununca BİR KEZ doldurulur — sonra kullanıcının.
    const hydrated = useRef(false);
    const [prefilled, setPrefilled] = useState({ name: false, team: false });
    useEffect(() => {
        if (loading || loadError || hydrated.current) return;
        hydrated.current = true;
        const n = ownBusinessName(settings.businessName, user?.name);
        const t: Team | null = soloFlag ? 'solo' : activeStaff.length > 0 ? 'team' : null;
        setName(n);
        setSector(savedSector);
        setTeam(t);
        setPrefilled({ name: Boolean(n), team: Boolean(t) });
        if (org.slug) { setSlug(org.slug); setSlugEdited(true); }
        const types = profileForSector(savedSector || 'genel').resourceTypes;
        setCounts(Object.fromEntries(types.map((ty) => [ty, Math.max(1, resources.filter((r) => r.type === ty).length)])));
        // Saatler: hizmetleri kayıtlıysa bu ekranı daha önce geçmiştir —
        // kayıtlı saatleri göster. Değilse ilk hazır düzen seçili gelir.
        if (savedServices.length && settings.workingHours?.length) {
            const idx = HOUR_PRESETS.findIndex((p) => sameHours(p.build(), settings.workingHours));
            setHours(settings.workingHours);
            setPresetIdx(idx >= 0 ? idx : null);
            setDaysOpen(idx < 0);
        }
        setAssistant(connection.features.assistant);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, loadError]);

    // ── Sektöre bağlı türetmeler ──
    const sp = profileForSector(sector || 'genel');
    const resourceTypes = sp.resourceTypes;
    const serviceWord = (sp.labels?.service || 'Hizmet').toLocaleLowerCase('tr');
    const servicesTitle = sp.labels?.services || 'Hizmetler';

    // ── Randevu adresi ──
    const host = window.location.host;
    const effSlug = slugEdited ? slug : slugFromName(name);
    const checkSlug = Boolean(effSlug) && effSlug !== org.slug;
    useEffect(() => {
        if (!checkSlug) { setSlugAlt(null); return; }
        let live = true;
        const t = window.setTimeout(async () => {
            for (let n = 1; n <= 5 && live; n++) {
                const cand = n === 1 ? effSlug : `${effSlug}-${n}`;
                const free = await slugIsFree(cand);
                if (!live) return;
                if (free === null) { setSlugAlt(null); return; }
                if (free) { setSlugAlt(n === 1 ? null : cand); return; }
            }
        }, 500);
        return () => { live = false; window.clearTimeout(t); };
    }, [effSlug, checkSlug]);
    const shownSlug = slugAlt ?? effSlug;

    async function saveSlug(): Promise<boolean> {
        if (!effSlug || effSlug === org.slug) return true;
        // Alınmışsa sonuna -2, -3… (Ş4). Ön kontrol yarışta kaybedebilir;
        // asıl karar benzersizlik kısıtında (23505).
        for (let n = 1; n <= 9; n++) {
            const cand = n === 1 ? effSlug : `${effSlug}-${n}`;
            let code: string | undefined;
            const ok = await savePartial({ slug: cand }, { quiet: true, onError: (c) => { code = c; } });
            if (ok) { setSlug(cand); setSlugEdited(true); setSlugAlt(null); return true; }
            if (code !== '23505') return false;
        }
        return false;
    }

    // ── K1 · kaydet ──
    const draftName = tagDraft.trim();
    const newNames = [...names, ...(draftName ? [draftName] : [])]
        .filter((n, i, a) => a.indexOf(n) === i && !activeStaff.some((s) => s.name.trim() === n));
    const teamCount = activeStaff.length + newNames.length;
    const k1Missing = !name.trim() ? 'İşletme adı gerekli'
        : !sector ? 'Ne iş yaptığınızı seçin'
            : !team ? 'Kaç kişi çalıştığını seçin'
                : team === 'team' && teamCount === 0 ? 'Ekipten en az bir ad yazın' : '';

    async function saveIsletme(): Promise<boolean> {
        const trimmed = name.trim();
        // Hizmetler yalnız GERÇEK olanlarla: yer tutucular gönderilseydi
        // veritabanına yazılırdı (bkz. isSavedServiceId).
        if (!(await updateSettings({ ...settings, businessName: trimmed, sector, services: savedServices }))) return false;
        // Sektör modülleri de belirler: avukatlık bürosu kasa modülüyle başlamasın.
        if (sector !== savedSector && !(await applySectorDefaults(sector))) return false;
        if (!(await saveSlug())) return false;
        // Telefondaki tek kişilik kiple aynı bayrak; tek kipte sahibin
        // personel satırını da aynı işlemde açar (göç 108).
        const { error } = await supabase.rpc('set_business_mode', { p_solo: team === 'solo', p_name: trimmed });
        if (error) return false;
        if (team === 'solo') void refetchStaff();
        if (team === 'team') {
            for (const [i, n] of newNames.entries()) {
                const added = await addStaff({
                    name: n, role: 'doctor', isActive: true,
                    color: SERVICE_COLORS[(activeStaff.length + i) % SERVICE_COLORS.length],
                });
                if (!added) return false;
            }
            if (newNames.length > 0) personelEklendiBildirimi(newNames.length > 1 ? 'Ekibiniz' : 'Personel');
            setNames([]);
            setTagDraft('');
        }
        // Yerler: "Koltuk 1, Yıkama 1…" diye kurulur; tek kişide birer tane.
        // Var olan silinmez, eksik olan eklenir.
        for (const type of resourceTypes) {
            const want = team === 'solo' ? 1 : counts[type] ?? 1;
            const have = resources.filter((r) => r.type === type).length;
            for (let i = have; i < want; i++) {
                if (!(await addResource({ type, name: `${type} ${i + 1}`, capacity: 1 }))) return false;
            }
        }
        return true;
    }

    // ── K2 ──
    /** Hizmet satırları sektör belli olunca kurulur. */
    function seedRows(forSector: string): SeedRow[] {
        // Kayıtlı hizmet varsa DOKUNULMAZ: sihirbazı sonradan açan bir
        // işletmenin listesini hazır setle ezmek veri kaybıdır.
        if (savedServices.length) {
            return savedServices.map((s) => ({
                id: s.id, name: s.name, duration: s.duration, price: s.price, color: s.color, on: true, orig: s,
            }));
        }
        return (serviceSeedFor(forSector)?.services ?? []).map((s, i) => ({
            id: uid(), name: s.name, duration: s.duration, on: true,
            color: s.color || SERVICE_COLORS[i % SERVICE_COLORS.length],
            recallDays: s.recallDays, tags: s.tags,
        }));
    }
    // K2'ye her girişte: liste yoksa, kaydedildiyse ya da sektör değiştiyse
    // (ve kayıtlı hizmet yoksa) yeniden kurulur.
    const rowsStale = useRef(false);
    useEffect(() => {
        if (screen !== 'hizmetler' || loading || loadError) return;
        if (!rows || rowsStale.current || (rowsSector !== sector && savedServices.length === 0)) {
            rowsStale.current = false;
            setRows(seedRows(sector));
            setRowsSector(sector);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screen, loading, loadError, sector]);
    const svcRows = rows ?? [];
    const activeRows = svcRows.filter((r) => r.on);
    const seedCount = svcRows.filter((r) => !r.custom).length;
    const setRow = (id: string, p: Partial<SeedRow>) => setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...p } : r)));

    async function saveHizmetler(): Promise<boolean> {
        const services: Service[] = activeRows.map((r) => ({
            ...r.orig,
            id: r.id,
            name: r.name.trim() || (sp.labels?.service || 'Hizmet'),
            duration: r.duration || settings.slotDuration || 30,
            color: r.color,
            price: r.price,
            ...(r.orig ? {} : { recallDays: r.recallDays, tags: r.tags }),
        }));
        const ok = await updateSettings({ ...settings, workingHours: hours, services });
        // Geri gelinirse liste kayıtlı hizmetlerden (veritabanı kimlikleriyle)
        // yeniden kurulsun; hazır satırların geçici kimliğiyle ikinci kayıt
        // hepsini silip yeniden eklerdi.
        if (ok) rowsStale.current = true;
        return ok;
    }

    // ── K3 · WhatsApp karesi ──
    const alive = useRef(true);
    const qrTimer = useRef<number | undefined>(undefined);
    const qrPoll = useRef<number | undefined>(undefined);
    const qrStarted = useRef(false);
    const stopQr = useCallback(() => {
        window.clearInterval(qrTimer.current);
        window.clearInterval(qrPoll.current);
        qrTimer.current = undefined;
        qrPoll.current = undefined;
    }, []);
    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; stopQr(); };
    }, [stopQr]);
    const startQr = useCallback(async () => {
        stopQr();
        setQr({ st: 'loading' });
        const res = await waConnect();
        if (!alive.current) return;
        if (res?.connected) { setQr({ st: 'idle' }); await refreshWa(); return; }
        if (!res?.qr) { setQr({ st: 'fail' }); return; }
        const src = res.qr.startsWith('data:') ? res.qr : `data:image/png;base64,${res.qr}`;
        // Kare 60 saniye geçerli; süre dolunca kendiliğinden YENİLENMEZ —
        // silikleşip "Kareyi yenile" çıkar. Arkada sessizce yenilenen kare,
        // telefonunu tam o anda kaldıranı ıskalatıyordu.
        setQr({ st: 'live', src, left: 60 });
        qrTimer.current = window.setInterval(() => {
            setQr((q) => (q.st === 'live' ? { ...q, left: q.left - 1 } : q));
        }, 1000);
        qrPoll.current = window.setInterval(async () => {
            const st = await waState();
            if (st?.connected && alive.current) { stopQr(); setQr({ st: 'idle' }); await refreshWa(); }
        }, 3000);
    }, [stopQr, refreshWa]);
    useEffect(() => {
        if (qr.st === 'live' && qr.left <= 0) { stopQr(); setQr({ st: 'dead', src: qr.src }); }
    }, [qr, stopQr]);
    const waConnected = connection.status === 'connected';
    // K3 açılınca kare kendiliğinden gelir; ekrandan çıkınca bırakılır.
    useEffect(() => {
        if (screen !== 'whatsapp') {
            if (qrStarted.current) { qrStarted.current = false; stopQr(); setQr({ st: 'idle' }); }
            return;
        }
        if (waLoading || waConnected || qrStarted.current) return;
        qrStarted.current = true;
        void startQr();
    }, [screen, waLoading, waConnected, startQr, stopQr]);

    // ── Devam ──
    // Cevap süre içinde gelmezse sonuç bilinmiyor: "kaydedilmedi" değil
    // "doğrulayamadık" (Ayarlar v1'deki ayrım). İşletmeniz ekranı birden çok
    // yazma yapıyor (ayar, modül, adres, kip, ekip, yerler) — payı geniş.
    async function run(save: () => Promise<boolean>, next: Screen, ms?: number) {
        if (saving) return;
        setSaving(true);
        setFail(null);
        const out = await withTimeout(save().catch(() => false), ms);
        if (!alive.current) return;
        setSaving(false);
        if (isTimeout(out)) { setFail('unknown'); return; }
        if (!out) { setFail('error'); return; }
        setScreen(next);
    }
    const continueIsletme = async () => {
        // Paket sınırı kayıttan ÖNCE sorulur: vazgeçen yarım kayıtla kalmasın;
        // pencere açıkken süre sayacı da işlemesin.
        if (team === 'team' && newNames.length > 0 && !(await ensureRoom(newNames.length))) return;
        await run(saveIsletme, 'hizmetler', 30_000);
    };
    const finishWa = () => run(async () => {
        if (waConnected && assistant !== connection.features.assistant) {
            const ok = await waSetFeatures({ assistant });
            if (!ok) return false;
            await refreshWa();
        }
        return true;
    }, 'bitti');

    // ══════════════════════════════════════════════════════════ PARÇALAR ════
    // Bunlar bileşen DEĞİL, işaretleme döndüren yardımcı: render sırasında
    // bileşen tanımlamak React'in kimliklerini her turda değiştirir.
    const at = screen === 'bitti' ? SETUP_SCREENS.length : SETUP_SCREENS.findIndex((s) => s.key === screen);
    const top = (
        <div className="wt">
            <div className="brand" aria-label="luera timeflow">luera<span className="tf">timeflow</span></div>
            <div className="pg" role="img" aria-label={screen === 'bitti' ? 'Kurulum tamamlandı' : `Kurulum ${at + 1} / ${SETUP_SCREENS.length}`}>
                {SETUP_SCREENS.map((s, i) => (
                    <div key={s.key} className={`sg${i < at ? ' dn' : i === at ? ' cur' : ''}`}>
                        <i /><span>{i + 1} · {s.label}</span>
                    </div>
                ))}
            </div>
            {screen === 'bitti' ? <span /> : (
                <button type="button" className="later" onClick={() => navigate('/')}>Sonra tamamlarım</button>
            )}
        </div>
    );
    const failBand = fail && (
        <div className="fband"><div>
            {fail === 'error' ? (
                <div className="bnd e" role="alert"><Ic n="alert" /><span>Kaydedilemedi, tekrar deneyin.</span></div>
            ) : (
                <div className="bnd w" role="alert"><Ic n="alert" /><span>Kaydedildiğini doğrulayamadık. Tekrar deneyin; girdikleriniz yerinde.</span></div>
            )}
        </div></div>
    );
    const foot = (o: {
        back?: Screen; msg?: React.ReactNode; msgIcon?: string; sec?: React.ReactNode;
        pri?: string | false; off?: boolean; onPri?: () => void;
    }) => (
        <div className="fb"><div className="fbi">
            {o.back && (
                <button type="button" className="btn3" disabled={saving} onClick={() => setScreen(o.back!)}>
                    <Ic n="chl" />Geri
                </button>
            )}
            <span className="fmsg">{o.msg && <>{o.msgIcon && <Ic n={o.msgIcon} />}<span>{o.msg}</span></>}</span>
            {o.sec}
            {o.pri !== false && (saving ? (
                <button type="button" className="btn off" aria-disabled="true">
                    Kaydediliyor <span className="wait" aria-hidden="true"><i /><i /><i /></span>
                </button>
            ) : (
                <button type="button" className={o.off ? 'btn off' : 'btn'} aria-disabled={o.off || undefined}
                    onClick={o.off ? undefined : o.onPri}>
                    {o.pri || 'Devam'}<Ic n="arr" />
                </button>
            ))}
        </div></div>
    );
    const shell = (body: React.ReactNode, footer: React.ReactNode) => (
        <div className="kv-t kv" data-theme={dark ? 'dark' : 'light'}>
            <KurulumIkonlar />
            {top}
            <div className="wb"><div className="wc" key={screen}>{body}</div></div>
            {failBand}
            {footer}
        </div>
    );
    const sk = (w: string, h: number) => <span className="sk" style={{ width: w, height: h }} />;

    // ══════════════════════════════════════════════════ OKUNUYOR / OKUNAMADI ════
    // WhatsApp ekranı bu bilgilere dayanmıyor; karenin kendi "hazırlanıyor" hâli var.
    const needsData = screen === 'isletme' || screen === 'hizmetler';
    if (needsData && loadError) {
        const title = SETUP_SCREENS.find((s) => s.key === screen)?.label ?? 'Kurulum';
        return shell(<>
            <div className="wh"><h1>{title}</h1></div>
            <div className="err" role="alert">
                <Ic n="alert" />
                <h2>Bilgileriniz okunamadı — yenileyin</h2>
                <p>Kayıtlı bilgileriniz silinmedi; yalnız şu an gösterilemiyor. Okunmadan bu ekranda değişiklik yapılmaz.</p>
                <button type="button" className="btn2 sm" onClick={() => window.location.reload()}><Ic n="refresh" />Yenile</button>
            </div>
        </>, foot({ back: at > 0 ? SETUP_SCREENS[at - 1].key : undefined, msg: 'Bilgiler okunmadan devam edilmez', off: true }));
    }
    if (needsData && (loading || (screen === 'hizmetler' && !rows))) {
        return shell(screen === 'hizmetler' ? <>
            <div className="wh">{sk('440px', 34)}{sk('300px', 18)}</div>
            <div className="cols">
                <div>
                    <div className="sh">{sk('120px', 20)}</div>
                    <div className="tbl">{Array.from({ length: 8 }, (_, i) => (
                        <div className="tr" key={i}>{sk('22px', 22)}{sk('70%', 16)}{sk('100%', 36)}{sk('100%', 36)}</div>
                    ))}</div>
                </div>
                <div><div className="sh">{sk('170px', 20)}</div><div className="pres">{sk('100%', 56)}{sk('100%', 56)}{sk('100%', 56)}</div></div>
            </div>
        </> : <>
            <div className="wh">{sk('520px', 34)}{sk('380px', 18)}</div>
            {[0, 1, 2].map((i) => (
                <section className="q" key={i}>
                    <div className="ql">{sk('140px', 18)}{sk('100%', 14)}</div>
                    <div className="qc">{sk('100%', 52)}</div>
                </section>
            ))}
        </>, foot({ back: at > 0 ? SETUP_SCREENS[at - 1].key : undefined, msg: 'Bilgileriniz okunuyor', off: true }));
    }

    // ══════════════════════════════════════════════════════════ K1 ════
    if (screen === 'isletme') {
        const plan = planById(ent.plan);
        const cycle = ent.cycle === 'yearly' ? 'yearly' : 'monthly';
        // Ş2a · ödemeden dönen ilk kez burada: deneme ya da abonelik okundu.
        // Yalnız Dodo aboneliğinde ("ödemeniz alındı" ancak orada doğru) ve
        // ödeme duvarının buraya gönderdiği hâlde (sektör seçilmemiş).
        const paid = !paidBandClosed && !savedSector && ent.ok && ent.dodoManaged && !ent.cardlessTrial
            && (ent.effective === 'trial' || ent.effective === 'active');
        let paidText = '';
        if (paid && ent.effective === 'trial') {
            const days = ent.shownDaysLeft && ent.shownDaysLeft > 0 ? ent.shownDaysLeft : TRIAL_DAYS;
            const until = ent.shownUntil ? new Date(ent.shownUntil) : null;
            const price = plan ? ` (₺${formatTRY(priceOf(plan, cycle))}/${cycle === 'yearly' ? 'yıl' : 'ay'})` : '';
            paidText = `Ödemeniz alındı. ${days} günlük deneme başladı`
                + (until ? `; ilk tahsilat ${dayMonth.format(until)}${MONTH_AT[until.getMonth()]}${price}.` : '.');
        } else if (paid) {
            paidText = `Ödemeniz alındı. ${plan ? `${plan.name} planı` : 'Aboneliğiniz'} aktif.`;
        }
        // Ş6 · telefonda açılmış işletme: ad ve kip geldi, sektör eksik.
        const fromPhone = prefilled.name && prefilled.team && !savedSector;
        // Ş5 · kaydı olan işletme sektörü değiştirmek üzere.
        const sectorWarn = Boolean(savedSector) && sector !== savedSector && reservations.length > 0;

        const addTag = (raw: string) => {
            const v = raw.trim();
            if (v && !names.includes(v) && !activeStaff.some((s) => s.name.trim() === v)) setNames([...names, v]);
            setTagDraft('');
        };
        const hintTypes = resourceTypes.length > 1
            ? `${resourceTypes.map((t) => `${t} 1`).join(', ')}…`
            : `${resourceTypes[0]} 1, ${resourceTypes[0]} 2…`;

        return shell(<>
            {paid && paidText && (
                <div className="bnd n" role="status">
                    <Ic n="card" /><span>{paidText}</span>
                    <button type="button" className="x" aria-label="Kapat" onClick={() => setPaidBandClosed(true)}><Ic n="x" /></button>
                </div>
            )}
            <div className="wh">
                <h1>Hoş geldiniz. Üç kısa soru, sonra hazırsınız.</h1>
                <p>Yaklaşık 4 dakika. Her ekran Devam'da kaydedilir; yarıda bırakırsanız kaldığınız yerden sürer.</p>
            </div>
            {fromPhone && (
                <div className="bnd n"><Ic n="phone" /><span>Telefonda verdiğiniz cevaplar geldi; yalnız ne iş yaptığınız eksik.</span></div>
            )}

            <section className="q">
                <div className="ql">
                    <h2>İşletme adı</h2>
                    <p>Müşterilerinize giden WhatsApp mesajlarında ve randevu sayfanızda görünür.</p>
                </div>
                <div className="qc">
                    <label className="inp">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ör. Özmen Güzellik"
                            aria-label="İşletme adı" autoComplete="organization" />
                    </label>
                    {slugEditing ? (
                        <label className="inp slugin">
                            <span className="pre">{host}/book/</span>
                            <input value={slug} autoFocus aria-label="Randevu adresi" spellCheck={false} autoComplete="off"
                                onChange={(e) => setSlug(slugLive(e.target.value))}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                onBlur={() => {
                                    const v = slugify(slug);
                                    setSlug(v);
                                    setSlugEdited(Boolean(v));
                                    setSlugEditing(false);
                                }} />
                        </label>
                    ) : !shownSlug ? (
                        <div className="slug"><Ic n="link" /><span>Ad yazınca randevu adresiniz burada oluşur.</span></div>
                    ) : (
                        <div className="slug">
                            <Ic n="link" /><span>Randevu adresiniz: <b>{host}/book/{shownSlug}</b></span>
                            <button type="button" className="lnk" onClick={() => { setSlug(effSlug); setSlugEdited(true); setSlugEditing(true); }}>
                                Düzenle
                            </button>
                        </div>
                    )}
                    {slugAlt && !slugEditing && (
                        <div className="slug w"><Ic n="info" /><span>Bu adres alınmış — {slugAlt} kullanılacak</span></div>
                    )}
                </div>
            </section>

            <section className="q">
                <div className="ql">
                    <h2>Ne iş yapıyorsunuz?</h2>
                    <p>Ekranlardaki kelimeler ve size hazırlanan hizmet listesi buna göre gelir.</p>
                </div>
                <div className="qc">
                    <div className="chips" role="group" aria-label="Sektör">
                        {Object.entries(SECTOR_PROFILES).filter(([k]) => k !== 'genel').map(([key, p]) => (
                            <button key={key} type="button" className="ch" aria-pressed={sector === key}
                                onClick={() => {
                                    setSector(key);
                                    const types = profileForSector(key).resourceTypes;
                                    setCounts((c) => Object.fromEntries(types.map((ty) => [ty, c[ty] ?? Math.max(1, resources.filter((r) => r.type === ty).length)])));
                                }}>
                                <Ic n={`sector-${key}`} />{p.label}
                            </button>
                        ))}
                    </div>
                    {sectorWarn && (
                        <div className="bnd w"><Ic n="alert" /><span>Müşteri ve randevu girdikten sonra sektörü değiştirmek bazı kayıtları yanlış ekranlarda gösterir. Emin değilseniz değiştirmeyin.</span></div>
                    )}
                </div>
            </section>

            <section className="q">
                <div className="ql">
                    <h2>Kaç kişi çalışıyor?</h2>
                    <p>Randevuların kime düşeceğini ve telefonda hangi ekranı göreceğinizi belirler.</p>
                </div>
                <div className="qc">
                    <div className="duo" role="group" aria-label="Kaç kişi çalışıyor">
                        <button type="button" className="who" aria-pressed={team === 'solo'} onClick={() => setTeam('solo')}>
                            <span className="hd"><Ic n="user" /><b>Yalnız ben çalışıyorum</b><span className="rd" /></span>
                            <span className="ds">Bütün randevular size gelir. Telefonda tek kişilik sade ekranı görürsünüz.</span>
                        </button>
                        <button type="button" className="who" aria-pressed={team === 'team'} onClick={() => setTeam('team')}>
                            <span className="hd"><Ic n="users" /><b>Ekibim var</b><span className="rd" /></span>
                            <span className="ds">Randevular kişilere dağılır, herkes kendi takvimini görür.</span>
                        </button>
                    </div>
                    {team === 'team' && (
                        <div className="tp">
                            <div className="fld">
                                <h3>Ekipte kimler var?</h3>
                                {/* Var olan kişiler burada çıkarılamaz: silmek Uzmanlar'ın işi. */}
                                <div className="tags" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
                                    {activeStaff.map((s) => <span key={s.id} className="tag fixed">{s.name}</span>)}
                                    {/* Kayıt sürerken eklenen ad iki kez çizilmesin. */}
                                    {names.filter((n) => !activeStaff.some((s) => s.name.trim() === n)).map((n) => (
                                        <span key={n} className="tag">{n}
                                            <button type="button" aria-label={`${n} adını çıkar`} onClick={() => setNames(names.filter((x) => x !== n))}>
                                                <Ic n="x" />
                                            </button>
                                        </span>
                                    ))}
                                    <input value={tagDraft} placeholder="Ad yazıp Enter'a basın" aria-label="Ekip arkadaşının adı"
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v.endsWith(',')) addTag(v.slice(0, -1)); else setTagDraft(v);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft); }
                                            if (e.key === 'Backspace' && !tagDraft && names.length) setNames(names.slice(0, -1));
                                        }}
                                        onBlur={() => addTag(tagDraft)} />
                                </div>
                                <p className="hint">Randevuyu kime verdiğinizi takvimde bu adlarla seçersiniz. En az bir ad gerekli.</p>
                            </div>
                            {resourceTypes.length > 0 && (
                                <div className="fld">
                                    <div className="cnts">
                                        {resourceTypes.map((ty) => {
                                            const v = counts[ty] ?? 1;
                                            const set = (n: number) => setCounts({ ...counts, [ty]: Math.min(50, Math.max(1, n)) });
                                            return (
                                                <div key={ty} className="cnt">
                                                    <span>Aynı anda kaç {ty.toLocaleLowerCase('tr')}?</span>
                                                    <button type="button" className="cb" aria-label="Azalt" disabled={v <= 1} onClick={() => set(v - 1)}><Ic n="minus" /></button>
                                                    <b>{v}</b>
                                                    <button type="button" className="cb" aria-label="Artır" onClick={() => set(v + 1)}><Ic n="plus" /></button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="hint">{hintTypes} diye kurulur; adlarını sonra Ayarlar'dan verirsiniz.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </>, foot({
            msg: k1Missing, msgIcon: k1Missing ? 'info' : undefined, off: Boolean(k1Missing),
            onPri: () => void continueIsletme(),
        }));
    }

    // ══════════════════════════════════════════════════════════ K2 ════
    if (screen === 'hizmetler') {
        const fromSeed = savedServices.length === 0;
        return shell(<>
            <div className="wh">
                {fromSeed ? (
                    <h1>Sizin için {seedCount} {serviceWord} hazırladık.</h1>
                ) : (
                    <h1>{servicesTitle} ve çalışma saatleri</h1>
                )}
                <p>Yapmadıklarınızın işaretini kaldırın, sonra saatlerinizi seçin.</p>
            </div>
            <div className="cols">
                <div>
                    <div className="sh">
                        <h2>{servicesTitle}</h2>
                        <p>Süre ve ücreti tahmini girin; sonra Ayarlar'dan düzeltirsiniz.</p>
                    </div>
                    <div className="tbl">
                        <div className="tr th"><span /><span>Ad</span><span>Süre</span><span>Ücret · isteğe bağlı</span></div>
                        {svcRows.map((r) => (
                            <div key={r.id} className={r.on ? 'tr' : 'tr off'}>
                                <button type="button" className="cbx" role="checkbox" aria-checked={r.on}
                                    aria-label={r.name || serviceWord} onClick={() => setRow(r.id, { on: !r.on })}>
                                    <Ic n="check" />
                                </button>
                                {r.custom ? (
                                    <input className="nm" value={r.name} placeholder={`${sp.labels?.service || 'Hizmet'} adı`}
                                        aria-label="Ad" autoFocus={!r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                                ) : <span className="nm">{r.name}</span>}
                                <label className="smi">
                                    <input type="number" inputMode="numeric" min={5} step={5} value={r.duration || ''} aria-label={`${r.name} süresi, dakika`}
                                        onChange={(e) => setRow(r.id, { duration: Number(e.target.value) || 0 })} />
                                    <em>dk</em>
                                </label>
                                <label className="smi">
                                    <input type="number" inputMode="numeric" min={0} placeholder="₺" value={r.price ?? ''} aria-label={`${r.name} ücreti`}
                                        onChange={(e) => setRow(r.id, { price: e.target.value === '' ? undefined : Number(e.target.value) })} />
                                    {r.price !== undefined && <em>₺</em>}
                                </label>
                            </div>
                        ))}
                        <button type="button" className="add" onClick={() => setRows([...svcRows, {
                            id: uid(), name: '', duration: settings.slotDuration || 30, on: true, custom: true,
                            color: SERVICE_COLORS[svcRows.length % SERVICE_COLORS.length],
                        }])}>
                            <Ic n="plus" />Yeni {serviceWord} ekleyin
                        </button>
                    </div>
                </div>
                <div>
                    <div className="sh">
                        <h2>Çalışma saatleri</h2>
                        <p>Müşteriniz yalnız bu saatlerde randevu alabilir. Tatil günlerini sonra takvimden kapatırsınız.</p>
                    </div>
                    <div className="pres" role="radiogroup" aria-label="Hazır saat düzeni">
                        {HOUR_PRESETS.map((p, i) => (
                            <button key={p.label} type="button" className="pre" role="radio" aria-checked={presetIdx === i} aria-pressed={presetIdx === i}
                                onClick={() => { setHours(p.build()); setPresetIdx(i); }}>
                                <span>{p.label}</span><span className="rd" />
                            </button>
                        ))}
                    </div>
                    <button type="button" className="dd" aria-expanded={daysOpen} onClick={() => setDaysOpen(!daysOpen)}>
                        Gün gün düzenle<Ic n="chd" />
                    </button>
                    {daysOpen && (
                        <div className="days">
                            {DAY_ORDER.map((day) => {
                                const h = hours.find((x) => x.day === day)
                                    ?? { day, dayName: DAY_NAMES[day], start: '09:00', end: '19:00', isOff: true };
                                // Bir gün elle değişince hazır düzenin işareti kalkar.
                                const patch = (p: Partial<WorkingHours>) => {
                                    setPresetIdx(null);
                                    setHours((prev) => (prev.some((x) => x.day === day)
                                        ? prev.map((x) => (x.day === day ? { ...x, ...p } : x))
                                        : [...prev, { ...h, ...p }]));
                                };
                                return (
                                    <div key={day} className={h.isOff ? 'day closed' : 'day'}>
                                        <b>{DAY_NAMES[day]}</b>
                                        <button type="button" className="sw" role="switch" aria-checked={!h.isOff}
                                            aria-label={`${DAY_NAMES[day]} açık`} onClick={() => patch({ isOff: !h.isOff })} />
                                        {h.isOff ? <span className="cl">Kapalı</span> : (
                                            <div className="tm">
                                                <input type="time" value={h.start} aria-label={`${DAY_NAMES[day]} açılış`} onChange={(e) => patch({ start: e.target.value })} />
                                                <i>–</i>
                                                <input type="time" value={h.end} aria-label={`${DAY_NAMES[day]} kapanış`} onChange={(e) => patch({ end: e.target.value })} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>, activeRows.length > 0 ? foot({
            back: 'isletme', msg: `${activeRows.length} ${serviceWord} seçili`,
            onPri: () => void run(saveHizmetler, 'whatsapp'),
        }) : foot({
            back: 'isletme', msg: `En az bir ${serviceWord} gerekli`, msgIcon: 'info', pri: false,
            sec: (
                <button type="button" className="btn2" onClick={() => setRows(fromSeed ? seedRows(sector) : svcRows.map((r) => ({ ...r, on: true })))}>
                    <Ic n="refresh" />{fromSeed ? 'Hazır listeyi geri getir' : 'Listeyi geri getir'}
                </button>
            ),
        }));
    }

    // ══════════════════════════════════════════════════════════ K3 ════
    if (screen === 'whatsapp') {
        const steps = (
            <div className="stp">
                <div><i>1</i><span>Telefonunuzda WhatsApp'ı açın</span></div>
                <div><i>2</i><span>Ayarlar → Bağlı cihazlar → Cihaz bağla</span></div>
                <div><i>3</i><span>Telefonunuzu bu kareye tutun</span></div>
            </div>
        );
        const left = waConnected ? (
            <div className="okw">
                <div className="bnd g"><Ic n="check" /><span>Bağlandı. Hatırlatmalar bu numaradan gidecek.</span></div>
                <div className="sum"><div className="sr"><span>Bağlantı</span><b>Bağlı</b><Ic n="check" className="ok" /></div></div>
                <p className="note">Bağlantıyı sonra Ayarlar › WhatsApp'tan yönetirsiniz.</p>
            </div>
        ) : qr.st === 'fail' ? (
            <div className="qrw">
                <div className="qrc"><div className="qrb er"><div className="ov" role="alert">
                    <Ic n="alert" /><span>Kare şu an getirilemedi. Biraz sonra tekrar deneyin ya da sonra bağlayın.</span>
                    <button type="button" className="btn2 sm" onClick={() => void startQr()}><Ic n="refresh" />Tekrar dene</button>
                </div></div></div>
                {steps}
            </div>
        ) : qr.st === 'dead' ? (
            <div className="qrw">
                <div className="qrc">
                    <div className="qrb dead">
                        <img src={qr.src} alt="" />
                        <div className="ov">
                            <span>Karenin süresi doldu.</span>
                            <button type="button" className="btn sm" onClick={() => void startQr()}><Ic n="refresh" />Kareyi yenile</button>
                        </div>
                    </div>
                    <div className="qrt"><Ic n="clock" /><span>Yenileyince 60 saniye yeniden başlar.</span></div>
                </div>
                {steps}
            </div>
        ) : qr.st === 'live' ? (
            <div className="qrw">
                <div className="qrc">
                    <div className="qrb"><img src={qr.src} alt="WhatsApp bağlama karesi" /></div>
                    <div className="qrt"><Ic n="clock" /><span>Kalan süre <b>{Math.floor(qr.left / 60)}:{String(qr.left % 60).padStart(2, '0')}</b></span></div>
                </div>
                {steps}
            </div>
        ) : (
            <div className="qrw">
                <div className="qrc">
                    <div className="qrb ld"><div className="ov" role="status">
                        <span>Kare hazırlanıyor</span><span className="wait" aria-hidden="true"><i /><i /><i /></span>
                    </div></div>
                </div>
                {steps}
            </div>
        );
        return shell(<>
            <div className="wh">
                <h1>WhatsApp numaranızı bağlayın.</h1>
                <p>Bağlanınca randevu hatırlatmaları müşterinize kendi numaranızdan gider. Hatırlatma, gelmeyen müşteriyi azaltan en etkili ayar.</p>
            </div>
            <div className="cols3">
                <div>{left}</div>
                <div>
                    <div className="ai">
                        <div className="hd">
                            <Ic n="bot" /><b>AI randevu asistanı</b><em>{assistant ? 'Açık' : 'Kapalı'}</em>
                            {/* Hat bağlı değilken açmak sessiz bir yalan olurdu: anahtar
                                açık görünür, hiçbir mesaj cevaplanmaz. */}
                            <button type="button" className="sw" role="switch" aria-checked={assistant} aria-label="AI randevu asistanı"
                                disabled={connection.status !== 'connected'} onClick={() => setAssistant(!assistant)} />
                        </div>
                        <p>Açarsanız müşterileriniz WhatsApp'tan yazdığında asistan randevu oluşturur, fiyat ve saat sorularını yanıtlar. Kapalıyken yalnız hatırlatmalar gider, hiçbir mesaja otomatik cevap verilmez.</p>
                        {!waConnected && <div className="why"><Ic n="info" />WhatsApp bağlanınca açabilirsiniz.</div>}
                        <div className="chat">
                            <span>Yarın öğleden sonra müsait misiniz?</span>
                            <span className="o">Yarın 14:30 ve 16:00 boş. Hangisini ayırayım?</span>
                        </div>
                    </div>
                </div>
            </div>
        </>, waConnected ? foot({ back: 'hizmetler', pri: 'Bağlandı, bitir', onPri: () => void finishWa() }) : foot({
            back: 'hizmetler', msg: 'Telefonunuz yanınızda değilse sonra bağlayabilirsiniz.', pri: 'Bitir', off: true,
            sec: <button type="button" className="btn2" onClick={() => setScreen('bitti')}>Sonra bağlarım</button>,
        }));
    }

    // ══════════════════════════════════════════════════════════ BİTTİ ════
    const bizName = name.trim() || ownBusinessName(settings.businessName, user?.name) || 'İşletmeniz';
    const openDays = (savedServices.length ? settings.workingHours : hours).filter((h) => !h.isOff).length;
    const bookUrl = org.slug ? `${window.location.origin}/book/${org.slug}` : '';
    const solo = team ? team === 'solo' : Boolean(soloFlag);
    // Panelden kaydolan, aboneliği olmadan buraya gelir; kapı onu ödeme
    // duvarına atacak (docs/abonelik-kurallari.md §3). Siteden gelenin
    // denemesi zaten başlamış: uygulamaya.
    const locked = ent.locked;
    const nc = (icon: string, where: string, title: string, desc: string, to: string) => (
        <button type="button" className="nc" onClick={() => navigate(to)}>
            <span className="ib"><Ic n={icon} /></span>
            <span className="tx"><em>{where}</em><b>{title}</b><span>{desc}</span></span>
            <Ic n="chr" />
        </button>
    );
    return shell(<>
        <div className="wh">
            <h1>Tamamdır.</h1>
            <p>{bizName} randevu almaya hazır.</p>
        </div>
        {bookUrl && (
            <div className="addr">
                <div className="t">
                    <span className="gk">RANDEVU ADRESİNİZ</span>
                    <span className="u">{host}/book/{org.slug}</span>
                    <p>{locked
                        ? 'Deneme başlayınca müşterileriniz bu adresten randevu alır.'
                        : 'Instagram profilinize koyun, müşteriniz randevusunu kendi alsın.'}</p>
                </div>
                <div className="acts">
                    <button type="button" className="btn2 sm" onClick={() => {
                        void navigator.clipboard?.writeText(bookUrl).then(() => {
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 2000);
                        });
                    }}>
                        <Ic n="copy" /><span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
                    </button>
                    <a className="btn2 sm" href={bookUrl} target="_blank" rel="noreferrer"><Ic n="ext" />Sayfayı aç</a>
                </div>
            </div>
        )}
        <div className="bcols">
            <div>
                <span className="gk">ÖZET</span>
                <div className="sum">
                    {/* Ekran atlanmışsa (eski bağlantıyla doğrudan WhatsApp'a gelinmiş)
                        eksik, yeşil tikle "tamam" gibi çizilmez. */}
                    {savedSector ? (
                        <div className="sr"><span>Sektör</span><b>{sp.label}</b><Ic n="check" className="ok" /></div>
                    ) : (
                        <div className="sr skp">
                            <span>Sektör</span><b>Ne iş yaptığınız seçilmedi</b>
                            <button type="button" className="lnk" onClick={() => setScreen('isletme')}>Şimdi seç</button>
                        </div>
                    )}
                    {savedServices.length ? (
                        <div className="sr">
                            <span>{servicesTitle}</span>
                            <b>{savedServices.length} {serviceWord} · haftada {openDays} gün açık</b>
                            <Ic n="check" className="ok" />
                        </div>
                    ) : (
                        <div className="sr skp">
                            <span>{servicesTitle}</span><b>Henüz {serviceWord} yok — randevu alınamıyor</b>
                            <button type="button" className="lnk" onClick={() => setScreen('hizmetler')}>Şimdi ekle</button>
                        </div>
                    )}
                    <div className="sr">
                        <span>Ekip</span><b>{solo ? 'Yalnız siz' : `${activeStaff.length} kişi`}</b><Ic n="check" className="ok" />
                    </div>
                    {waConnected ? (
                        <div className="sr"><span>WhatsApp</span><b>Bağlı · asistan {connection.features.assistant ? 'açık' : 'kapalı'}</b><Ic n="check" className="ok" /></div>
                    ) : (
                        <div className="sr skp">
                            <span>WhatsApp</span><b>WhatsApp bağlanmadı — hatırlatmalar gitmiyor</b>
                            <button type="button" className="lnk" onClick={() => setScreen('whatsapp')}>Şimdi bağla</button>
                        </div>
                    )}
                </div>
            </div>
            <div>
                <span className="gk">SIRADAKİ İŞLER</span>
                <div className="nx">
                    {nc('cal', 'Takvim', 'İlk randevunuzu oluşturun', 'Bir saate dokunun, yeterli.', '/calendar')}
                    {nc('sheet', 'Ayarlar › Verileriniz', 'Müşteri listenizi aktarın', 'Excel ya da CSV yükleyin.', '/settings/verileriniz')}
                    {!org.address.trim() && !org.publicPhone.trim() && nc('pin', 'Ayarlar › İşletme profili', 'Adres ve telefonunuzu ekleyin',
                        "Hatırlatmalarda görünür; WhatsApp asistanı 'neredesiniz' sorusunu bununla yanıtlar.", '/settings/isletme')}
                </div>
            </div>
        </div>
    </>, locked ? foot({
        msg: `Son adım: ${TRIAL_DAYS} gün ücretsiz deneme. Deneme içinde iptal ederseniz ücret alınmaz.`,
        pri: `${TRIAL_DAYS} gün ücretsiz başlat`, onPri: () => navigate('/abonelik'),
    }) : foot({ msg: "Her şey Ayarlar'dan değişir.", pri: 'Uygulamaya git', onPri: () => navigate('/') }));
}
