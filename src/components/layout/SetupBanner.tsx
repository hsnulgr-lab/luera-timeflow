import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useReservations } from '@/hooks/useReservations';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useAuth } from '@/contexts/AuthContext';
import { SETUP_SCREENS, isSavedServiceId, screenProgress } from '@/lib/setupProgress';
import { KurulumIkon, KurulumIkonlar } from '@/pages/kurulumIkonlar';
import '@/pages/setupWizard.css';

// Kurulum yarıda kaldıysa sağ altta yüzen balon (Kurulum v2 · Ş1). Önce
// sayfanın tepesinde tam genişlik bir şeritti; her sayfada yer açıp düzeni
// bozuyordu (kullanıcı, 2026-10-29). Balon sayfanın akışına girmez.
//
// Bunun olmaması bir zamanlar en somut boşluktu: /kurulum sayfası VARDI ama
// hiçbir yerden ulaşılmıyordu. Yeni bir org bomboş uygulamaya düşüyor ve
// kurulumun varlığından haberi olmuyordu.
//
// Tek sayaç: balondaki üç parça, sihirbazın göstergesi ve bitiş aynı hesaptan
// (`screenProgress`) okur. "Devam et" kaldığı EKRANI açar, baştan başlatmaz.
//
// Kapatılabilir ama KALICI DEĞİL: gizleme bir güne yazılır, ertesi gün geri
// gelir. Kurulumsuz bir işletme hatırlatma gönderemiyor, online randevu
// alamıyor — sessizce unutulmasına izin vermek kullanıcıya iyilik olmaz.

const HIDE_KEY = 'tf_setup_banner_hidden';
const todayKey = () => new Date().toISOString().slice(0, 10);

export function SetupBanner() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { dark } = useTheme();
    const { orgId } = useAuth();
    const { settings, isSettingsLoading } = useReservations();
    const { connection, loading: waLoading } = useWhatsApp();
    // İlk render'da okunur: efektle okumak balonu bir kare için gösterip
    // gizliyor, kullanıcı her sayfa geçişinde bir titreme görüyordu.
    const [hidden, setHidden] = useState(() => localStorage.getItem(HIDE_KEY) === todayKey());

    // Veri gelmeden hesaplanan sayaç "1 / 3" deyip bir an sonra kaybolurdu.
    if (!orgId || hidden || pathname.startsWith('/kurulum') || isSettingsLoading || waLoading) return null;

    const progress = screenProgress({
        sector: settings.sector,
        businessName: settings.businessName,
        openDays: (settings.workingHours ?? []).filter((h) => !h.isOff).length,
        serviceCount: (settings.services ?? []).filter((s) => isSavedServiceId(s.id)).length,
        whatsappConnected: connection.status === 'connected',
        // Ekran sayacı bunları okumaz (bkz. isScreenDone).
        resourceCount: 0, resourcesApply: false, staffCount: 0, soloDeclared: false,
    });

    if (progress.complete || !progress.next) return null;
    const at = SETUP_SCREENS.findIndex((s) => s.key === progress.next);

    return (
        <div className="kv-t kv-strip-w" data-theme={dark ? 'dark' : 'light'}>
            <KurulumIkonlar />
            <div className="kv-strip" role="status">
                <div className="mp" aria-hidden="true">
                    {SETUP_SCREENS.map((s) => <i key={s.key} className={progress.done.includes(s.key) ? 'on' : undefined} />)}
                </div>
                <div className="t">
                    <b>Kurulum {at + 1} / {SETUP_SCREENS.length}</b>
                    <span>Sırada: {SETUP_SCREENS[at].label}</span>
                </div>
                <button type="button" className="btn sm" onClick={() => navigate(`/kurulum?adim=${progress.next}`)}>
                    Devam et<KurulumIkon n="arr" />
                </button>
                <button type="button" className="ix" aria-label="Bugün için gizle"
                    onClick={() => { localStorage.setItem(HIDE_KEY, todayKey()); setHidden(true); }}>
                    <KurulumIkon n="x" />
                </button>
            </div>
        </div>
    );
}
