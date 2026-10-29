import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { SetupBanner } from './SetupBanner';
import { SubscriptionBanner } from './SubscriptionBanner';
import { Menu, AlertTriangle, ChevronRight } from 'lucide-react';
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
    // Stoklar Paketler'le aynı üç sütunlu düzen (görünümler · liste · detay);
    // açık menüyle tablo ~180 px daralıp hücreler iki satıra kırılıyordu (2026-10-21).
    const onStock = path.startsWith('/stock');
    // Takvim bütün sektörlerde bir odak çalışma alanıdır; dar sidebar programa
    // daha fazla alan verir.
    const onCalendar = path === '/calendar';
    const collapsed = onKasa || onPackages || onStock || (onCalendar ? calendarCollapsed : isCollapsed);
    // Personel adisyonu kasaya gönderince masaüstünde toast (köprü: personel → masaüstü)
    usePendingBillsAlert();

    // Kurulum sihirbazı tam ekran odak sayfası (Kurulum v2): sol menü, üst
    // şeritler ve WhatsApp satırı yok. Dolu bir menü "önce şunu mu yapsam"
    // diye dallandırıp kurulumu yarıda bıraktırıyordu; çıkış sihirbazın sağ
    // üstünde ("Sonra tamamlarım") her an açık.
    if (path.startsWith('/kurulum')) {
        return (
            <ErrorBoundary>
                <Outlet />
            </ErrorBoundary>
        );
    }

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
                "transition-all duration-300 pt-14 md:pt-0 h-screen flex flex-col overflow-y-auto",
                collapsed ? "md:ml-[76px]" : "md:ml-64"
            )}>
                {/* WhatsApp bağlantısı düştüğünde hatırlatmalar sessizce durur;
                    kullanıcı haftalarca fark etmeyebiliyordu. Panel rötuşu: tam
                    genişlik pembe şerit yerine içerik sütununun başında 44 px'lik
                    satır — arıza açıkça görünür ama bağırmaz. Metin aynı. */}
                {waBroken && !path.startsWith('/settings') && (
                    <div
                        role="alert"
                        className={cn(
                            "wa-alert shrink-0 mx-4 md:mx-6 mt-4 min-h-11 flex items-center gap-3 pl-3.5 pr-1.5 rounded-xl border",
                            dark
                                ? "bg-[#241E16] border-[rgba(224,112,112,0.38)] text-[#F3EDE3]"
                                : "bg-[#FFFDFB] border-[rgba(201,64,64,0.28)] text-[#0E0E0E]"
                        )}
                    >
                        <AlertTriangle size={18} className={cn("shrink-0", dark ? "text-[#E07070]" : "text-[#C94040]")} />
                        <span className="flex-1 min-w-0 py-2.5 text-[14.5px] font-semibold leading-snug">
                            WhatsApp bağlantısı düştü — hatırlatmalar gönderilmiyor.
                        </span>
                        <button
                            type="button"
                            onClick={() => navigate('/settings/whatsapp')}
                            className={cn(
                                "shrink-0 h-[34px] pl-3 pr-2.5 rounded-lg flex items-center gap-1 text-[14px] font-bold transition-colors duration-[140ms] ease-out",
                                dark ? "text-[#E07070] hover:bg-[rgba(224,112,112,0.14)]" : "text-[#C94040] hover:bg-[rgba(201,64,64,0.10)]"
                            )}
                        >
                            Yeniden bağlan<ChevronRight size={15} />
                        </button>
                    </div>
                )}
                {/* Deneme bitiyor / ödeme alınamadı: sayfanın tepesinde, akışın
                    içinde — parası kesilmek üzere olan işletme bunu kaçırmamalı. */}
                <SubscriptionBanner />
                {/* Kurulum yarıda kaldıysa: /kurulum sayfası VARDI ama hiçbir
                    yerden ulaşılmıyordu. Sağ altta yüzen balon; yer kaplamaz. */}
                <SetupBanner />
                <ErrorBoundary>
                    <Outlet />
                </ErrorBoundary>
            </main>
        </div>
    );
};
