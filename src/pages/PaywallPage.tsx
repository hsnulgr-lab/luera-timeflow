import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBilling } from '@/hooks/useBilling';
import { useEntitlement } from '@/hooks/useEntitlement';
import { PlanCards } from '@/components/billing/PlanCards';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import {
    PLANS, TRIAL_DAYS, fitsTeam, formatTRY, planById, priceOf, type Cycle, type PlanId,
} from '@/lib/plans';
import { nextCoreStep } from '@/lib/setupProgress';
import './billing.css';

// Uygulama içi ödeme duvarı — /abonelik
// Tasarım: "Luera Fiyatlandırma.html" · Durum 2 (deneme bitti), Durum 3 (ödeme
// alınamadı), Durum 5 (ödeme sonrası dönüş).
//
// Bu ekran bir CEZA DEĞİL, bir kapı. Karşısındaki kişi zaten bir sürtünme
// yaşıyor. Tasarımın üç kararı bilinçli ve korunmalı:
//
//   1. KIRMIZI YOK. Ödeme alınamadığında bile amber kullanılır — henüz
//      kaybedilmiş bir şey yok, kullanıcı suçlanmamalı.
//   2. İLK CÜMLE VERİNİN DURDUĞUNU SÖYLER. Türkiye'de küçük işletme sahibinin
//      ilk korkusu "müşteri listem gitti mi" olur; o cümle yazmazsa sayfayı
//      kapatıp telefonla arar.
//   3. BAŞARISIZLIĞIN SEBEBİ TAHMİN EDİLMEZ. "Kartınızın limiti yetmedi"
//      demiyoruz — bankaya yönlendiriyoruz.

const fullFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

/** E-postadan gelenin ekranlarında uygulamaya düğme yerine (bkz. fromEmail). */
const CLOSE_NOTE = "Bu sayfayı kapatıp TimeFlow'u kullanmaya devam edebilirsiniz.";

/**
 * Ödemeden sonra nereye: kurulumun zorunlu adımları bittiyse ana sayfa,
 * bitmediyse kurulum — kaldığı adımdan (kullanıcı kararı 2026-10-22).
 * Bu sayfa uygulamanın veri sağlayıcılarının DIŞINDA; olgular doğrudan
 * okunur. Okunamazsa ana sayfa: oradaki şerit kurulumu zaten hatırlatır,
 * gereksiz yere sihirbaza atmak Test 1'deki şikâyetti.
 */
