import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { SetupBanner } from './SetupBanner';
import { Menu, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTheme } from '@/contexts/ThemeContext';
import { usePendingBillsAlert } from '@/hooks/usePendingBills';
import { useWhatsApp } from '@/hooks/useWhatsApp';

export const Layout = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [calendarCollapsed, setCalendarCollapsed] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const { dark } = useTheme();
    // Kasa yoğun, geniş bir ekran: sidebar otomatik daralır. Kullanıcının manuel
    // tercihi (isCollapsed) bozulmaz — Kasa'dan çıkınca geri gelir. Paketler de
    // kendi tam-ekran tasarımına sahip, orada da sidebar daralır.
    const path = useLocation().pathname;
    const navigate = useNavigate();
    // Bağlanmış ama şu an düşmüş WhatsApp — sessiz arıza olmasın.
    const { isBroken: waBroken } = useWhatsApp();
    const onKasa = path.startsWith('/kasa');
    const onPackages = path.startsWith('/packages');
    // Takvim bütün sektörlerde bir odak çalışma alanıdır; dar sidebar programa
    // daha fazla alan verir.
    const onCalendar = path === '/calendar';
    const collapsed = onKasa || onPackages || (onCalendar ? calendarCollapsed : isCollapsed);
    // Personel adisyonu kasaya gönderince masaüstünde toast (köprü: personel → masaüstü)
    usePendingBillsAlert();

    return (
        <div className={cn("min-h-screen", dark ? "bg-[#0C0A08]" : "bg-[#F3ECE0]")}>
            <Sidebar
                isCollapsed={collapsed}
                onCollapsedChange={onCalendar ? setCalendarCollapsed : setIsCollapsed}
                isMobileOpen={isMobileOpen}
                onMobileClose={() => setIsMobileOpen(false)}
            />

            {/* Mobile Header */}
            <div className={cn(
                "md:hidden fixed top-0 left-0 right-0 h-14 backdrop-blur-xl border-b z-30 flex items-center justify-between px-4",
                dark
                    ? "bg-[#141210]/90 border-[rgba(243,237,227,0.07)]"
                    : "bg-white/80 border-gray-100"
            )}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsMobileOpen(true)}
                        className={cn("p-2 rounded-lg", dark ? "text-[rgba(243,237,227,0.6)] hover:bg-[rgba(243,237,227,0.05)]" : "text-gray-600 hover:bg-gray-100")}
                    >
                        <Menu size={20} />
                    </button>
                    <div className="flex items-baseline gap-1.5">
                        <h1 className={cn("text-lg font-bold", dark ? "text-[#F3EDE3]" : "text-gray-900")}>LUERA</h1>
                        <span className={cn("text-[10px] tracking-wide", dark ? "text-[rgba(240,235,225,0.4)]" : "text-gray-400")}>TimeFlow</span>
                    </div>
                </div>
                <NotificationDropdown />
            </div>

            {/* Masaüstü üst barı 2026-08-07'de kaldırıldı. Tek içeriği AI içgörü
                şeridiydi; o rafa kalkınca geriye 56px'lik boş bir bant ve bir zil
                kaldı. Zil sidebar'ın künyesine taşındı — böylece Kasa, Paketler ve
                Takvim'de de görünüyor (üst bar orada zaten gizliydi, bu üç sayfada
                masaüstünde hiç bildirim erişimi yoktu). Mobil başlık kendi zilini
                taşımaya devam ediyor. */}

            {/* Main Content — masaüstünde üst bar yok, içerik en tepeden başlar */}
            <main className={cn(
                "transition-all duration-300 pt-14 md:pt-0 h-screen flex flex-col",
                collapsed ? "md:ml-20" : "md:ml-64"
            )}>
                {/* WhatsApp bağlantısı düştüğünde hatırlatmalar sessizce durur;
                    kullanıcı haftalarca fark etmeyebiliyordu. */}
                {waBroken && !path.startsWith('/settings') && (
                    <button
                        onClick={() => navigate('/settings?tab=whatsapp')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold border-b w-full text-left",
                            dark
                                ? "bg-[#2a1414] text-[#e07070] border-[#3a1c1c] hover:bg-[#331818]"
                                : "bg-[#FDF0F0] text-[#C0392B] border-[#F3D6D6] hover:bg-[#FBE6E6]"
                        )}
                    >
                        <AlertTriangle size={14} className="shrink-0" />
                        WhatsApp bağlantısı düştü — hatırlatmalar gönderilmiyor.
                        <span className="underline underline-offset-2">Yeniden bağlan</span>
                    </button>
                )}
                {/* Kurulum yarıda kaldıysa: /kurulum sayfası VARDI ama hiçbir
                    yerden ulaşılmıyordu. Yeni org bomboş uygulamaya düşüyordu. */}
                <SetupBanner />
                <ErrorBoundary>
                    <Outlet />
                </ErrorBoundary>
            </main>
        </div>
    );
};
