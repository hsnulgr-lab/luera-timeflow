import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBilling } from '@/hooks/useBilling';
import { useEntitlement } from '@/hooks/useEntitlement';
import {
    ALL_PLANS_FEATURES, PLANS, PLAN_COMPARE, TRIAL_DAYS, firstChargeDate, fitsTeam, formatTRY, planById,
    priceOf, teamSize, yearlyFreeMonths, yearlyPerMonth, type Cycle, type Plan, type PlanId,
} from '@/lib/plans';
import { afterPaymentPath } from '@/lib/odemeSonrasi';
import { SETUP_SCREENS, ownBusinessName, screenFor } from '@/lib/setupProgress';
import { nameLocative } from '@/pages/settings/ayarlarModel';
import { AbonelikIkonlar, Ic, Tick } from './abonelikIkonlar';
import './abonelik.css';

// Uygulama içi ödeme duvarı — /abonelik
// Tasarım: "Luera Masaustu - Abonelik v2" (2026-10-28) · A1 kurulumdan yeni
// gelen, A1-g kurulumu bitirmeden gelen, A2 ödeme dönüşü, A3 deneme bitti,
// A4 ödeme alınamadı, A5 kartsız deneme, A6 e-postadan gelen.
//
// Burası kurulumun SON ADIMI: kişi seçmez, onaylar. Önerilen plan kurulumdaki
// cevaptan gelir (ekibe sığan en küçük paket), bugün ödenecek tutar ve ilk
// tahsilatın günü her düğmenin hemen altında yazar. Korunan üç karar:
//
//   1. KIRMIZI YOK. Ödeme alınamadığında bile amber kullanılır — henüz
//      kaybedilmiş bir şey yok, kullanıcı suçlanmamalı.
//   2. İLK CÜMLE VERİNİN DURDUĞUNU SÖYLER (deneme bitti). Türkiye'de küçük
//      işletme sahibinin ilk korkusu "müşteri listem gitti mi" olur.
//   3. BAŞARISIZLIĞIN SEBEBİ TAHMİN EDİLMEZ. "Kartınızın limiti yetmedi"
//      demiyoruz; "Bankanız işlemi geçirmedi" yeterli.
//
// Ekrandaki her güvence gerçek: hatırlatma e-postası (kartlı denemede yok),
// iade sözü, rozet, Apple Pay yazılmaz (docs/abonelik-v2-claude-design-prompt.md).

const fullFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const DAY = 86_400_000;
const LEFT_WORDS = ['', 'bir', 'iki', 'üç'];
const DIGITS = [...'0123456789'].map((d) => <span key={d}>{d}</span>);

/** E-postadan gelenin ekranlarında uygulamaya düğme yerine (bkz. fromEmail). */
const CLOSE_NOTE = "Bu sayfayı kapatıp TimeFlow'u kullanmaya devam edebilirsiniz.";

/**
 * Duvarda gösterilen "verileriniz duruyor" sayaçları + işletme adı + çalışan
 * kişi, sahip dahil (`teamSize`; Tek kişilik yalnız sahibe: dodo-checkout).
 */
interface Kept { customers: number; past: number; upcoming: number; name: string; people: number }

/** Düğme altındaki para satırı, iki dönem için (biri görünür, data-bill). */
interface Money { m: React.ReactNode; y: React.ReactNode }

