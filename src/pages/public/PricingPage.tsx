import { useNavigate } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { PlanCards } from '@/components/billing/PlanCards';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import { PLANS, TRIAL_DAYS, firstChargeDate, formatTRY, planById, type Cycle, type PlanId } from '@/lib/plans';
import '@/pages/billing.css';

// Herkese açık fiyat sayfası — /fiyatlar
// Tasarım: "Luera Fiyatlandırma.html" · Durum 1.
//
// Kullanıcı çoğu zaman WhatsApp'tan gelen bir linkle, telefonundan ve ürünü hiç
// görmeden geliyor. Sayfanın işi ikna etmek.
//
// DENEME AÇIKLAMASI kartların ÜSTÜNDE değil ALTINDA — tasarımın bilinçli
// kararı: asıl itiraz "kart bilgisi istiyor mu" sorusu ve o soru fiyatı
// gördükten sonra doğuyor.
//
// Plan seçimi doğrudan ödeme başlatmaz: önce hesap gerekiyor. Seçim /login'e
// taşınır, kayıt biter bitmez ödeme kendiliğinden açılır.

const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

export function PricingPage() {
    const { dark } = useTheme();
    const navigate = useNavigate();

    const onSelect = (plan: PlanId, cycle: Cycle) => {
        navigate(`/login?mode=signup&plan=${plan}&cycle=${cycle}`);
    };

    // Tarihler somut yazılır. "7 gün ücretsiz" deyip ne zaman para çekileceğini
    // söylememek, kart isteyen bir denemede güveni bitiren şeydir.
    const today = new Date();
    const charge = firstChargeDate(today);
    const nudge = new Date(charge.getTime() - 2 * 86_400_000);
    const pro = planById('pro') ?? PLANS[1];

    return (
        <div className={cn('bl dash-theme', dark && 'dark')}
            style={{ minHeight: '100vh', padding: '28px 24px 90px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
            <BillingSprite />

            <div className="frame" style={{ width: '100%', maxWidth: 1120 }}>
                <div className="pad">
                    <div className="hero">
                        <span className="trial-pill">
                            <Ico n="ck" />
                            {TRIAL_DAYS} gün ücretsiz · deneme içinde iptal ederseniz ücret alınmaz
                        </span>
                        <h1>Randevularınız tek yerde, ayda bir kahve parasına.</h1>
                        <p>
                            İşletmeniz büyüdükçe planınızı yükseltirsiniz. Sözleşme yok, taahhüt yok,
                            istediğiniz an iptal.
                        </p>
                    </div>

                    <PlanCards onSelect={onSelect} />

                    <div className="explain">
                        <div className="lead">
                            <span className="eyebrow"><Ico n="lock" s="i16" />Deneme koşulları</span>
                            <h3>Kart bilgisi istiyoruz. Nedenini açıkça yazalım.</h3>
                            <p>
                                Deneme bitince hizmetin kesintisiz devam etmesi için kartı baştan
                                alıyoruz. İlk tahsilat {TRIAL_DAYS + 1}. günde yapılır ve tarihi ekranda
                                yazar. Deneme içinde iptal ederseniz kartınızdan hiçbir ücret çekilmez.
                            </p>
                        </div>
                        <div className="tl">
                            <div className="row">
                                <span className="dot fill">
                                    <svg style={{ width: 11, height: 11, strokeWidth: 3 }}><use href="#bl-ck" /></svg>
                                </span>
                                <span className="tx">
                                    <b>Bugün · {dayFmt.format(today)}</b>
                                    <span>Kaydolursunuz, tüm özellikler açılır. Ücret alınmaz.</span>
                                </span>
                            </div>
                            <div className="row">
                                <span className="dot" />
                                <span className="tx">
                                    <b>{TRIAL_DAYS - 1}. gün · {dayFmt.format(nudge)}</b>
                                    <span>Denemenizin bitmesine 2 gün kaldığını hatırlatan mesaj.</span>
                                </span>
                            </div>
                            <div className="row">
                                <span className="dot pay" />
                                <span className="tx">
                                    <b>{TRIAL_DAYS + 1}. gün · {dayFmt.format(charge)}</b>
                                    <span>İlk tahsilat: <b className="num">₺{formatTRY(pro.monthly)}</b>. Sonrası her ayın {charge.getDate()}'sinde.</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="trust">
                        <div className="tr"><Ico n="undo" s="i" /><div>
                            <div className="t">Tek tıkla iptal</div>
                            <div className="d">Ayarlar → Faturalandırma. Telefon etmenize gerek yok.</div>
                        </div></div>
                        <div className="tr"><Ico n="db" s="i" /><div>
                            <div className="t">Veriler sizin</div>
                            <div className="d">Müşteri ve randevu listenizi istediğiniz an Excel olarak indirirsiniz.</div>
                        </div></div>
                        <div className="tr"><Ico n="shield" s="i" /><div>
                            <div className="t">KVKK uyumlu</div>
                            <div className="d">Veriler Türkiye'de barındırılır, üçüncü kişiyle paylaşılmaz.</div>
                        </div></div>
                        <div className="tr"><Ico n="doc" s="i" /><div>
                            <div className="t">Her ödemeye fatura</div>
                            <div className="d">Şahıs ya da şirket adına, e-posta ile gönderilir.</div>
                        </div></div>
                    </div>

                    <div className="faq">
                        <div className="qa">
                            <div className="q">Deneme içinde iptal edersem ücret alınır mı?</div>
                            <div className="a">Hayır. {TRIAL_DAYS} gün dolmadan iptal ederseniz kartınızdan hiçbir tahsilat yapılmaz. İlk tahsilat {TRIAL_DAYS + 1}. günde başlar.</div>
                        </div>
                        <div className="qa">
                            <div className="q">Sonradan plan değiştirebilir miyim?</div>
                            <div className="a">Evet. Şu an değişiklik için bizimle iletişime geçmeniz yeterli; kendi kendine yükseltme yakında.</div>
                        </div>
                        <div className="qa">
                            <div className="q">Yıllık ödersem ne kazanıyorum?</div>
                            <div className="a">İki ay bedava — 12 ay yerine 10 ay ödersiniz. Yıllık ödemede de {TRIAL_DAYS} gün deneme geçerli.</div>
                        </div>
                        <div className="qa">
                            <div className="q">İptal edersem verilerim silinir mi?</div>
                            <div className="a">Hayır. Yeni kayıt oluşturamazsınız ama geçmiş verileriniz durur ve dilediğiniz an indirebilirsiniz.</div>
                        </div>
                        <div className="qa">
                            <div className="q">Kaç kişi kullanabilir?</div>
                            <div className="a">Başlangıç'ta 3 kişi, Pro ve İşletme'de sınırsız. Herkes kendi girişiyle kendi takvimini görür.</div>
                        </div>
                        <div className="qa">
                            <div className="q">Kurulumda yardım ediyor musunuz?</div>
                            <div className="a">Kurulum sihirbazı çoğu işletmeye yetiyor. İşletme planında birebir kurulum desteği var.</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <a className="btn gho" href="/login">Zaten hesabım var</a>
                        <span style={{ fontSize: 13, color: 'var(--dc-muted)' }}>
                            Sorunuz mu var? <a href="mailto:destek@lueratech.com">destek@lueratech.com</a>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
