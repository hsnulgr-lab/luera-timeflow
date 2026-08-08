import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowRight, Bot, Calendar as CalIcon, Check, Clock, DoorOpen, Info,
    Link2, Loader2, Minus, Plus, RefreshCw, Store, Table2, Tag, Trash2, Undo2,
    Upload, User, Users, X,
} from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useStaff } from '@/hooks/useStaff';
import { useModules } from '@/hooks/useModules';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { waConnect, waSetFeatures, waState } from '@/services/whatsapp';
import { SECTOR_PROFILES, profileForSector } from '@/lib/sectorProfiles';
import { MODULE_META, modulesForSector } from '@/lib/modules';
import { serviceSeedFor } from '@/lib/serviceSeeds';
import { staffRoleOptionsForSector } from '@/lib/staffPermissions';
import { SETUP_STEPS, type StepKey } from '@/lib/setupProgress';
import { SECTOR_ICON } from '@/lib/sectorIcons';
import type { Service, StaffRole, WorkingHours } from '@/types';
import './setupWizard.css';

// ============================================================================
// Kurulum sihirbazı — /kurulum
// ----------------------------------------------------------------------------
// Bunu yazdıran olay: yeni bir org açıldığında kullanıcı BOMBOŞ bir uygulamaya
// düşüyordu. Hizmet yok, çalışma saati yok, personel yok, WhatsApp bağlı değil
// ve hiçbir şey onu kuruluma yönlendirmiyordu. İlk izlenim "bu program
// çalışmıyor" oluyordu.
//
// Tasarım Claude Design'daki "Luera Kurulum Sihirbazı" dosyası; ölçüler ve
// metinler oradan birebir. Üç tasarım kararı bilinçlidir ve değiştirilmemeli:
//
//   1. HİZMET LİSTESİ DOLU AÇILIR. Kullanıcının işi eklemek değil çıkarmak.
//      Boş tabloya "hizmet ekle" demek kurulumun en büyük terk noktası.
//   2. "YALNIZ BEN ÇALIŞIYORUM" eşit ağırlıkta bir karttır, küçük bir link
//      değil — Türkiye'deki hedef kitlenin büyük kısmı tek kişilik.
//   3. SEKTÖR SÖZCÜKLERİ GÖMÜLÜ DEĞİL. "Ünite/Koltuk/Masa" ve rol adları
//      registry'den (sectorProfiles, staffPermissions) gelir.
//
// Adımlar TEK TEK kaydeder. Sihirbazın sonunda topluca kaydetmek, yarıda
// bırakan kullanıcının hiçbir şeyini saklamamak demekti.
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

type SeedRow = { id: string; name: string; duration: number; price?: number; color: string; on: boolean };

