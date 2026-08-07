import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { ArrowRight, Settings, X } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useStaff } from '@/hooks/useStaff';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { profileForSector } from '@/lib/sectorProfiles';
import { SETUP_STEPS, remainingMinutes, setupProgress } from '@/lib/setupProgress';
import '@/pages/setupWizard.css';

// Kurulum yarıda kaldıysa uygulamanın üstünde duran şerit.
//
// Bunun olmaması bugünkü en somut boşluktu: /kurulum sayfası VARDI ama hiçbir
// yerden ulaşılmıyordu (grep sıfır referans buldu). Yeni bir org bomboş
// uygulamaya düşüyor ve kurulumun varlığından haberi olmuyordu.
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
    const { settings } = useReservations();
    const { resources } = useResources();
    const { staff } = useStaff();
    const { connection } = useWhatsApp();
    const { profile: org } = useOrgProfile();
    // İlk render'da okunur: efektle okumak şeridi bir kare için gösterip
    // gizliyor, kullanıcı her sayfa geçişinde bir titreme görüyordu.
    const [hidden, setHidden] = useState(() => localStorage.getItem(HIDE_KEY) === todayKey());

    if (!orgId || hidden || pathname.startsWith('/kurulum')) return null;

    const sector = settings.sector || '';
    const progress = setupProgress({
        sector,
        businessName: settings.businessName,
        address: org.address,
        phone: org.publicPhone,
        openDays: (settings.workingHours ?? []).filter((h) => !h.isOff).length,
        serviceCount: settings.services?.length ?? 0,
        resourceCount: resources.length,
        resourcesApply: profileForSector(sector || 'genel').resourceTypes.length > 0,
        staffCount: staff.filter((s) => s.isActive).length,
        // "Yalnız ben çalışıyorum" ayrı bir bayrak olarak SAKLANMIYOR; tek
        // kişilik işletmede org sahibi zaten personel listesinde değil. Bu
        // yüzden ekip adımı, kurulum bir kez bitirildiyse tamam sayılır.
        soloDeclared: Boolean(settings.sector) && staff.length === 0 && (settings.services?.length ?? 0) > 0,
        whatsappConnected: connection.status === 'connected',
    });

    if (progress.complete) return null;
    // Hiç başlanmamışsa da gösterilir — asıl derdimiz o.
    const nextLabel = SETUP_STEPS.find((s) => s.key === progress.next)?.label ?? '';
    const mins = remainingMinutes(progress.pending);

    return (
        <div className={cn('dash-theme', dark && 'dark')} style={{ padding: '12px 16px 0' }}>
            <div className="sw-resume">
                <Settings size={20} />
                <div className="tx">
                    <b>Kurulumun %{progress.percent}'ı tamamlandı</b>
                    <span>
                        Sırada: {nextLabel} · {progress.pending.length} adım kaldı
                        {mins > 0 ? `, yaklaşık ${mins} dakika` : ''}
                    </span>
                </div>
                <span className="bar"><i style={{ width: `${progress.percent}%` }} /></span>
                <button className="sw-btn" onClick={() => navigate('/kurulum')}>
                    Devam et<ArrowRight size={18} />
                </button>
                <button className="x" aria-label="Şimdilik gizle"
                    onClick={() => { localStorage.setItem(HIDE_KEY, todayKey()); setHidden(true); }}>
                    <X size={18} />
                </button>
            </div>
        </div>
    );
}