export function PaywallPage() {
    const { dark } = useTheme();
    const { logout, orgId, user } = useAuth();
    const navigate = useNavigate();
    const { startCheckout, updateCard, pollAfterCheckout } = useBilling();
    const ent = useEntitlement();
    const [params] = useSearchParams();
    const [showPlans, setShowPlans] = useState(false);
    const [kept, setKept] = useState<Kept | null>(null);
    const [cycle, setCycle] = useState<Cycle>(params.get('cycle') === 'yearly' ? 'yearly' : 'monthly');
    // Basılan düğme ödeme sayfası açılana kadar "açılıyor" kalır; başarısızsa
    // o kartın altında amber satır (A1-e · A1-f).
    const [pending, setPending] = useState<PlanId | null>(null);
    const [failed, setFailed] = useState<PlanId | null>(null);
    const [cardBusy, setCardBusy] = useState(false);
    const [howOpen, setHowOpen] = useState(false);
    // İlk kez gelende kurulum nerede: '/' bitti, '/kurulum…' kaldığı adım.
    const [setupPath, setSetupPath] = useState<string | null>(null);
    // Ödeme dönüşünde onay gelince gidilecek yer (A2-b).
    const [arrive, setArrive] = useState<string | null>(null);
    const autoStarted = useRef(false);
    const returning = params.get('checkout') === 'success';
    // Abonelik e-postasından gelen (/baglanti, girişte ?sonra=abonelik):
    // bu ekranda KALIR, web uygulamasına (çoğu telefondan gelir — telefon
    // sürümüne) hiç gönderilmez; Dodo'dan dönüş de buraya (dodo-checkout ·
    // donus). Kullanıcı kararı 2026-10-21: e-postadaki düğme salon sahibini
    // uygulamanın ana sayfasına düşürmesin.
    const fromEmail = params.get('kaynak') === 'eposta';
    const donus = fromEmail ? ('abonelik' as const) : undefined;
    const cardReturn = fromEmail && params.get('kart') === '1';
    const firstTime = !ent.loading && ent.state === 'none';

    // Kayıt sırasında plan seçilmişse (/fiyatlar → /login?plan=pro) doğrudan
    // ödemeye geç: kullanıcı planı bir kez seçti, ikinci kez sormak sürtünme.
    useEffect(() => {
        if (autoStarted.current) return;
        const plan = params.get('plan');
        if (plan === 'baslangic' || plan === 'pro' || plan === 'isletme') {
            autoStarted.current = true;
            void (async () => {
                setPending(plan);
                const ok = await startCheckout(plan, params.get('cycle') === 'yearly' ? 'yearly' : 'monthly');
                if (!ok) setPending(null);
            })();
        }
    }, [params, startCheckout]);

    // Ödeme dönüşü: webhook birkaç saniye gecikebilir, kısa süre poll'la.
    useEffect(() => {
        if (returning) pollAfterCheckout();
    }, [returning, pollAfterCheckout]);

    // Abonelik canlandığı an duvarı kaldır — ödeme dönüşü hariç: orada önce
    // "onay geldi" gösterilir, sonra kuruluma ya da ana sayfaya geçilir.
    // Kartsız (telefon) denemesi sürene de kalır: burası onun paket ekranı —
    // e-postadaki bağlantı ve şeritteki "Planı seç" buraya gelir; geri
    // atılsaydı deneme bitmeden paket alamazdı (docs/abonelik-kurallari.md).
    // Ek süredeki salon da kalır: erişimi sürdüğü için `ok` true, ama
    // "Ödemeniz alınamadı · Kartı güncelle" (A4) tam olarak onun ekranı.
    // E-postadan gelen de kalır: aboneliği sürüyorsa "Aboneliğiniz sürüyor"
    // görür (A6), uygulamaya atılmaz.
    useEffect(() => {
        if (!ent.loading && ent.ok && !ent.cardlessTrial && ent.effective !== 'grace' && !returning && !fromEmail) navigate('/', { replace: true });
    }, [ent.loading, ent.ok, ent.cardlessTrial, ent.effective, returning, fromEmail, navigate]);

    // "Verileriniz duruyor" sadece bir cümle olarak inandırıcı değil; sayı
    // görmek gerekiyor. Okuma RLS'te açık bırakıldığı için bu sorgu kilitliyken
    // de çalışır — kilit ürünü kullanmayı durdurur, veriyi değil.
    // NOT: bu sayfa uygulamanın veri sağlayıcılarının (ReservationsProvider)
    // DIŞINDA yaşıyor — duvar, kilitli bir kullanıcıya da açılmak zorunda ve o
    // sağlayıcılar org verisi çekmeye çalışırken hata veriyordu. Bu yüzden
    // ihtiyaç duyduğu üç sayı ve işletme adı doğrudan sorgulanıyor.
    const loadKept = useCallback(async (id: string) => {
        const today = new Date().toISOString().slice(0, 10);
        const [c, p, u, st, sf, og] = await Promise.all([
            supabase.from('customers').select('id', { count: 'exact', head: true })
                .eq('organization_id', id).eq('is_active', true),
            supabase.from('reservations').select('id', { count: 'exact', head: true })
                .eq('organization_id', id).lt('date', today),
            supabase.from('reservations').select('id', { count: 'exact', head: true })
                .eq('organization_id', id).gte('date', today).neq('status', 'cancelled'),
            supabase.from('settings').select('business_name')
                .eq('organization_id', id).limit(1).maybeSingle(),
            // is_active NULL = aktif (useStaff ile aynı okuma).
            supabase.from('staff').select('id', { count: 'exact', head: true })
                .eq('organization_id', id).not('is_active', 'is', false),
            // Telefondaki tek kişilik kipte sahip zaten tek personel satırı.
            supabase.from('organizations').select('solo').eq('id', id).maybeSingle(),
        ]);
        setKept({
            customers: c.count ?? 0, past: p.count ?? 0, upcoming: u.count ?? 0,
            name: st.data?.business_name || '', people: teamSize(sf.count ?? 0, og.data?.solo === true),
        });
    }, []);

    useEffect(() => {
        if (!orgId) return;
        (async () => { await loadKept(orgId); })();
    }, [orgId, loadKept]);

    // İlk kez gelen: kurulum bitti mi (başlık "hazır" mı, "denemenizi
    // başlatın" mı) — ödeme dönüşüyle AYNI karar (odemeSonrasi).
    useEffect(() => {
        if (!firstTime || !orgId || returning) return;
        let live = true;
        void afterPaymentPath(orgId).then((to) => { if (live) setSetupPath(to); });
        return () => { live = false; };
    }, [firstTime, orgId, returning]);

    // Ödeme dönüşü (e-posta kipi hariç): abonelik gelince "onay geldi", sonra
    // kurulum ya da ana sayfa; ne olduğu kısa bir bildirimle.
    const routed = useRef(false);
    useEffect(() => {
        if (!returning || fromEmail || ent.loading || !ent.ok || !orgId || routed.current) return;
        routed.current = true;
        const trial = ent.effective === 'trial';
        const until = ent.shownUntil ? fullFmt.format(new Date(ent.shownUntil)) : null;
        const description = trial && until ? `İlk tahsilat ${until}. O güne kadar iptal ederseniz ücret alınmaz.` : 'Aboneliğiniz aktif.';
        void afterPaymentPath(orgId).then((to) => {
            // Önce kısa bir "onay geldi" anı (A2-b), sonra yönlen. Kurulumun
            // başına gidene bunu K1'in bandı söyler (Ş2a).
            setArrive(to);
            window.setTimeout(() => {
                if (to !== '/kurulum') toast.success(trial ? 'Denemeniz başladı' : 'Ödemeniz alındı', { description });
                navigate(to, { replace: true });
            }, 1800);
        });
    }, [returning, fromEmail, ent.loading, ent.ok, ent.effective, ent.shownUntil, orgId, navigate]);

    useEffect(() => {
        if (!howOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHowOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [howOpen]);

    const onSelect = async (plan: PlanId, c: Cycle, inline = true) => {
        setFailed(null);
        setPending(plan);
        const ok = await startCheckout(plan, c, donus, { inlineError: inline });
        if (!ok) { setPending(null); if (inline) setFailed(plan); }
    };
    const onCard = async () => {
        setCardBusy(true);
        if (!(await updateCard(donus))) setCardBusy(false);
    };

    const pro = planById('pro') ?? PLANS[1];
    const solo = planById('baslangic') ?? PLANS[0];
    // Tek düğmeli seçim ve öneri: ekibe sığan en küçük paket. Tek başına
    // çalışana Ekip önermek ona gerek olmayanı satmak olur.
    const pick = kept && fitsTeam(solo, kept.people) ? solo : pro;
    const people = kept?.people ?? null;
    const trialDaysShown = ent.shownDaysLeft && ent.shownDaysLeft > 0 ? ent.shownDaysLeft : TRIAL_DAYS;
    const bizOwn = ownBusinessName(kept?.name, user?.name);
    const who = bizOwn || user?.name || '';
    const initials = who.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toLocaleUpperCase('tr')).join('');
    const freeMonths = yearlyFreeMonths(pro);
    const locked = pending !== null || cardBusy;

    // ══════════════════════════════════════════════════════════ PARÇALAR ════
    // İşaretleme döndüren yardımcılar (bileşen değil): render içinde bileşen
    // tanımlamak React'in kimliklerini her turda değiştirir.

    /** prog: 'done' üç parça dolu; sayı = biten ekran; null = gösterge yok. */
    const top = (prog: 'done' | number | null) => (
        <div className="wt">
            <div className="brand" aria-label="luera timeflow">luera<span className="tf">timeflow</span></div>
            {prog === null ? <span className="pg" /> : (
                <div className="pg" role="img" aria-label={prog === 'done' ? 'Kurulum tamamlandı' : `Kurulum: ${prog} / ${SETUP_SCREENS.length} adım tamam`}>
                    {SETUP_SCREENS.map((s, i) => (
                        <div key={s.key} className={`sg${prog === 'done' || i < prog ? ' dn' : ''}`}>
                            <i /><span>{i + 1} · {s.label}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="acct">
                {initials && <span className="av" aria-hidden="true" title={who}>{initials}</span>}
                {who && <span className="an">{who}</span>}
                <button type="button" className="btn3 sm" onClick={() => { void logout(); }}><Ic n="out" />Çıkış</button>
            </div>
        </div>
    );

    const shell = (prog: 'done' | number | null, body: React.ReactNode, extra = '') => (
        <div className={`ab-t ab${locked ? ' locked' : ''}${extra}`} data-theme={dark ? 'dark' : 'light'}
            data-bill={cycle === 'yearly' ? 'y' : 'm'}>
            <AbonelikIkonlar />
            {top(prog)}
            {body}
        </div>
    );

    const pbtn = (cls: string, label: React.ReactNode, busyLabel: string, busy: boolean, onClick: () => void) => (
        <button type="button" className={`${cls} pbtn${busy ? ' busy' : ''}`} data-start aria-busy={busy || undefined}
            onClick={busy ? undefined : onClick}>
            <span className="bl">
                <span className="l1">{label}<Ic n="arr" /></span>
                <span className="l2" aria-live="polite"><Ic n="lock" />{busyLabel}</span>
            </span>
        </button>
    );

    const priceTag = (p: Plan) => {
        const s = formatTRY(cycle === 'yearly' ? yearlyPerMonth(p) : p.monthly);
        let di = 0;
        return (
            <span className="amt" role="img" aria-label={`₺${s} / ay`}>
                <span>₺</span>
                {[...s].map((ch, i) => /\d/.test(ch) ? (
                    <span className="dg" key={i}>
                        <span className="col" style={{ '--n': ch, transitionDelay: `${(di++) * 35}ms` } as React.CSSProperties}>{DIGITS}</span>
                    </span>
                ) : <span key={i}>{ch}</span>)}
            </span>
        );
    };

    const card = (p: Plan, i: number, o: {
        rec: PlanId; cta: string; money: ((p: Plan) => Money) | null; current?: PlanId | null;
    }) => {
        const rec = o.rec === p.id;
        const dis = !fitsTeam(p, people);
        const isCurrent = o.current === p.id;
        const busy = pending === p.id;
        const off = dis ? 'Bu plan yalnız işletme sahibi içindir.' : null;
        const money = off ? { m: off, y: off } : o.money?.(p) ?? null;
        return (
            <article key={p.id} className={`plan in${rec ? ' rec' : ''}${dis ? ' dis' : ''}${failed === p.id ? ' err' : ''}`}
                style={{ '--d': 100 + i * 40 } as React.CSSProperties} aria-label={`${p.name}${rec ? ', size uygun' : ''}`}>
                <span className="lift" /><span className="bgk" />
                {rec && <><span className="shine" /><span className="glow" /><span className="lbl"><Ic n="check" />Size uygun</span></>}
                <div className="ph"><b>{p.name}</b><span>{p.tagline}</span></div>
                <div className="pr">
                    <div className="pa">{priceTag(p)}<span className="per">/ ay</span></div>
                    <div className="sx ps">
                        <span className="m">aylık ödeme · KDV dahil</span>
                        <span className="y">yılda tek ödeme ₺{formatTRY(p.yearlyTotal)}{freeMonths > 0 && <> · <b>{freeMonths} ay bedava</b></>}</span>
                    </div>
                </div>
                <div className="fs">
                    {PLAN_COMPARE.map((row, r) => {
                        const t = row[p.id];
                        const last = r === PLAN_COMPARE.length - 1 ? ' l' : '';
                        return t ? (
                            <div key={r} className={`f${last}`}><Ic n="check" /><span>{t}</span></div>
                        ) : (
                            <div key={r} className={`f no${last}`}><Ic n="minus" />
                                <span className="vh">Bu planda yok: {Object.values(row).find(Boolean)}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="cta">
                    {dis ? (
                        <div className="dbtn" aria-disabled="true"><Ic n="users" />Sizinle birlikte {people} kişi</div>
                    ) : isCurrent ? (
                        <div className="dbtn" aria-disabled="true"><Ic n="check" />Mevcut planınız</div>
                    ) : pbtn(rec ? 'btn' : 'btn2', o.cta, 'Güvenli ödeme sayfası açılıyor…', busy, () => void onSelect(p.id, cycle))}
                </div>
                <div className="sx mn">
                    {money && <><span className="m">{money.m}</span><span className="y">{money.y}</span></>}
                    <span className="er" role="alert"><Ic n="alert" /><span>Ödeme sayfası açılamadı, tekrar deneyin.</span></span>
                </div>
            </article>
        );
    };

    const trust = (
        <div className="tru">
            <span><Ic n="calx" />Deneme içinde iptal ederseniz ücret alınmaz</span>
            <span><Ic n="lock" />Kart bilgisi Dodo Payments'ın güvenli sayfasında girilir, Luera'ya gelmez</span>
            <span><Ic n="receipt" />Fiyatlar KDV dahil, fatura e-postayla gelir</span>
        </div>
    );

    /** "Nasıl çalışır?" — deneme günleri ve ilk tahsilat günü (A1-c). */
    const how = (rp: Plan, days: number, charge: Date) => {
        const today = new Date();
        const lastFree = new Date(charge.getTime() - DAY);
        return (
            <div className={`ovl${howOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Deneme nasıl işler?"
                aria-hidden={!howOpen} onClick={(e) => { if (e.target === e.currentTarget) setHowOpen(false); }}>
                <div className="sheet">
                    <div className="shh">
                        <h2>Deneme nasıl işler?</h2>
                        <button type="button" className="ix" aria-label="Kapat" onClick={() => setHowOpen(false)}><Ic n="x" /></button>
                    </div>
                    <div className="tl">
                        <span className="ln a"><i /></span><span className="ln b"><i /></span>
                        <div className="st"><span className="dt ok"><Tick /></span><span className="k">Bugün · {dayMonth.format(today)}</span>
                            <strong>₺0</strong><span>Kartınız güvenli ödeme sayfasında kaydedilir.</span></div>
                        <div className="st"><span className="dt rg" /><span className="k">{dayMonth.format(today)} – {dayMonth.format(lastFree)}</span>
                            <strong>{days} gün</strong><span>{rp.name} planının her şeyi açık.</span></div>
                        <div className="st"><span className="dt rg" />
                            <span className="k">{days === TRIAL_DAYS ? `${TRIAL_DAYS + 1}. gün` : 'Deneme bitince'} · {dayMonth.format(charge)}</span>
                            <strong className="sx"><span className="m">₺{formatTRY(rp.monthly)}</span><span className="y">₺{formatTRY(rp.yearlyTotal)}</span></strong>
                            <span className="sx"><span className="m">İlk tahsilat, aynı karttan.</span><span className="y">İlk tahsilat: yıllık toplam, aynı karttan.</span></span>
                        </div>
                    </div>
                    <div className="fq">
                        <div><Ic n="calx" /><span><b>İptal</b><p>İstediğiniz an Ayarlar › Abonelik'ten, tek düğmeyle. Deneme içinde iptal ederseniz hiçbir ücret alınmaz.</p></span></div>
                        <div><Ic n="lock" /><span><b>Kart bilgisi</b><p>Dodo Payments'ın güvenli ödeme sayfasında girilir, Luera'ya gelmez. Ödeme yöntemi: kart.</p></span></div>
                        <div><Ic n="mail" /><span><b>Fatura</b><p>Her tahsilatta e-postayla gelir.</p></span></div>
                        <div><Ic n="receipt" /><span><b>KDV</b><p>Fiyatlar KDV dahildir.</p></span></div>
                    </div>
                    <div className="sha"><button type="button" className="btn2 sm" onClick={() => setHowOpen(false)}>Anladım</button></div>
                </div>
            </div>
        );
    };

    /** Plan kartları ekranı: A1, A1-g, A5 ve "diğer planlar". */
    const plansView = (o: {
        prog: 'done' | number | null; h1: string; p: string; cta: string;
        money: ((p: Plan) => Money) | null; left: React.ReactNode;
        trial?: { days: number; charge: Date } | null; current?: PlanId | null;
    }) => {
        const rp = planById(pick.id) ?? pro;
        return shell(o.prog, <>
            <div className="wb"><div className="wc">
                <div className="hg in" style={{ '--d': 0 } as React.CSSProperties}><h1>{o.h1}</h1><p>{o.p}</p></div>
                <div className="seg in" style={{ '--d': 50 } as React.CSSProperties} role="group" aria-label="Ödeme dönemi">
                    <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Aylık</button>
                    <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>
                        Yıllık{freeMonths > 0 && <span className="save">{freeMonths} ay bedava</span>}
                    </button>
                </div>
                <div className="plans">{PLANS.map((p, i) => card(p, i, { rec: pick.id, cta: o.cta, money: o.money, current: o.current }))}</div>
                <p className="allp in" style={{ '--d': 230 } as React.CSSProperties}><b>Tüm planlarda:</b> {ALL_PLANS_FEATURES.join(' · ')}</p>
            </div></div>
            <div className="fb in" style={{ '--d': 230 } as React.CSSProperties}><div className="fbi">
                {o.left}
                {o.trial ? trust : <span className="tru" />}
                {o.trial && (
                    <button type="button" className="btn2 sm" data-how onClick={() => setHowOpen(true)}><Ic n="help" />Nasıl çalışır?</button>
                )}
            </div></div>
            {o.trial && how(rp, o.trial.days, o.trial.charge)}
        </>);
    };

    /** Deneme sonrası ilk tahsilat satırı: "Bugün ₺0 · 4 Kasım'da ₺799". */
    const trialMoney = (when: string) => (p: Plan): Money => ({
        m: <><b>Bugün ₺0</b> · {when} ₺{formatTRY(p.monthly)}</>,
        y: <><b>Bugün ₺0</b> · {when} ₺{formatTRY(p.yearlyTotal)}</>,
    });
    const todayMoney = (p: Plan): Money => ({
        m: <b>Bugün ₺{formatTRY(p.monthly)}</b>,
        y: <b>Bugün ₺{formatTRY(p.yearlyTotal)}</b>,
    });

    const center = (prog: 'done' | number | null, body: React.ReactNode, after?: React.ReactNode, extra = '') =>
        shell(prog, <><div className="wb"><div className="cen">{body}</div></div>{after}</>, extra);
    const d = (n: number) => ({ '--d': n } as React.CSSProperties);

    // ── A2: ödeme sonrası dönüş ──────────────────────────────────────────────
    // Fiş yalnız e-posta kipinde (telefon, uygulamaya gönderilmez); öteki
    // dönüş abonelik gelince kuruluma ya da ana sayfaya geçer (yukarıda).
    if (returning) {
        if (!ent.ok || !fromEmail) {
            const ok = arrive !== null;
            return center(null, <>
                <div className="tl in" style={{ ...d(0), maxWidth: 560, marginTop: 0 }}>
                    <span className="ln a on"><i /></span><span className={`ln b${ok ? ' on' : ''}`}><i /></span>
                    <div className="st"><span className="dt ok"><Tick /></span><span className="sl">Ödeme sayfası</span></div>
                    <div className="st"><span className={`dt ${ok ? 'ok' : 'w'}`}><Tick /></span><span className="sl">Banka onayı</span></div>
                    <div className="st"><span className={`dt s3${ok ? ' ok' : ''}`}><Tick /></span><span className="sl">Deneme başlar</span></div>
                </div>
                <div className="hx in" style={d(50)} aria-live="polite">
                    <div className="ha">
                        <h1>Ödemeniz işleniyor.</h1>
                        <p className="ld">Bankanızdan onay bekliyoruz, genelde birkaç saniye sürer. Bu sayfayı kapatmayın.</p>
                    </div>
                    <div className="hb">
                        <h1>Onay geldi.</h1>
                        <p className="ld">{arrive?.startsWith('/kurulum') ? 'Kuruluma dönülüyor…' : 'Ana sayfaya geçiliyor…'}</p>
                    </div>
                </div>
                <p className="mut in" style={d(100)}>Uzun sürerse sayfayı yenileyebilirsiniz; ödemeniz kaybolmaz.</p>
            </>, null, ok ? ' s-ok' : '');
        }
        const plan = planById(ent.plan) ?? pro;
        const planCycle: Cycle = ent.cycle === 'yearly' ? 'yearly' : 'monthly';
        const amount = priceOf(plan, planCycle);
        const onTrial = ent.effective === 'trial';
        return center(null, <>
            <div className="hg in" style={d(0)}>
                <h1>{onTrial ? 'Denemeniz başladı.' : 'Ödemeniz alındı.'}</h1>
                <p className="ld">
                    {plan.name} planı aktif.{' '}
                    {/* Gün sayısı Dodo'nun gerçek bitişinden: kartsız denemeden
                        erken alan salonun denemesi 7 gün DEĞİL, kalan gündür. */}
                    {onTrial
                        ? `${trialDaysShown} gün boyunca ücretsiz kullanacaksınız.`
                        : 'Faturanız birkaç dakika içinde e-posta adresinize gelir.'}
                </p>
            </div>
            <div className="sum receipt in" style={d(50)}>
                <div className="sr"><span>Plan</span><b>{plan.name} · {planCycle === 'yearly' ? 'yıllık' : 'aylık'}</b></div>
                <div className="sr"><span>Plan tutarı</span><b>₺{formatTRY(amount)}</b></div>
                {onTrial && <div className="sr"><span>Deneme süresi</span><b>{trialDaysShown} gün ücretsiz</b></div>}
                <div className="sr"><span>{onTrial ? 'Şimdi ödenen' : 'Ödenen tutar'}</span><b>₺{onTrial ? '0' : formatTRY(amount)}</b></div>
            </div>
            {ent.shownUntil && (
                <div className="bnd in" style={d(100)}>
                    <Ic n="cal" />
                    <span>
                        <b>Sonraki tahsilat: {fullFmt.format(new Date(ent.shownUntil))}</b>{' '}
                        Aynı karttan ₺{formatTRY(amount)} çekilir. İptal ederseniz çekim yapılmaz.
                    </span>
                </div>
            )}
            <p className="mut in" style={d(140)}>{CLOSE_NOTE}</p>
        </>);
    }

    // Abonelik durumu okunurken boş bir kapı göster — yoksa bir an yanlış
    // ekran ("Planınızı seçin" ya da "Deneme bitti") yanıp söner.
    if (ent.loading || (firstTime && (setupPath === null || kept === null))) {
        return center(null, (
            <span className="wst" role="status" aria-live="polite">
                <span className="wait" aria-hidden="true"><i /><i /><i /></span>Aboneliğiniz okunuyor
            </span>
        ));
    }

    // ── A5: kartsız deneme sürüyor — erken paket ─────────────────────────────
    // Telefondan açılan işletme (göç 124). Seçtiği paketin ilk tahsilatı
    // deneme bittiği gün yapılır — kalan günler Dodo'ya deneme olarak geçer
    // (dodo-checkout · cardlessTrialDaysLeft).
    if (ent.ok && ent.cardlessTrial) {
        const left = ent.shownDaysLeft ?? 0;
        const end = ent.shownUntil ? new Date(ent.shownUntil) : null;
        return plansView({
            prog: null,
            h1: 'Denemeniz sürüyor.',
            p: `${left <= 0 ? 'Bugün bitiyor' : `${left} gün kaldı`}${end ? ` · ${fullFmt.format(end)}` : ''}. `
                + 'Şimdi bir plan seçerseniz ilk tahsilat denemeniz bittiğinde yapılır; o güne kadar ücret alınmaz.',
            cta: 'Bu planı seç',
            money: trialMoney('deneme bitince'),
            trial: end && left > 0 ? { days: left, charge: end } : null,
            left: fromEmail ? (
                <span className="mut">{CLOSE_NOTE}</span>
            ) : (
                <button type="button" className="btn3 sm" onClick={() => navigate('/')}><Ic n="chl" />Şimdilik uygulamaya dön</button>
            ),
        });
    }

    // ── A6: e-postadan gelen, aboneliği sürüyor ──────────────────────────────
    // Eskiden burada uygulamaya atılıyordu. Tahsilat tarihi YAZILMAZ: iptal
    // bekleyen abonelik de burada görünür, "sonraki tahsilat" yalan olurdu —
    // yalnız dönem sonu/deneme bitişi.
    if (fromEmail && ent.ok && !ent.cardlessTrial && ent.effective !== 'grace') {
        const current = planById(ent.plan);
        const onTrial = ent.effective === 'trial';
        return center(null, <>
            <div className="hg in" style={d(0)}><h1>{onTrial ? 'Denemeniz sürüyor.' : 'Aboneliğiniz sürüyor.'}</h1></div>
            <div className="sum in" style={d(50)}>
                {current && <div className="sr"><span>Plan</span><b>{current.name} planı</b></div>}
                <div className="sr">
                    <span>{onTrial ? 'Deneme bitişi' : 'Dönem sonu'}</span>
                    <b>{ent.shownUntil ? fullFmt.format(new Date(ent.shownUntil)) : 'Şu an yapmanız gereken bir şey yok.'}</b>
                </div>
            </div>
            {/* Kart yalnız Dodo aboneliğinde var: hediye ve demoda düğme
                hiçbir yere gitmezdi (karşılığı olmayan kontrol çizilmez). */}
            {ent.dodoManaged && (
                <div className="in" style={d(100)}>{pbtn('btn2', 'Kartı güncelle', 'Kart sayfası açılıyor…', cardBusy, () => void onCard())}</div>
            )}
            <p className="mut in" style={d(140)}>{CLOSE_NOTE}</p>
        </>);
    }

    const countdown = (
        <div className="cd"><Ic n="clock" /><b>{remainingText(ent.until)}</b><span>boyunca uygulama<br />açık kalmaya devam eder</span></div>
    );
    const readOnly = (
        <div className="bnd"><Ic n="info" /><span>Süre dolarsa uygulama salt okunur olur: randevularınızı görürsünüz, yenisini oluşturamazsınız. Veriler silinmez.</span></div>
    );
    const back = (
        <button type="button" className="btn3 sm" onClick={() => setShowPlans(false)}><Ic n="chl" />Geri</button>
    );

    // ── A4: ödeme alınamadı, ek süre ─────────────────────────────────────────
    if (ent.effective === 'grace') {
        if (showPlans) {
            return plansView({
                prog: null, h1: 'Başka bir plana geçin.', p: 'Seçtiğiniz plan ödeme sayfasında onaylanır.',
                cta: 'Bu plana geç', money: null, left: back, current: ent.plan as PlanId,
            });
        }
        // Dodo kart sayfasından dönüş: sonuç webhook'la gelir, birkaç
        // saniye–dakika sürebilir. "Ödendi" DENMEZ — henüz bilinmiyor.
        if (cardReturn) {
            return center(null, <>
                <div className="hg in" style={d(0)}>
                    <h1>Kart sayfasından döndünüz.</h1>
                    <p className="ld">Yeni kartla ödemenin sonucu birkaç dakika içinde burada görünür.</p>
                </div>
                <span className="wst in" style={d(50)} role="status"><span className="wait" aria-hidden="true"><i /><i /><i /></span>Sonuç bekleniyor</span>
                {/* Yeni kart da reddedilirse takılı kalmasın; sonuç beklenirken turuncu çağrı yok. */}
                <div className="in" style={d(100)}>{pbtn('btn2', 'Kartı güncelle', 'Kart sayfası açılıyor…', cardBusy, () => void onCard())}</div>
                <div className="in" style={d(140)}>{countdown}</div>
                <div className="in" style={{ ...d(180), width: '100%' }}>{readOnly}</div>
            </>);
        }
        return center(null, <>
            <div className="hg in" style={d(0)}>
                <h1>Ödemeniz alınamadı.</h1>
                <p className="ld">Bankanız işlemi geçirmedi. Kartınızı güncelleyin, işlemi hemen tekrar deneyelim.</p>
            </div>
            <div className="in" style={d(50)}>{countdown}</div>
            <div className="row in" style={d(100)}>
                {/* Yeni abonelik DEĞİL: askıdaki aboneliğin kart sayfası —
                    Dodo borcu yeni karttan hemen çeker, abonelik sürer. */}
                {pbtn('btn', 'Kartı güncelle', 'Kart sayfası açılıyor…', cardBusy, () => void onCard())}
                <button type="button" className="btn2" onClick={() => setShowPlans(true)}>Başka bir plana geç</button>
            </div>
            <div className="in" style={{ ...d(140), width: '100%' }}>{readOnly}</div>
        </>);
    }

    // ── A1 / A1-g: ilk kez — kurulumun son adımı ─────────────────────────────
    if (firstTime) {
        const done = setupPath === '/';
        const at = done ? SETUP_SCREENS.length
            : Math.max(0, SETUP_SCREENS.findIndex((s) => s.key === screenFor(new URLSearchParams(setupPath?.split('?')[1]).get('adim'))));
        const charge = firstChargeDate();
        return plansView({
            prog: done ? 'done' : at,
            h1: done ? `${bizOwn || 'İşletmeniz'} hazır.` : 'Denemenizi başlatın.',
            p: done
                ? 'Randevu almaya başlamak için son adım. Kurulumdaki cevabınıza göre size uygun planı işaretledik.'
                : `Kurulumun ${LEFT_WORDS[SETUP_SCREENS.length - at]} adımı kaldı. Denemeyi şimdi başlatabilir, kurulumu sonra tamamlayabilirsiniz.`,
            cta: `${TRIAL_DAYS} gün ücretsiz başlat`,
            money: trialMoney(nameLocative(dayMonth.format(charge))),
            trial: { days: TRIAL_DAYS, charge },
            left: done ? (
                <button type="button" className="btn3 sm" onClick={() => navigate('/kurulum')}><Ic n="chl" />Kuruluma dön</button>
            ) : (
                <button type="button" className="btn2 sm" onClick={() => navigate(setupPath ?? '/kurulum')}>Kurulumu tamamla<Ic n="arr" /></button>
            ),
        });
    }

    // ── A3: deneme bitti / abonelik sona erdi ────────────────────────────────
    if (showPlans) {
        return plansView({
            prog: null, h1: 'Planınızı seçin.', p: 'Bir plan seçtiğiniz anda kaldığınız yerden devam edersiniz.',
            cta: 'Bu planla devam et', money: todayMoney, left: back,
        });
    }
    return center(null, <>
        <div className="hg in" style={d(0)}>
            <h1>{ent.state === 'trial' ? 'Deneme süreniz doldu.' : 'Aboneliğiniz sona erdi.'}</h1>
            <p className="ld">Verileriniz duruyor. Bir plan seçtiğiniz anda kaldığınız yerden devam edersiniz.</p>
        </div>
        {kept && (kept.customers > 0 || kept.past > 0) && (
            <div className="keep in" style={d(50)}>
                <div className="kh"><span className="gk">HESABINIZDA DURAN VERİLER</span><span className="ok"><Ic n="check" />Silinmedi</span></div>
                <div className="ks">
                    <div><b>{formatTRY(kept.customers)}</b><span>Müşteri kaydı</span></div>
                    <div><b>{formatTRY(kept.past)}</b><span>Geçmiş randevu</span></div>
                    <div><b>{formatTRY(kept.upcoming)}</b><span>İleri tarihli randevu</span></div>
                </div>
            </div>
        )}
        <div className="row in" style={d(100)}>
            {pbtn('btn', <>{pick.name} planını seç · ₺{formatTRY(priceOf(pick, 'monthly'))}/ay</>, 'Güvenli ödeme sayfası açılıyor…',
                pending === pick.id, () => void onSelect(pick.id, 'monthly', false))}
            <button type="button" className="btn3" onClick={() => setShowPlans(true)}>Diğer planlara bak</button>
        </div>
        <p className="mut in" style={d(140)}>Bugün başlarsanız ilk tahsilat bugün yapılır.</p>
    </>, (
        <p className="fnote in" style={d(180)}>
            Verilerinizi dışa aktarmak için <a href="mailto:destek@lueratech.com">destek@lueratech.com</a> adresine yazmanız yeterli; abonelik gerekmez.
        </p>
    ));
}

/** "2 gün 4 saat" — ek süre geri sayımı. Tasarımın büyük rakamı bunu okuyor. */
function remainingText(until: string | null): string {
    if (!until) return '—';
    const ms = Date.parse(until) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return 'Süre doldu';
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    if (d <= 0) return `${h} saat`;
    return `${d} gün ${h} saat`;
}