export function SetupWizardPage() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { settings, updateSettings } = useReservations();
    const { resources, addResource } = useResources();
    const { staff, addStaff } = useStaff();
    const { applySectorDefaults } = useModules();
    const { profile: org, savePartial, uploadImage } = useOrgProfile();
    const { connection, refresh: refreshWa } = useWhatsApp();

    // Nerede duracağımız İNDİS değil ANAHTAR olarak tutulur. İndis tutulsaydı
    // sektör verisi geldiğinde "Kaynak" adımı listeye girip çıktığı için
    // kullanıcı bir anda başka bir adımda buluyordu kendini.
    //
    // Başlangıç adımı şeritten gelir (/kurulum?adim=identity). Şerit "1 adım
    // kaldı" deyip sihirbazı en baştan açmak, bitmiş yedi adımı yeniden
    // gezdirmek demekti — kullanıcının bildirdiği hata buydu.
    const [searchParams] = useSearchParams();
    const [stepKey, setStepKey] = useState<StepKey>(() => {
        const q = searchParams.get('adim');
        return SETUP_STEPS.some((s) => s.key === q) ? q as StepKey : 'welcome';
    });
    const [saving, setSaving] = useState(false);
    const [finished, setFinished] = useState(false);

    // ── adım verileri ──
    const [sector, setSector] = useState(settings.sector || '');
    const [businessName, setBusinessName] = useState(settings.businessName || '');
    const [address, setAddress] = useState(org.address || '');
    const [phone, setPhone] = useState(org.publicPhone || '');
    const [mapsUrl, setMapsUrl] = useState(org.mapsUrl || '');
    const [logoUrl, setLogoUrl] = useState(org.logoUrl || '');
    const [hours, setHours] = useState<WorkingHours[]>(
        settings.workingHours?.length ? settings.workingHours : HOUR_PRESETS[0].build(),
    );
    const [presetIdx, setPresetIdx] = useState<number | null>(settings.workingHours?.length ? null : 0);
    const [slotDuration, setSlotDuration] = useState(settings.slotDuration || 30);
    const [rows, setRows] = useState<SeedRow[] | null>(null);
    const [resourceCount, setResourceCount] = useState(Math.max(1, resources.length || 1));
    const [solo, setSolo] = useState<boolean | null>(null);
    const [team, setTeam] = useState<{ id: string; name: string; role: StaffRole }[]>([]);
    const [qr, setQr] = useState<string | null>(null);
    const [qrDead, setQrDead] = useState(false);
    const [waBusy, setWaBusy] = useState(false);
    const [assistant, setAssistant] = useState(connection.features.assistant);
    const [skipped, setSkipped] = useState<Set<StepKey>>(new Set());

    const logoInput = useRef<HTMLInputElement>(null);
    const qrTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrPoll = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── sektöre bağlı türetmeler ──
    const sp = profileForSector(sector || 'genel');
    const resourceTypes = sp.resourceTypes;
    const resourceWord = resourceTypes[0] || 'Kaynak';
    const roleOptions = staffRoleOptionsForSector(sector || 'genel');
    const unlocked = sector ? MODULE_META.filter((m) => modulesForSector(sector)[m.key]) : [];

    // Kaynak kavramı olmayan sektörde (danışmanlık, restoran) o adım hiç
    // gösterilmez. "Kaç danışma odanız var" sorusu kullanıcıyı şaşırtıyordu.
    const steps = SETUP_STEPS.filter((s) => s.key !== 'resources' || resourceTypes.length > 0);
    const stepIdx = Math.max(0, steps.findIndex((s) => s.key === stepKey));
    const step = steps[stepIdx];
    const goStep = (i: number) => setStepKey(steps[Math.min(Math.max(i, 0), steps.length - 1)].key);
    const serviceWord = sp.labels?.service || 'Hizmet';

    /** Hizmet satırları sektör seçilene kadar hazırlanamaz — ilk girişte kurulur. */
    function seedRows(forSector: string): SeedRow[] {
        // Kullanıcının zaten hizmeti varsa DOKUNULMAZ: sihirbazı sonradan açan
        // bir işletmenin listesini hazır setle ezmek veri kaybıdır.
        if (settings.services?.length) {
            return settings.services.map((s) => ({
                id: s.id, name: s.name, duration: s.duration, price: s.price,
                color: s.color, on: true,
            }));
        }
        const seed = serviceSeedFor(forSector);
        return (seed?.services ?? []).map((s, i) => ({
            id: uid(), name: s.name, duration: s.duration,
            color: s.color || SERVICE_COLORS[i % SERVICE_COLORS.length], on: true,
        }));
    }
    const svcRows = rows ?? [];
    const activeRows = svcRows.filter((r) => r.on);

    // ── kayıt ──
    async function persistSettings(patch: Partial<typeof settings>) {
        setSaving(true);
        const ok = await updateSettings({ ...settings, ...patch });
        setSaving(false);
        if (!ok) toast.error('Kaydedilemedi, tekrar deneyin');
        return ok;
    }

    async function commitStep(key: StepKey): Promise<boolean> {
        switch (key) {
            case 'sector': {
                if (!sector) { toast.error('Bir sektör seçin'); return false; }
                if (!(await persistSettings({ sector }))) return false;
                // Sektör seçmek modülleri de belirler. Bu, eski kurulumun eksik
                // halkasıydı: avukatlık bürosu bile kasa modülü açık başlıyordu.
                await applySectorDefaults(sector);
                setRows((prev) => prev ?? seedRows(sector));
                return true;
            }
            case 'identity': {
                if (!businessName.trim()) { toast.error('İşletme adı gerekli'); return false; }
                if (!(await persistSettings({ businessName: businessName.trim() }))) return false;
                return savePartial({
                    address: address.trim(), publicPhone: phone.trim(),
                    mapsUrl: mapsUrl.trim(), ...(logoUrl ? { logoUrl } : {}),
                });
            }
            case 'hours':
                return persistSettings({ workingHours: hours, slotDuration });
            case 'services': {
                if (activeRows.length === 0) { toast.error(`En az bir ${serviceWord.toLocaleLowerCase('tr')} gerekli`); return false; }
                const services: Service[] = activeRows.map((r) => ({
                    id: r.id, name: r.name.trim() || serviceWord,
                    duration: r.duration || slotDuration,
                    ...(r.price !== undefined ? { price: r.price } : {}),
                    color: r.color,
                }));
                return persistSettings({ services });
            }
            case 'resources': {
                setSaving(true);
                const have = resources.filter((r) => r.type === resourceWord).length;
                for (let i = have; i < resourceCount; i++) {
                    await addResource({ type: resourceWord, name: `${resourceWord} ${i + 1}`, capacity: 1 });
                }
                setSaving(false);
                return true;
            }
            case 'team': {
                if (solo === null) { toast.error('Bir seçim yapın'); return false; }
                if (solo) return true;
                const named = team.filter((t) => t.name.trim());
                if (named.length === 0) { toast.error('En az bir kişi ekleyin ya da "yalnız ben" seçin'); return false; }
                setSaving(true);
                for (const t of named) {
                    if (staff.some((s) => s.name.trim() === t.name.trim())) continue;
                    await addStaff({
                        name: t.name.trim(), role: t.role, color: SERVICE_COLORS[team.indexOf(t) % SERVICE_COLORS.length],
                        isActive: true,
                    });
                }
                setSaving(false);
                return true;
            }
            case 'whatsapp':
                if (connection.status === 'connected' && assistant !== connection.features.assistant) {
                    await waSetFeatures({ assistant });
                    await refreshWa();
                }
                return true;
            default:
                return true;
        }
    }

    async function goNext(skip = false) {
        if (skip) {
            setSkipped((s) => new Set(s).add(step.key));
        } else if (!(await commitStep(step.key))) {
            return;
        } else {
            setSkipped((s) => { const n = new Set(s); n.delete(step.key); return n; });
        }
        stopQr();
        if (stepIdx < steps.length - 1) goStep(stepIdx + 1);
        else setFinished(true);
    }

    // ── WhatsApp QR ──
    function stopQr() {
        if (qrTimer.current) clearInterval(qrTimer.current);
        if (qrPoll.current) clearInterval(qrPoll.current);
        qrTimer.current = null; qrPoll.current = null;
    }
    async function startQr() {
        setWaBusy(true); setQrDead(false); setQr(null);
        const res = await waConnect();
        setWaBusy(false);
        if (res?.connected) { await refreshWa(); toast.success('WhatsApp bağlandı'); return; }
        if (!res?.qr) { toast.error('QR kod alınamadı, tekrar deneyin'); return; }
        setQr(res.qr);
        // Kare 60 saniye geçerli. Süre dolunca kendiliğinden yenilenmez —
        // silikleşip yenileme düğmesi çıkar: arka planda sessizce yenilenen bir
        // kare, telefonunu tam o anda kaldıran kullanıcıyı ıskalatıyordu.
        let left = 60;
        qrTimer.current = setInterval(() => {
            left -= 1;
            if (left <= 0) { stopQr(); setQrDead(true); }
        }, 1000);
        qrPoll.current = setInterval(async () => {
            const st = await waState();
            if (st?.connected) { stopQr(); setQr(null); await refreshWa(); toast.success('WhatsApp bağlandı'); }
        }, 3000);
    }

    // Bu üçü bileşen DEĞİL, işaretleme döndüren yardımcı: render sırasında
    // bileşen tanımlamak React'in kimliklerini her turda değiştirir ve
    // ilerleme çubuğu ile alt bar gereksiz yere yeniden monte olur.
    const progressBar = (
        <div className="sw-prog">
            {steps.map((s, i) => (
                <s key={s.key} className={i < stepIdx || finished ? 'done' : i === stepIdx ? 'now' : ''} />
            ))}
        </div>
    );
    const foot = (why: React.ReactNode, actions: React.ReactNode) => (
        <div className="sw-foot">
            {stepIdx > 0 && !finished && (
                <button className="sw-btn bare" onClick={() => { stopQr(); goStep(stepIdx - 1); }}>
                    <ArrowLeft size={18} />Geri
                </button>
            )}
            <span className="sw-why">{why}</span>
            {actions}
        </div>
    );
    const nextBtn = (label = 'Devam') => (
        <button className="sw-btn pri" disabled={saving} onClick={() => goNext(false)}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : null}
            {label}<ArrowRight size={20} />
        </button>
    );

    // ══════════════════════════════════════════════════════════════ BİTİŞ ════
    if (finished) {
        const summary = [
            { k: 'Sektör', v: sp.label, skip: false },
            { k: 'Çalışma saatleri', v: `${hours.filter((h) => !h.isOff).length} gün açık`, skip: false },
            // rows null olabilir: bitiş özetinden bir adıma geri dönüp tekrar
            // bitirildiğinde hizmet adımı hiç açılmamış olur. O zaman kayıtlı
            // liste okunur — "0 tanımlı" yazmak yanlış olurdu.
            { k: serviceWord, v: `${rows ? activeRows.length : settings.services?.length ?? 0} tanımlı`, skip: false },
            ...(resourceTypes.length
                ? [{ k: resourceWord, v: skipped.has('resources') ? 'Atlandı' : `${resourceCount} adet`, skip: skipped.has('resources'), go: 'resources' as StepKey }]
                : []),
            { k: 'Ekip', v: skipped.has('team') ? 'Atlandı' : solo ? 'Yalnız siz' : `${team.filter((t) => t.name.trim()).length} kişi`, skip: skipped.has('team'), go: 'team' as StepKey },
            {
                k: 'WhatsApp',
                v: connection.status === 'connected' ? `Bağlı · asistan ${assistant ? 'açık' : 'kapalı'}` : 'Bağlanmadı',
                skip: connection.status !== 'connected', go: 'whatsapp' as StepKey,
            },
        ];
        const anySkipped = summary.some((s) => s.skip);
        return (
            <div className={cn('sw-page dash-theme', dark && 'dark')}>
                <div className="sw-shell">
                    <div className="sw-head">
                        <div className="sw-head-row">
                            <span className="sw-brand">luera<i /></span>
                            <span className="sw-stepno">Tamamlandı</span>
                        </div>
                        {progressBar}
                    </div>
                    <div className="sw-body">
                        <div className="sw-hero">
                            <div className="sw-tickbig"><Check size={26} /></div>
                            <div className="sw-q">
                                <h1>Tamamdır, bu kadar.</h1>
                                <p>
                                    {anySkipped
                                        ? 'Bazı adımları sonraya bıraktınız. Uygulamayı kullanmaya engel değil, istediğinizde buradan tamamlarsınız.'
                                        : `${businessName || 'İşletmeniz'} randevu almaya hazır. İsterseniz aşağıdakilerden biriyle başlayın.`}
                                </p>
                            </div>
                        </div>
                        <div className="sw-sum">
                            {summary.map((s) => (
                                <div key={s.k} className={`sw-sitem${s.skip ? ' skip' : ''}`}>
                                    <div><div className="k">{s.k}</div><div className="v">{s.v}</div></div>
                                    {s.skip && s.go
                                        ? <button className="fix" onClick={() => {
                                            const i = steps.findIndex((x) => x.key === s.go);
                                            if (i >= 0) { setFinished(false); goStep(i); }
                                        }}>Şimdi ekle</button>
                                        : <Check size={18} className="ok" />}
                                </div>
                            ))}
                        </div>
                        {connection.status !== 'connected' && (
                            <div className="sw-call plain">
                                <Info size={18} />
                                <span>
                                    WhatsApp bağlanmadığı sürece randevu hatırlatmaları gönderilmez.
                                    Hatırlatmalar müşteri gelmeme oranını düşüren tek ayardır.
                                </span>
                            </div>
                        )}
                        <div className="sw-next">
                            <button className="sw-ncard" onClick={() => navigate('/calendar')}>
                                <CalIcon size={26} /><span className="nm">İlk randevunu oluştur</span>
                                <span className="d">Takvimde bir saate dokunun, yeterli.</span>
                            </button>
                            <button className="sw-ncard" onClick={() => navigate('/settings?tab=veri')}>
                                <Table2 size={26} /><span className="nm">Müşterilerini Excel'den aktar</span>
                                <span className="d">Elinizdeki listeyi yükleyin, biz ayıklayalım.</span>
                            </button>
                            <button className="sw-ncard" onClick={() => navigate('/settings?tab=booking')}>
                                <Link2 size={26} /><span className="nm">Online randevu linkini paylaş</span>
                                <span className="d">Instagram profilinize koyun, randevu kendi gelsin.</span>
                            </button>
                        </div>
                    </div>
                    <div className="sw-foot">
                        <span className="sw-why">Her şey Ayarlar'dan değiştirilebilir.</span>
                        <button className="sw-btn ink" onClick={() => navigate('/')}>Uygulamaya git<ArrowRight size={20} /></button>
                    </div>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════ ADIMLAR ════
    return (
        <div className={cn('sw-page dash-theme', dark && 'dark')}>
            <div className="sw-shell">
                <div className="sw-head">
                    <div className="sw-head-row">
                        <span className="sw-brand">luera<i /></span>
                        <span className="sw-stepno">Adım {stepIdx + 1} / {steps.length}</span>
                        {stepIdx > 0 && (
                            <button className="sw-exit" aria-label="Kapat" onClick={() => navigate('/')}><X size={20} /></button>
                        )}
                    </div>
                    {progressBar}
                    {stepIdx > 0 && (
                        <div className="sw-plabels">
                            {steps.slice(1).map((s) => <span key={s.key}>{s.label}</span>)}
                        </div>
                    )}
                </div>

                {/* ── 1 · Hoş geldiniz ── */}
                {step.key === 'welcome' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>Hoş geldiniz. Şimdi programı size göre ayarlayacağız.</h1>
                            <p>Üç şeyi soracağız, gerisini biz hallediyoruz. Yarıda bırakırsanız kaldığınız yerden devam edersiniz.</p>
                        </div>
                        <div className="sw-wlist">
                            <div className="sw-wi">
                                <div className="ic"><Store size={20} /></div>
                                <div><div className="t">İşletmenizi tanıtın</div>
                                    <div className="d">Ne iş yaptığınız, adınız, adresiniz ve telefonunuz.</div></div>
                            </div>
                            <div className="sw-wi">
                                <div className="ic"><Clock size={20} /></div>
                                <div><div className="t">Saatlerinizi ve {serviceWord.toLocaleLowerCase('tr')} listenizi girin</div>
                                    <div className="d">Hazır liste geliyor; siz sadece düzeltirsiniz.</div></div>
                            </div>
                            <div className="sw-wi">
                                <div className="ic"><Bot size={20} /></div>
                                <div><div className="t">İsterseniz WhatsApp'ı bağlayın</div>
                                    <div className="d">Bu adımı sonraya bırakabilirsiniz.</div></div>
                            </div>
                        </div>
                        <span className="sw-time"><Clock size={16} />Yaklaşık 6 dakika sürer</span>
                    </div>
                    {foot("Girdiğiniz her şey sonradan Ayarlar'dan değişir.",
                        <button className="sw-btn pri big" onClick={() => goStep(1)}>Başlayalım<ArrowRight size={20} /></button>)}
                </>)}

                {/* ── 2 · Sektör ── */}
                {step.key === 'sector' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>Hangi işi yapıyorsunuz?</h1>
                            <p>Bu seçim programın dilini ve ekranlarını belirler. Yanlış seçerseniz sonradan değiştirebilirsiniz.</p>
                        </div>
                        <div className="sw-grid">
                            {Object.entries(SECTOR_PROFILES).filter(([k]) => k !== 'genel').map(([key, p]) => {
                                const Icon = SECTOR_ICON[key] ?? Store;
                                const on = sector === key;
                                return (
                                    <button key={key} className="sw-pick" aria-pressed={on}
                                        onClick={() => { setSector(key); setRows(null); }}>
                                        {on && <span className="sw-tick"><Check size={13} strokeWidth={3} /></span>}
                                        <Icon size={26} /><span className="nm">{p.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {unlocked.length > 0 && (
                            <div className="sw-unlock">
                                <span className="lbl">Bu seçim şunları açar</span>
                                <ul>{unlocked.map((m) => (
                                    <li key={m.key}><Check size={16} />{m.label}</li>
                                ))}</ul>
                            </div>
                        )}
                        {settings.sector && sector !== settings.sector && (
                            <div className="sw-call amber">
                                <Info size={18} />
                                <span>
                                    Sektörü sonradan değiştirebilirsiniz. Ancak müşteri ve randevu girmeye
                                    başladıktan sonra değiştirmek bazı kayıtları yerinden oynatır — şimdi
                                    doğru seçmek en kolayı.
                                </span>
                            </div>
                        )}
                    </div>
                    {foot(null, nextBtn())}
                </>)}

                {/* ── 3 · İşletme kimliği ── */}
                {step.key === 'identity' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>{sp.label} bilgileriniz</h1>
                            <p>Bu bilgiler randevu hatırlatmalarında ve WhatsApp yanıtlarında müşterinize gider.</p>
                        </div>
                        <div className="sw-fields">
                            <div className="sw-fl full">
                                <label>İşletme adı</label>
                                <input className={`sw-inp${businessName ? ' filled' : ''}`} value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)} placeholder="Ör. Özmen Güzellik Merkezi" />
                            </div>
                            <div className="sw-fl full">
                                <label>Adres</label>
                                <input className={`sw-inp${address ? ' filled' : ''}`} value={address}
                                    onChange={(e) => setAddress(e.target.value)} placeholder="Cadde, no, ilçe / il" />
                                <span className="sw-hint">Müşteriniz WhatsApp'tan "neredesiniz" diye yazdığında bot bu adresi gönderir.</span>
                            </div>
                            <div className="sw-fl">
                                <label>Telefon</label>
                                <input className={`sw-inp${phone ? ' filled' : ''}`} value={phone}
                                    onChange={(e) => setPhone(e.target.value)} placeholder="0216 000 00 00" />
                                <span className="sw-hint">Hatırlatma mesajlarının altında görünür.</span>
                            </div>
                            <div className="sw-fl">
                                <label>Google Maps linki <em>opsiyonel</em></label>
                                <input className={`sw-inp${mapsUrl ? ' filled' : ''}`} value={mapsUrl}
                                    onChange={(e) => setMapsUrl(e.target.value)} placeholder="maps.app.goo.gl/..." />
                                <span className="sw-hint">Yol tarifi isteyene tek dokunuşluk link gider.</span>
                            </div>
                            <div className="sw-fl full">
                                <label>Logo <em>opsiyonel</em></label>
                                <input ref={logoInput} type="file" accept="image/png,image/jpeg" hidden
                                    onChange={async (e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        const url = await uploadImage(f, 'logo');
                                        if (url) setLogoUrl(url);
                                    }} />
                                {logoUrl ? (
                                    <div className="sw-person">
                                        <img src={logoUrl} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover' }} />
                                        <span className="pr">Logo yüklendi</span>
                                        <button className="sw-icobtn" style={{ marginLeft: 'auto' }} aria-label="Kaldır"
                                            onClick={() => setLogoUrl('')}><Trash2 size={18} /></button>
                                    </div>
                                ) : (
                                    <button className="sw-addrow" style={{ minHeight: 92, flexDirection: 'column', gap: 6 }}
                                        onClick={() => logoInput.current?.click()}>
                                        <Upload size={20} />Logonuzu seçin
                                        <span style={{ fontWeight: 500, color: 'var(--dc-muted2)', fontSize: 12 }}>PNG veya JPG, en az 200×200</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    {foot('Logoyu şimdi atlayabilirsiniz.', nextBtn())}
                </>)}

                {/* ── 4 · Çalışma saatleri ── */}
                {step.key === 'hours' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>Ne zaman açıksınız?</h1>
                            <p>Müşteriniz sadece bu saatlerde randevu alabilir. Tatil günlerini sonra takvimden kapatabilirsiniz.</p>
                        </div>
                        <div className="sw-fl">
                            <label>Hazır düzenler</label>
                            <div className="sw-chips">
                                {HOUR_PRESETS.map((p, i) => (
                                    <button key={p.label} className="sw-chip" aria-pressed={presetIdx === i}
                                        onClick={() => { setHours(p.build()); setPresetIdx(i); }}>
                                        {presetIdx === i && <Check size={16} />}{p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="sw-hours">
                            {DAY_ORDER.map((day) => {
                                const h = hours.find((x) => x.day === day)
                                    ?? { day, dayName: DAY_NAMES[day], start: '09:00', end: '19:00', isOff: true };
                                const patch = (p: Partial<WorkingHours>) => {
                                    setPresetIdx(null);
                                    setHours((prev) => {
                                        const has = prev.some((x) => x.day === day);
                                        return has ? prev.map((x) => x.day === day ? { ...x, ...p } : x) : [...prev, { ...h, ...p }];
                                    });
                                };
                                return (
                                    <div key={day} className={`sw-day${h.isOff ? ' off' : ''}`}>
                                        <span className="dn">{DAY_NAMES[day]}</span>
                                        {h.isOff ? <span className="closed">Kapalı</span> : (
                                            <span className="times">
                                                <input className="t" type="time" value={h.start} onChange={(e) => patch({ start: e.target.value })} />
                                                –
                                                <input className="t" type="time" value={h.end} onChange={(e) => patch({ end: e.target.value })} />
                                            </span>
                                        )}
                                        <button className={`sw-sw${h.isOff ? '' : ' on'}`} aria-label={`${DAY_NAMES[day]} açık/kapalı`}
                                            onClick={() => patch({ isOff: !h.isOff })} />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="sw-fl">
                            <label>Randevu aralığı</label>
                            <span className="sw-hint">
                                Takviminizin kaçar dakikalık dilimlere bölüneceği.
                                {' '}{serviceWord} süreleri bu dilimin katları olur.
                            </span>
                            <div className="sw-chips" style={{ marginTop: 4 }}>
                                {[15, 20, 30, 45, 60].map((m) => (
                                    <button key={m} className="sw-chip" aria-pressed={slotDuration === m}
                                        onClick={() => setSlotDuration(m)}>{m} dk</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {foot(null, nextBtn())}
                </>)}

                {/* ── 5 · Hizmetler ── */}
                {step.key === 'services' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>Sizin için {svcRows.length} {serviceWord.toLocaleLowerCase('tr')} hazırladık.</h1>
                            <p>Yapmadıklarınızın işaretini kaldırın, eksik olanı ekleyin. Süre ve ücreti şimdi tahmini girip sonra düzeltebilirsiniz.</p>
                        </div>
                        {svcRows.length === 0 ? (
                            <div className="sw-empty">
                                <div className="ic"><Tag size={26} /></div>
                                <h3>Listede hiç {serviceWord.toLocaleLowerCase('tr')} kalmadı</h3>
                                <p>Randevu alabilmek için en az bir tane gerekiyor. Müşteriniz randevu alırken bu listeden seçim yapıyor.</p>
                                <div className="acts">
                                    <button className="sw-btn pri" onClick={() => setRows([{ id: uid(), name: '', duration: slotDuration, color: SERVICE_COLORS[0], on: true }])}>
                                        <Plus size={18} />Kendi {serviceWord.toLocaleLowerCase('tr')} ekle
                                    </button>
                                    <button className="sw-btn gho" onClick={() => setRows(seedRows(sector))}>
                                        <Undo2 size={18} />Hazır listeyi geri getir
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="sw-rows">
                                <div className="sw-rowh"><span /><span>Ad</span><span>Süre</span><span>Ücret</span><span>Renk</span><span /></div>
                                {svcRows.map((r, i) => {
                                    const set = (p: Partial<SeedRow>) => setRows(svcRows.map((x, k) => k === i ? { ...x, ...p } : x));
                                    return (
                                        <div key={r.id} className={`sw-srow${r.on ? '' : ' gone'}`}>
                                            <button className={`sw-cbx${r.on ? ' on' : ''}`} aria-label="Seç" onClick={() => set({ on: !r.on })}>
                                                <Check size={15} strokeWidth={3} />
                                            </button>
                                            <input className="nm" value={r.name} placeholder={serviceWord}
                                                onChange={(e) => set({ name: e.target.value })} />
                                            <input className="val dur" type="number" min={5} step={5} value={r.duration}
                                                onChange={(e) => set({ duration: Number(e.target.value) || slotDuration })} />
                                            <input className="val prc" type="number" min={0} placeholder="₺"
                                                value={r.price ?? ''}
                                                onChange={(e) => set({ price: e.target.value ? Number(e.target.value) : undefined })} />
                                            <input className="sw-dot" type="color" value={r.color}
                                                onChange={(e) => set({ color: e.target.value })} aria-label="Renk" />
                                            <button className="sw-icobtn rm" aria-label="Sil"
                                                onClick={() => setRows(svcRows.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
                                        </div>
                                    );
                                })}
                                <button className="sw-addrow" onClick={() => setRows([...svcRows, {
                                    id: uid(), name: '', duration: slotDuration,
                                    color: SERVICE_COLORS[svcRows.length % SERVICE_COLORS.length], on: true,
                                }])}>
                                    <Plus size={18} />Kendi {serviceWord.toLocaleLowerCase('tr')} ekle
                                </button>
                            </div>
                        )}
                        {svcRows.length > 0 && (
                            <div className="sw-call plain">
                                <Info size={18} />
                                <span>Renk, takvimde randevuyu uzaktan tanımanız için. Zorunlu değil.</span>
                            </div>
                        )}
                    </div>
                    {foot(
                        activeRows.length > 0
                            ? `${activeRows.length} ${serviceWord.toLocaleLowerCase('tr')} seçili.`
                            : `En az bir ${serviceWord.toLocaleLowerCase('tr')} gerekli.`,
                        <button className="sw-btn pri" disabled={saving || activeRows.length === 0} onClick={() => goNext(false)}>
                            Devam<ArrowRight size={20} />
                        </button>,
                    )}
                </>)}

                {/* ── 6 · Kaynaklar ── */}
                {step.key === 'resources' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>Kaç {resourceWord.toLocaleLowerCase('tr')} var?</h1>
                            <p>Aynı saatte kaç randevu alabileceğinizi bu belirler.</p>
                        </div>
                        <div className="sw-count">
                            <button className="sw-cbtn" aria-label="Azalt" onClick={() => setResourceCount(Math.max(1, resourceCount - 1))}><Minus size={20} /></button>
                            <span className="n">{resourceCount}</span>
                            <button className="sw-cbtn" aria-label="Artır" onClick={() => setResourceCount(Math.min(50, resourceCount + 1))}><Plus size={20} /></button>
                            <span className="cap">{resourceWord.toLocaleLowerCase('tr')}</span>
                        </div>
                        <div className="sw-call plain">
                            <DoorOpen size={18} />
                            <span>İsimlerini ("1. {resourceWord}", "Cam kenarı") sonra Ayarlar'dan verirsiniz. Şimdi gerekmiyor.</span>
                        </div>
                    </div>
                    {foot(null, <>
                        <button className="sw-btn gho" onClick={() => goNext(true)}>Bu adımı atla</button>
                        {nextBtn()}
                    </>)}
                </>)}

                {/* ── 7 · Ekip ── */}
                {step.key === 'team' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>Kimler çalışıyor?</h1>
                            <p>Randevular kişilere dağıtılır, herkes kendi takvimini görür.</p>
                        </div>
                        <div className="sw-duo">
                            <button className="sw-pick" aria-pressed={solo === true} onClick={() => { setSolo(true); setTeam([]); }}>
                                {solo === true && <span className="sw-tick"><Check size={13} strokeWidth={3} /></span>}
                                <User size={26} /><span className="nm">Yalnız ben çalışıyorum</span>
                                <span className="d">Bütün randevular size gelir. Sonradan ekip ekleyebilirsiniz.</span>
                            </button>
                            <button className="sw-pick" aria-pressed={solo === false}
                                onClick={() => {
                                    setSolo(false);
                                    if (team.length === 0) setTeam([{ id: uid(), name: '', role: 'doctor' }]);
                                }}>
                                {solo === false && <span className="sw-tick"><Check size={13} strokeWidth={3} /></span>}
                                <Users size={26} /><span className="nm">Ekibim var</span>
                                <span className="d">Kişileri ekleyin; rol seçimi sektörünüze göre adlandırılır.</span>
                            </button>
                        </div>
                        {solo === false && (
                            <div className="sw-rows">
                                {team.map((t, i) => {
                                    const set = (p: Partial<typeof t>) => setTeam(team.map((x, k) => k === i ? { ...x, ...p } : x));
                                    const initials = t.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr');
                                    return (
                                        <div key={t.id} className="sw-person">
                                            <span className="sw-av">{initials || '—'}</span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <input className="pn" value={t.name} placeholder="Ad soyad"
                                                    onChange={(e) => set({ name: e.target.value })} />
                                                <span className="pr">Davet gönderilmedi</span>
                                            </span>
                                            <select className="sw-sel" value={t.role} onChange={(e) => set({ role: e.target.value as StaffRole })}>
                                                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                            <button className="sw-icobtn" aria-label="Kaldır"
                                                onClick={() => setTeam(team.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
                                        </div>
                                    );
                                })}
                                <button className="sw-addrow" onClick={() => setTeam([...team, { id: uid(), name: '', role: 'doctor' }])}>
                                    <Plus size={18} />Kişi ekle
                                </button>
                            </div>
                        )}
                        <div className="sw-call plain">
                            <Info size={18} />
                            <span>Şimdi sadece isim yeter. Giriş davetlerini kurulum bittikten sonra tek tuşla gönderirsiniz.</span>
                        </div>
                    </div>
                    {foot(null, nextBtn())}
                </>)}

                {/* ── 8 · WhatsApp ── */}
                {step.key === 'whatsapp' && (<>
                    <div className="sw-body">
                        <div className="sw-q">
                            <h1>WhatsApp numaranızı bağlayın</h1>
                            <p>Bağlanınca randevu hatırlatmaları müşterinize kendi numaranızdan gider.</p>
                        </div>
                        {qrDead && (
                            <div className="sw-call red">
                                <Info size={18} />
                                <span><b>Karenin süresi doldu.</b> Güvenlik için kare 60 saniyede bir yenilenir. Yenileyip tekrar okutun.</span>
                            </div>
                        )}
                        {connection.status === 'connected' ? (
                            <div className="sw-call green">
                                <Check size={18} />
                                <span><b>Bağlandı.</b> Hatırlatmalar bu numaradan gidecek.</span>
                            </div>
                        ) : (
                            <div className="sw-qrwrap">
                                <div className={`sw-qr${qrDead ? ' dead' : ''}`}>
                                    {qr
                                        ? <img src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} alt="WhatsApp QR" />
                                        : <div className="sw-qr-ph">{waBusy ? <Loader2 size={26} className="animate-spin" /> : <Bot size={26} />}</div>}
                                    {(qrDead || !qr) && (
                                        <div className="over">
                                            <button className="sw-btn pri" style={{ minHeight: 44 }} disabled={waBusy} onClick={startQr}>
                                                <RefreshCw size={18} />{qrDead ? 'Kareyi yenile' : 'Kareyi getir'}
                                            </button>
                                            {qrDead && <span>Süresi doldu</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="sw-steps3">
                                    <div className="sw-s3"><b>1</b><span>Telefonunuzda WhatsApp'ı açın.</span></div>
                                    <div className="sw-s3"><b>2</b><span>Ayarlar → <b>Bağlı cihazlar</b> → Cihaz bağla.</span></div>
                                    <div className="sw-s3"><b>3</b><span>Telefonunuzu bu kareye tutun.</span></div>
                                    <div className="sw-call plain" style={{ marginTop: 2 }}>
                                        <Clock size={18} /><span>Kare 60 saniye geçerli. Süre dolarsa yenilersiniz.</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="sw-aibox">
                            <div className="hd">
                                <Bot size={20} />
                                <span className="t">AI randevu asistanı</span>
                                <span className="st">{assistant ? 'Açık' : 'Kapalı'}</span>
                                <button className={`sw-sw${assistant ? ' on' : ''}`} aria-label="AI asistan"
                                    disabled={connection.status !== 'connected'}
                                    style={connection.status !== 'connected' ? { opacity: .45, cursor: 'not-allowed' } : undefined}
                                    onClick={() => setAssistant(!assistant)} />
                            </div>
                            <p>
                                Açarsanız: müşterileriniz WhatsApp'tan yazdığında bot randevu oluşturur, fiyat ve
                                saat sorularını yanıtlar. Kapalıyken sadece hatırlatma mesajları gider, hiçbir
                                mesaja otomatik cevap verilmez.
                            </p>
                            <div className="sw-bub">
                                <span className="m">Yarın öğleden sonra müsait misiniz?</span>
                                <span className="m out">Yarın 14:30 ve 16:00 boş. Hangisini ayırayım?</span>
                            </div>
                        </div>
                    </div>
                    {foot('Telefonunuz yanınızda değilse sonra bağlayabilirsiniz.', <>
                        <button className="sw-btn gho" onClick={() => goNext(true)}>Sonra bağlarım</button>
                        {nextBtn(connection.status === 'connected' ? 'Bağlandı, bitir' : 'Bitir')}
                    </>)}
                </>)}
            </div>
        </div>
    );
}