async function afterPaymentPath(orgId: string): Promise<string> {
    const [st, sv] = await Promise.all([
        supabase.from('settings').select('sector, business_name, working_hours')
            .eq('organization_id', orgId).limit(1).maybeSingle(),
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);
    if (st.error || sv.error) return '/';
    const hours = Array.isArray(st.data?.working_hours) ? (st.data.working_hours as { isOff?: boolean }[]) : null;
    // Adres ve telefon karara girmez: sihirbaz onları sormadan geçer (Test B).
    const next = nextCoreStep({
        sector: st.data?.sector || 'genel',
        businessName: st.data?.business_name ?? '',
        // Satırda saat yoksa uygulama varsayılan (açık) saatleri kullanır.
        openDays: hours ? hours.filter((h) => !h.isOff).length : 1,
        serviceCount: sv.count ?? 0,
        // Atlanabilir adımlar karara girmez.
        resourceCount: 0, resourcesApply: false, staffCount: 0, soloDeclared: false, whatsappConnected: false,
    });
    if (!next) return '/';
    // Hiçbir şey girilmemişse karşılamadan; yarıdaysa kaldığı adımdan.
    return next !== 'sector' ? `/kurulum?adim=${next}` : '/kurulum';
}

/**
 * Duvarda gösterilen "verileriniz duruyor" sayaçları + işletme adı + aktif
 * çalışan sayısı (Tek kişilik paketi tek çalışana: dodo-checkout · maxStaff).
 */
interface Kept { customers: number; past: number; upcoming: number; name: string; staff: number }

export function PaywallPage() {
    const { dark } = useTheme();
    const { logout, orgId } = useAuth();
    const navigate = useNavigate();
    const { busy, startCheckout, updateCard, pollAfterCheckout } = useBilling();
    const ent = useEntitlement();
    const [params] = useSearchParams();
    const [showPlans, setShowPlans] = useState(false);
    const [kept, setKept] = useState<Kept | null>(null);
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

    // Kayıt sırasında plan seçilmişse (/fiyatlar → /login?plan=pro) doğrudan
    // ödemeye geç: kullanıcı planı bir kez seçti, ikinci kez sormak sürtünme.
    useEffect(() => {
        if (autoStarted.current) return;
        const plan = params.get('plan');
        if (plan === 'baslangic' || plan === 'pro' || plan === 'isletme') {
            autoStarted.current = true;
            void startCheckout(plan, params.get('cycle') === 'yearly' ? 'yearly' : 'monthly');
        }
    }, [params, startCheckout]);

    // Ödeme dönüşü: webhook birkaç saniye gecikebilir, kısa süre poll'la.
    useEffect(() => {
        if (returning) pollAfterCheckout();
    }, [returning, pollAfterCheckout]);

    // Abonelik canlandığı an duvarı kaldır — ödeme dönüşü hariç: orada önce
    // "ödemeniz alındı" fişi gösterilir, kullanıcı kuruluma kendisi geçer.
    // Kartsız (telefon) denemesi sürene de kalır: burası onun paket ekranı —
    // e-postadaki bağlantı ve şeritteki "Planı seç" buraya gelir; geri
    // atılsaydı deneme bitmeden paket alamazdı (docs/abonelik-kurallari.md).
    // Ek süredeki salon da kalır: erişimi sürdüğü için `ok` true, ama
    // "Ödemeniz alınamadı · Kartı güncelle" (Durum 3) tam olarak onun ekranı.
    // Bu koşul yokken o ekran hiç görünmüyordu — "ödeme alınamadı"
    // e-postasının düğmesi kişiyi ana sayfaya atıyordu.
    // E-postadan gelen de kalır: aboneliği sürüyorsa "Aboneliğiniz sürüyor"
    // görür (aşağıda), uygulamaya atılmaz.
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
        const [c, p, u, st, sf] = await Promise.all([
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
        ]);
        setKept({
            customers: c.count ?? 0, past: p.count ?? 0, upcoming: u.count ?? 0,
            name: st.data?.business_name || '', staff: sf.count ?? 0,
        });
    }, []);

    useEffect(() => {
        if (!orgId) return;
        (async () => { await loadKept(orgId); })();
    }, [orgId, loadKept]);

    // Ödeme dönüşü (e-posta kipi hariç): abonelik gelince fiş yerine
    // doğrudan ana sayfa ya da kurulum; ne olduğu kısa bir bildirimle.
    const routed = useRef(false);
    useEffect(() => {
        if (!returning || fromEmail || ent.loading || !ent.ok || !orgId || routed.current) return;
        routed.current = true;
        const trial = ent.effective === 'trial';
        const until = ent.shownUntil ? fullFmt.format(new Date(ent.shownUntil)) : null;
        void afterPaymentPath(orgId).then((to) => {
            toast.success(trial ? 'Denemeniz başladı' : 'Ödemeniz alındı', {
                description: trial && until ? `İlk tahsilat ${until}. O güne kadar iptal ederseniz ücret alınmaz.` : 'Aboneliğiniz aktif.',
            });
            navigate(to, { replace: true });
        });
    }, [returning, fromEmail, ent.loading, ent.ok, ent.effective, ent.shownUntil, orgId, navigate]);

    const onSelect = (plan: PlanId, cycle: Cycle) => { void startCheckout(plan, cycle, donus); };
    const pro = planById('pro') ?? PLANS[1];
    const solo = planById('baslangic') ?? PLANS[0];
    // Tek düğmeli seçim: ekibe sığan en küçük paket. Tek başına çalışana
    // Ekip önermek ona gerek olmayanı satmak olur.
    const pick = kept && fitsTeam(solo, kept.staff) ? solo : pro;
    const activeStaff = kept?.staff ?? null;
    const trialDaysShown = ent.shownDaysLeft && ent.shownDaysLeft > 0 ? ent.shownDaysLeft : TRIAL_DAYS;
    const bizName = kept?.name || 'İşletmeniz';
    const initials = bizName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toLocaleUpperCase('tr')).join('');

    const shell = (body: React.ReactNode) => (
        <div className={cn('bl dash-theme', dark && 'dark')}
            style={{ minHeight: '100vh', padding: '24px 20px 70px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <BillingSprite />
            <div className="frame" style={{ width: '100%', maxWidth: 900 }}>
                <div className="appbar">
                    <span className="brand">luera<i /></span>
                    <span className="who">
                        <span className="av">{initials || 'LU'}</span>{bizName}
                        <button className="btn bare" style={{ minHeight: 44 }} onClick={() => { void logout(); }}>
                            <Ico n="logout" s="i16" />Çıkış
                        </button>
                    </span>
                </div>
                {body}
            </div>
        </div>
    );

    // ── Durum 5: ödeme sonrası dönüş ─────────────────────────────────────────
    // Fiş yalnız e-posta kipinde (telefon, uygulamaya gönderilmez); öteki
    // dönüş abonelik gelince ana sayfaya ya da kuruluma geçer (yukarıda).
    if (returning) {
        if (!ent.ok || !fromEmail) {
            return shell(
                <div className="wall" style={{ paddingTop: 32 }}>
                    <div className="badge n"><Ico n="loading" s="i26" className="spin" /></div>
                    <h1 style={{ fontSize: 24 }}>{ent.ok ? 'Hazırlanıyor.' : 'Ödemeniz işleniyor.'}</h1>
                    <p className="lede" style={{ fontSize: 14.5 }}>
                        {ent.ok
                            ? 'Aboneliğiniz aktif; sizi yönlendiriyoruz.'
                            : 'Bankanızdan onay bekliyoruz, genelde birkaç saniye sürer. Bu sayfayı kapatmayın.'}
                    </p>
                    {!ent.ok && (
                        <span style={{ fontSize: 13, color: 'var(--dc-muted2)' }}>
                            Uzun sürerse sayfayı yenileyebilirsiniz; ödemeniz kaybolmaz.
                        </span>
                    )}
                </div>,
            );
        }
        const plan = planById(ent.plan) ?? pro;
        const cycle: Cycle = ent.cycle === 'yearly' ? 'yearly' : 'monthly';
        const amount = priceOf(plan, cycle);
        return shell(
            <div className="wall">
                <div className="badge g landed"><Ico n="receipt-ok" s="i26" /></div>
                <h1>{ent.effective === 'trial' ? 'Denemeniz başladı.' : 'Ödemeniz alındı.'}</h1>
                <p className="lede">
                    {plan.name} planı aktif.{' '}
                    {/* Gün sayısı Dodo'nun gerçek bitişinden: kartsız denemeden
                        erken alan salonun denemesi 7 gün DEĞİL, kalan gündür. */}
                    {ent.effective === 'trial'
                        ? `${trialDaysShown} gün boyunca ücretsiz kullanacaksınız.`
                        : 'Faturanız birkaç dakika içinde e-posta adresinize gelir.'}
                </p>
                <div className="receipt">
                    <div className="rh">
                        <span className="rl">Abonelik özeti</span>
                        <span className="rid num">{plan.name} · {cycle === 'yearly' ? 'yıllık' : 'aylık'}</span>
                    </div>
                    <div className="rr">
                        <span className="d">Plan tutarı</span>
                        <span className="a num">₺{formatTRY(amount)}</span>
                    </div>
                    {ent.effective === 'trial' && (
                        <div className="rr">
                            <span className="d">Deneme süresi</span>
                            <span className="a" style={{ color: 'var(--dc-green)' }}>{trialDaysShown} gün ücretsiz</span>
                        </div>
                    )}
                    <div className="rtot">
                        <span className="d">{ent.effective === 'trial' ? 'Şimdi ödenen' : 'Ödenen tutar'}</span>
                        <span className="a num">₺{ent.effective === 'trial' ? '0' : formatTRY(amount)}</span>
                    </div>
                    {ent.shownUntil && (
                        <div className="rnext">
                            <Ico n="cal" />
                            <div>
                                <b>Sonraki tahsilat: {fullFmt.format(new Date(ent.shownUntil))}</b>
                                <span>
                                    Aynı karttan <span className="num">₺{formatTRY(amount)}</span> çekilir.
                                    İptal ederseniz çekim yapılmaz.
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                <span style={{ fontSize: 13.5, color: 'var(--dc-muted)' }}>{CLOSE_NOTE}</span>
            </div>,
        );
    }

    // E-postadan gelen: abonelik durumu okunurken boş bir kapı göster —
    // yoksa bir an "Planınızı seçin" yanıp söner.
    if (fromEmail && ent.loading) {
        return shell(
            <div className="wall" role="status" aria-live="polite">
                <div className="badge n"><Ico n="loading" s="i26" className="spin" /></div>
                <h1 style={{ fontSize: 24 }}>Aboneliğiniz okunuyor.</h1>
            </div>,
        );
    }

    // ── Kartsız deneme sürüyor: erken paket ─────────────────────────────────
    // Telefondan açılan işletme (göç 124). Seçtiği paketin ilk tahsilatı
    // deneme bittiği gün yapılır — kalan günler Dodo'ya deneme olarak geçer
    // (dodo-checkout · cardlessTrialDaysLeft).
    if (ent.ok && ent.cardlessTrial) {
        const left = ent.shownDaysLeft ?? 0;
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="clock" s="i26" /></div>
                <h1>Denemeniz sürüyor.</h1>
                <p className="lede">
                    {left <= 0 ? 'Bugün bitiyor' : `${left} gün kaldı`}
                    {ent.shownUntil ? ` · ${fullFmt.format(new Date(ent.shownUntil))}` : ''}.{' '}
                    Şimdi bir plan seçerseniz ilk tahsilat denemeniz bittiğinde yapılır; o güne kadar ücret alınmaz.
                </p>
                <div style={{ width: '100%', textAlign: 'left' }}>
                    <PlanCards busy={busy} onSelect={onSelect} activeStaff={activeStaff} ctaLabel={() => 'Bu planı seç'} />
                </div>
                {fromEmail ? (
                    <span style={{ fontSize: 13.5, color: 'var(--dc-muted)' }}>{CLOSE_NOTE}</span>
                ) : (
                    <button className="btn bare" onClick={() => navigate('/')}>
                        Şimdilik uygulamaya dön
                    </button>
                )}
            </div>,
        );
    }

    // ── E-postadan gelen, aboneliği sürüyor ─────────────────────────────────
    // Eskiden burada uygulamaya atılıyordu. Tahsilat tarihi YAZILMAZ: iptal
    // bekleyen abonelik de burada görünür, "sonraki tahsilat" yalan olurdu —
    // yalnız dönem sonu/deneme bitişi.
    if (fromEmail && ent.ok && !ent.cardlessTrial && ent.effective !== 'grace') {
        const current = planById(ent.plan);
        const onTrial = ent.effective === 'trial';
        return shell(
            <div className="wall">
                <div className="badge g"><Ico n="receipt-ok" s="i26" /></div>
                <h1>{onTrial ? 'Denemeniz sürüyor.' : 'Aboneliğiniz sürüyor.'}</h1>
                <p className="lede">
                    {current ? `${current.name} planı. ` : ''}
                    {ent.shownUntil
                        ? `${onTrial ? 'Deneme bitişi' : 'Dönem sonu'}: ${fullFmt.format(new Date(ent.shownUntil))}.`
                        : 'Şu an yapmanız gereken bir şey yok.'}
                </p>
                {/* Kart yalnız Dodo aboneliğinde var: hediye ve demoda düğme
                    hiçbir yere gitmezdi (karşılığı olmayan kontrol çizilmez). */}
                {ent.dodoManaged && (
                    <div className="acts">
                        <button className="btn pri big" disabled={busy} onClick={() => void updateCard(donus)}>
                            Kartı güncelle
                        </button>
                    </div>
                )}
                <span style={{ fontSize: 13.5, color: 'var(--dc-muted)' }}>{CLOSE_NOTE}</span>
            </div>,
        );
    }

    // ── Durum 3: ödeme alınamadı, ek süre ────────────────────────────────────
    if (ent.effective === 'grace') {
        return shell(
            <div className="wall">
                <div className="badge w alert"><Ico n="card" s="i26" /></div>
                <h1>Ödemeniz alınamadı.</h1>
                <p className="lede">
                    Bankanız işlemi geçirmedi. Bu genelde limit ya da kart doğrulamasıyla ilgilidir.
                    Kartınızı güncelleyin, işlemi hemen tekrar deneyelim.
                </p>
                {/* Dodo kart sayfasından dönüş: sonuç webhook'la gelir, birkaç
                    saniye–dakika sürebilir. "Ödendi" DENMEZ — henüz bilinmiyor. */}
                {cardReturn && (
                    <div className="call plain" style={{ maxWidth: 560, textAlign: 'left' }}>
                        <Ico n="info" />
                        <span>Kart sayfasından döndünüz. Yeni kartla ödemenin sonucu birkaç dakika içinde burada görünür; sayfayı yenileyerek bakabilirsiniz.</span>
                    </div>
                )}
                <div className="countdown live">
                    <svg className="i26" style={{ color: 'var(--dc-amber)' }}><use href="#bl-clock" /></svg>
                    <span className="big num">{remainingText(ent.until)}</span>
                    <span className="lb">boyunca uygulama<br />açık kalmaya devam eder</span>
                </div>
                <div className="acts">
                    {/* Yeni abonelik DEĞİL: askıdaki aboneliğin kart sayfası —
                        Dodo borcu yeni karttan hemen çeker, abonelik sürer. */}
                    <button className="btn pri big" disabled={busy} onClick={() => void updateCard(donus)}>
                        Kartı güncelle
                    </button>
                    <button className="btn bare" onClick={() => setShowPlans((v) => !v)}>
                        Başka bir plana geç
                    </button>
                </div>
                {showPlans && (
                    <div style={{ width: '100%', textAlign: 'left' }}>
                        <PlanCards busy={busy} onSelect={onSelect} currentPlan={ent.plan as PlanId} activeStaff={activeStaff}
                            ctaLabel={() => 'Bu plana geç'} />
                    </div>
                )}
                <div className="call amber" style={{ maxWidth: 560, textAlign: 'left' }}>
                    <Ico n="info" />
                    <span>
                        Süre dolarsa uygulama salt okunur olur: randevularınızı görürsünüz,
                        yenisini oluşturamazsınız. Veriler silinmez.
                    </span>
                </div>
            </div>,
        );
    }

    // ── Durum 2: deneme bitti / abonelik yok ─────────────────────────────────
    const firstTime = ent.state === 'none';
    return shell(
        <div className="wall">
            <div className="badge n pausing"><Ico n="pause" s="i26" /></div>
            <h1>{firstTime ? 'Planınızı seçin.' : ent.state === 'trial' ? 'Deneme süreniz doldu.' : 'Aboneliğiniz sona erdi.'}</h1>
            <p className="lede">
                {firstTime
                    ? `${TRIAL_DAYS} gün ücretsiz. Kartınızdan ilk tahsilat ${TRIAL_DAYS + 1}. günde yapılır, deneme içinde iptal ederseniz hiçbir ücret alınmaz.`
                    : 'Verileriniz duruyor. Bir plan seçtiğiniz anda kaldığınız yerden devam edersiniz — hiçbir randevu, müşteri ya da ayar kaybolmadı.'}
            </p>

            {!firstTime && kept && (kept.customers > 0 || kept.past > 0) && (
                <div className="keep">
                    <div className="kh">
                        <Ico n="db" />
                        <span className="t">Hesabınızda duran veriler</span>
                        <span className="st">Silinmedi</span>
                    </div>
                    <div className="kr"><span className="kl">Müşteri kaydı</span><span className="kv num">{kept.customers}</span></div>
                    <div className="kr"><span className="kl">Geçmiş randevu</span><span className="kv num">{kept.past}</span></div>
                    <div className="kr"><span className="kl">İleri tarihli randevu</span><span className="kv num">{kept.upcoming}</span></div>
                    <div className="kf">Plan seçmeseniz de verileriniz durur; istediğiniz an dışa aktarabilirsiniz.</div>
                </div>
            )}

            {showPlans || firstTime ? (
                <div style={{ width: '100%', textAlign: 'left' }}>
                    <PlanCards busy={busy} onSelect={onSelect} activeStaff={activeStaff}
                        ctaLabel={() => (firstTime ? `${TRIAL_DAYS} gün ücretsiz dene` : 'Bu planla devam et')} />
                </div>
            ) : (
                <>
                    <div className="acts">
                        <button className="btn pri big" disabled={busy} onClick={() => onSelect(pick.id, 'monthly')}>
                            {pick.name} planını seç · <span className="num">₺{formatTRY(priceOf(pick, 'monthly'))}</span>/ay
                        </button>
                        <button className="btn gho big" onClick={() => setShowPlans(true)}>Diğer planlara bak</button>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--dc-muted)' }}>
                        Bugün başlarsanız ilk tahsilat bugün yapılır, sonrası her ayın {new Date().getDate()}'sinde.
                    </span>
                </>
            )}

            <div className="call plain" style={{ maxWidth: 520, textAlign: 'left' }}>
                <Ico n="db" />
                <span>
                    Devam etmek istemiyorsanız verileriniz burada duruyor; dışa aktarım için{' '}
                    <a href="mailto:destek@lueratech.com">bize yazmanız</a> yeterli. Bunun için abonelik gerekmez.
                </span>
            </div>
        </div>,
    );
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
