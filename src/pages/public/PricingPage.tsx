import { useNavigate } from 'react-router-dom';
import { Check, LogIn } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { PlanCards } from '@/components/billing/PlanCards';
import { TRIAL_DAYS, type Cycle, type PlanId } from '@/lib/plans';
import '@/pages/paywall.css';

// Herkese açık fiyat sayfası — /fiyatlar
//
// Bu sayfanın işi ikna etmek. Kullanıcı çoğu zaman WhatsApp'tan gelen bir
// linkle, telefonundan ve ürünü hiç görmeden geliyor.
//
// Plan seçimi doğrudan ödeme başlatmaz: önce hesap gerekiyor. Seçim
// /login'e taşınır, kayıt biter bitmez ödeme kendiliğinden açılır — kullanıcı
// aynı planı iki kez seçmek zorunda kalmaz.

export function PricingPage() {
    const { dark } = useTheme();
    const navigate = useNavigate();

    const onSelect = (plan: PlanId, cycle: Cycle) => {
        navigate(`/login?mode=signup&plan=${plan}&cycle=${cycle}`);
    };

    return (
        <div className={cn('pw-page dash-theme', dark && 'dark')}>
            <div className="pw-shell">
                <div className="pw-head">
                    <span className="pw-logo">luera<i /></span>
                    <a className="pw-login" href="/login"><LogIn size={16} />Giriş yap</a>
                </div>

                <div className="pw-hero">
                    <h1>İşletmenizi {TRIAL_DAYS} gün ücretsiz deneyin</h1>
                    <p>
                        Randevu, müşteri kaydı, WhatsApp hatırlatma ve kasa — hepsi tek yerde.
                        Kurulum 6 dakika sürüyor, hizmet listeniz hazır geliyor.
                    </p>
                </div>

                <PlanCards onSelect={onSelect} ctaLabel={() => 'Ücretsiz başla'} />

                <div className="pw-trust">
                    <span><Check size={15} />İstediğiniz an iptal</span>
                    <span><Check size={15} />Verileriniz size ait, dışa aktarılabilir</span>
                    <span><Check size={15} />KVKK'ya uygun, Türkiye'de barındırma</span>
                    <span><Check size={15} />Kurulum ücreti yok</span>
                </div>

                <div className="pw-faq">
                    <h2>Sık sorulanlar</h2>
                    <details>
                        <summary>Deneme için neden kart bilgisi isteniyor?</summary>
                        <p>
                            Deneme bittiğinde hizmetiniz kesintiye uğramasın diye. {TRIAL_DAYS} gün
                            boyunca hiçbir ücret alınmaz; deneme bitmeden iptal ederseniz kartınızdan
                            tek kuruş çekilmez.
                        </p>
                    </details>
                    <details>
                        <summary>İptal edersem verilerim ne olur?</summary>
                        <p>
                            Müşterileriniz, randevularınız ve kayıtlarınız silinmez. Abonelik
                            bittiğinde yeni kayıt oluşturamazsınız ama geçmiş verilerinize
                            erişiminiz sürer ve talep ederseniz dışa aktarırız.
                        </p>
                    </details>
                    <details>
                        <summary>Planımı sonradan değiştirebilir miyim?</summary>
                        <p>
                            Evet. Yükseltme anında geçerli olur. Şu an plan değişikliği için bizimle
                            iletişime geçmeniz gerekiyor; kendi kendine değiştirme yakında.
                        </p>
                    </details>
                    <details>
                        <summary>Kaç personel ekleyebilirim?</summary>
                        <p>
                            Başlangıç planında 3 kişiye kadar, Pro ve İşletme planlarında sınırsız.
                            Tek kişilik çalışıyorsanız Başlangıç fazlasıyla yeter.
                        </p>
                    </details>
                    <details>
                        <summary>Fatura alabilir miyim?</summary>
                        <p>
                            Evet, her ödeme için fatura düzenlenir ve Ayarlar → Faturalandırma
                            bölümünden indirebilirsiniz.
                        </p>
                    </details>
                </div>

                <div className="pw-foot">
                    Aklınıza takılan bir şey mi var? <a href="mailto:destek@lueratech.com">destek@lueratech.com</a>
                </div>
            </div>
        </div>
    );
}
