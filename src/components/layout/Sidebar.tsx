import { useState, type MouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun, Link2, Wallet, Armchair, Users, UtensilsCrossed, LayoutGrid, Calendar, ClipboardList, Package, Archive, User, BarChart3, ListOrdered, Settings } from 'lucide-react';
import { cn } from '@/utils/cn';
import { roleLabel } from '@/pages/settings/ayarlarModel';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useModules } from '@/hooks/useModules';
import { usePendingBills } from '@/hooks/usePendingBills';
import { useLabels } from '@/hooks/useLabels';
import { NAV_ITEMS, NAV_GROUPS } from '@/lib/nav';
import { ToothIcon } from '@/components/dental/ToothIcon';
import { LueraTimeflowMark } from '@/components/brand/LueraTimeflowMark';
import { NotificationDropdown } from './NotificationDropdown';
import {
    LProfile,
    LSettings,
    LChevronLeft,
    LChevronRight,
    LChevronUp,
    LClose,
    LLogout,
} from '@/components/icons/LueraIcons';

interface SidebarProps {
    isCollapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

export const Sidebar = ({ isCollapsed, onCollapsedChange, isMobileOpen = false, onMobileClose }: SidebarProps) => {
    const { user, logout, orgRole } = useAuth();
    const { dark, toggle: toggleTheme } = useTheme();
    const { isEnabled, isLoading: modulesLoading } = useModules();
    const pendingBills = usePendingBills();
    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);
    // Aktifleşen öğede label+ikon "pop" animasyonu için (tasarım: just-activated)
    const [justActivated, setJustActivated] = useState<string | null>(null);

    // Tıklamada material-style ripple (tema-duyarlı renk)
    const createRipple = (e: MouseEvent<HTMLButtonElement>) => {
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.4;
        const ripple = document.createElement('span');
        ripple.className = 'sb-ripple';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        ripple.style.background = dark ? 'rgba(243,237,227,0.12)' : 'rgba(19,18,17,0.08)';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    };

    // Nav öğesi tıklama: ripple + pop tetikle, sonra yönlendir
    const onItemClick = (e: MouseEvent<HTMLButtonElement>, path: string) => {
        createRipple(e);
        setJustActivated(path);
        window.setTimeout(() => setJustActivated((p) => (p === path ? null : p)), 320);
        handleNavClick(path);
    };

    // Restoran kimliği: masa açıkken sistem restorana bürünür — randevu-yüzü
    // öğeleri (Takvim, Rezervasyonlar, Booking) gizlenir, Masalar öne çıkar, Menü
    // görünür. Randevu route'ları ModuleRoute ile arkada erişilebilir kalır.
    const restaurant = !modulesLoading && isEnabled('masa');
    const { t, sector } = useLabels();
    // İkonlar platforma özgü — NAV_ITEMS'daki id ile eşlenir. Tek aile (Lucide,
    // çizgi 1.8): eskiden iki ayrı setten geliyordu, Kasa ve Stoklar ötekilerden
    // kalın duruyordu (2026-10-20). Diş Şeması sektörün kendi ikonu.
    const NAV_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
        '/': LayoutGrid, '/masa': Armchair, '/menu': UtensilsCrossed, '/calendar': Calendar,
        '/reservations': ClipboardList, '/queue': ListOrdered, '/customers': Users, '/kasa': Wallet, '/stock': Archive,
        '/staff': User, '/analytics': BarChart3, '/settings/online-randevu': Link2,
        '/dental-chart': ToothIcon,
        '/packages': Package,
    };
    // module yoksa core (her zaman görünür); varsa modül açıkken görünür.
    // DEFAULT_MODULES, gerçek organizasyon ayarı gelene kadar geçici olarak
    // modülleri açık sayar. Bu değerle çizim yapmak kapalı öğeleri kısa süreli
    // gösterip sonra kaldırıyordu; yükleme sırasında yalnız çekirdek öğeler var.
    const menuItems = NAV_ITEMS
        .filter((m) => (!m.module || (!modulesLoading && isEnabled(m.module))) && !(restaurant && m.hideInRestaurant) && (!m.sectorOnly || (Array.isArray(m.sectorOnly) ? m.sectorOnly.includes(sector) : m.sectorOnly === sector)) && m.hideInSector !== sector)
        .map((m) => ({
            id: m.id,
            // Kuaförde /queue kapıdaki walk-in akışıdır; "Sıra" yerine işi
            // doğrudan anlatan ad kullanılır. Randevu bekleme listesi ise
            // Rezervasyonlar sayfasındaki ayrı sekmede tutulur.
            label: m.id === '/queue' && sector === 'kuafor'
                ? 'Walk-in Sırası'
                : m.labelKey ? t(m.labelKey) : m.label,
            icon: NAV_ICONS[m.id] ?? LayoutGrid,
            group: m.group,
        }));
    // Gruplar: başlık yalnız içinde görünen öğe varsa çizilir
    const navGroups = NAV_GROUPS
        .map((g) => ({ ...g, title: g.labelKey ? t(g.labelKey) : g.label, items: menuItems.filter((m) => m.group === g.key) }))
        .filter((g) => g.items.length > 0);

    const handleNavClick = (path: string) => {
        navigate(path);
        if (window.innerWidth < 768) {
            onMobileClose?.();
        }
    };

    // "Booking Sayfam" Ayarlar'ın bir bölümüne (/settings/online-randevu)
    // kısayol. Oradayken ikisi birden yanmasın: tasarım A6'daki gibi yalnız
    // Ayarlar yanar, ayarlar menüsünde de "Online randevu" seçili görünür.
    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        if (path.startsWith('/settings/')) return false;
        return location.pathname.startsWith(path);
    };

    // Nav öğesi renkleri — Kenar çubuğu A · Gruplu (2026-10-20): etkin satır
    // beyaz kart (ince kenar + hafif gölge), ikonu turuncu; turuncu çizgi yok.
    // Öteki satırlar soluk mürekkep (.62 / .64); üstüne gelince zemin ve renk.
    const navItemClass = (active: boolean) =>
        active
            ? dark
                ? "bg-[#241E16] text-[#F3EDE3] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(243,237,227,0.09)]"
                : "bg-[#FFFDFB] text-[#0E0E0E] font-bold shadow-[0_1px_2px_rgba(14,14,14,0.06),inset_0_0_0_1px_rgba(14,14,14,0.09)]"
            : dark
                ? "text-[rgba(243,237,227,0.64)] font-semibold hover:bg-[rgba(243,237,227,0.05)] hover:text-[#F3EDE3]"
                : "text-[rgba(14,14,14,0.62)] font-semibold hover:bg-[rgba(14,14,14,0.04)] hover:text-[#0E0E0E]";
    const rail = isCollapsed && !isMobileOpen;
    const navRowClass = cn(
        "relative flex items-center gap-3.5 h-[42px] rounded-xl overflow-hidden text-[15.5px] transition-colors duration-[140ms] ease-out",
        rail ? "w-12 mx-auto justify-center px-0" : "w-full px-3.5",
    );
    const groupTitleClass = cn(
        "px-3.5 pb-2 text-[12px] font-bold tracking-[0.09em] uppercase",
        dark ? "text-[rgba(243,237,227,0.36)]" : "text-[rgba(14,14,14,0.38)]",
    );
    const railSepClass = cn("h-px w-6 mx-auto my-2", dark ? "bg-[rgba(243,237,227,0.10)]" : "bg-[rgba(14,14,14,0.09)]");

    // Açılır menü öğesi rengi — light/dark
    const menuItemClass = dark
        ? "text-[#D6CFC4] hover:bg-[rgba(243,237,227,0.05)]"
        : "text-gray-700 hover:bg-gray-50";

    return (
        <>
            {/* Mobile Backdrop */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={onMobileClose}
                />
            )}

            <aside className={cn(
                "fixed top-0 bottom-0 z-50 border-r transition-all duration-300 ease-in-out flex flex-col",
                dark
                    ? "bg-[#141210] border-[rgba(243,237,227,0.07)]"
                    : "bg-[#FAF7F3] border-[#131211]/[0.06]",
                "md:translate-x-0",
                isMobileOpen ? "translate-x-0 w-64 left-0" : "-translate-x-full left-0",
                "md:left-0",
                isCollapsed ? "md:w-[76px]" : "md:w-64"
            )}>
                {/* Logo Section */}
                <div className={cn(
                    "relative h-20 shrink-0 border-b flex items-center justify-between transition-colors duration-300",
                    rail ? "justify-center px-0" : "pl-[26px] pr-5",
                    dark
                        ? "border-[rgba(243,237,227,0.08)]"   // dark: card zemini miras, divider çizgi
                        : "border-[#131211]/10"
                )}>
                    <div className={cn(
                        "flex items-center gap-3 transition-all duration-300",
                        isCollapsed && "md:justify-center"
                    )}>
                        {/* Hap/yazı oranı sabit (kullanıcı kararı, 2026-10-20) — yalnız bütün
                            ölçek 36 → 40 büyüdü. Sol kenar menü ikonlarının sütunuyla
                            aynı hizada (26 px). */}
                        {(!isCollapsed || isMobileOpen) && (
                            <LueraTimeflowMark size={40} pillHeightRatio={0.5556} textRatio={0.62} dark={dark} />
                        )}
                        {rail && (
                            <span
                                className="inline-flex items-end"
                                style={{
                                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                                    fontWeight: 900,
                                    fontSize: 34,
                                    lineHeight: 0.82,
                                    letterSpacing: '-0.05em',
                                    color: dark ? '#F3ECE0' : '#0E0E0E',
                                }}
                            >
                                l<span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] ml-0.5 mb-px" />
                            </span>
                        )}
                    </div>

                    {/* Mobile Close Button */}
                    <button
                        onClick={onMobileClose}
                        className={cn(
                            "md:hidden p-1 rounded-lg",
                            dark
                                ? "hover:bg-[rgba(243,237,227,0.05)] text-[rgba(243,237,227,0.4)]"
                                : "hover:bg-gray-100 text-gray-500"
                        )}
                    >
                        <LClose size={20} />
                    </button>

                    {/* Desktop Collapse Toggle */}
                    <button
                        onClick={() => onCollapsedChange(!isCollapsed)}
                        className={cn(
                            "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full",
                            "border shadow-sm",
                            "hidden md:flex items-center justify-center",
                            "transition-colors",
                            dark
                                ? "bg-[#1B1815] border-[rgba(243,237,227,0.12)] text-[rgba(243,237,227,0.45)] hover:bg-[#211D1A] hover:text-[#D6CFC4]"
                                : "bg-white border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600"
                        )}
                    >
                        {isCollapsed ? <LChevronRight size={14} /> : <LChevronLeft size={14} />}
                    </button>
                </div>

                {/* Navigation — gruplu liste (Günlük · Müşteri · İşletme). Daraltılmış
                    menüde başlıklar yerine ince ayraç. */}
                <nav className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 pb-2 flex flex-col gap-0.5">
                    {navGroups.map((g, gi) => (
                        <div key={g.key} className="flex flex-col gap-0.5">
                            {rail
                                ? gi > 0 && <div className={railSepClass} />
                                : <div className={cn(groupTitleClass, gi === 0 ? "pt-1" : "pt-4")}>{g.title}</div>}
                            {g.items.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.id);
                                const popped = justActivated === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        title={rail ? item.label : undefined}
                                        onClick={(e) => onItemClick(e, item.id)}
                                        className={cn(navRowClass, navItemClass(active))}
                                    >
                                        <Icon size={19} strokeWidth={1.8} className={cn("shrink-0", active && "text-[#FF5A1F]", popped && "sb-pop")} />
                                        {!rail && <span className={cn("truncate", popped && "sb-pop")}>{item.label}</span>}
                                        {/* Kasada bekleyen adisyon rozeti — personel adisyon gönderince artar */}
                                        {item.id === '/kasa' && pendingBills.length > 0 && (
                                            !rail ? (
                                                <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-[#FF5A1F] text-white text-[11px] font-bold">
                                                    {pendingBills.length}
                                                </span>
                                            ) : (
                                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF5A1F]" />
                                            )
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Ayarlar menünün dibinde sabit — listenin ortasında değil.
                    Eskiden altında ~220 px boş alan kalıyordu. */}
                <div className="shrink-0 px-3 pb-2">
                    <button
                        type="button"
                        title={rail ? 'Ayarlar' : undefined}
                        onClick={(e) => onItemClick(e, '/settings')}
                        className={cn(navRowClass, navItemClass(isActive('/settings')))}
                    >
                        <Settings size={19} strokeWidth={1.8} className={cn("shrink-0", isActive('/settings') && "text-[#FF5A1F]", justActivated === '/settings' && "sb-pop")} />
                        {!rail && <span className={cn(justActivated === '/settings' && "sb-pop")}>Ayarlar</span>}
                    </button>
                </div>

                {/* User Profile */}
                <div className={cn(
                    "shrink-0 w-full border-t",
                    rail ? "px-0 pt-3.5 pb-4" : "pl-4 pr-3 pt-3.5 pb-4",
                    dark ? "border-[rgba(243,237,227,0.08)] bg-[#141210]" : "border-[#131211]/10 bg-[#FAF7F3]"
                )}>
                    <div className="relative">
                    {/* Künye satırı: kullanıcı + bildirim zili. Zil eskiden sayfanın
                        tepesindeki 56px'lik barda dururdu; o bar AI şeridiyle birlikte
                        kalkınca (bkz. Layout.tsx) buraya indi. Kazancı: Kasa, Paketler
                        ve Takvim'de de erişilebilir — üst bar o üç sayfada zaten
                        gizliydi, masaüstünde hiç bildirim görünmüyordu. */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => (!isCollapsed || isMobileOpen) && setShowUserMenu(!showUserMenu)}
                            className={cn(
                                "flex-1 min-w-0 flex items-center gap-2.5 p-1.5 -ml-1.5 rounded-xl transition-colors duration-[140ms] ease-out",
                                dark ? "hover:bg-[rgba(243,237,227,0.05)]" : "hover:bg-[rgba(14,14,14,0.04)]",
                                rail ? "w-full justify-center ml-0" : ""
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 shrink-0 rounded-full flex items-center justify-center",
                                dark ? "bg-[#F3EDE3]" : "bg-[#0E0E0E]"
                            )}>
                                <span className={cn("font-extrabold text-[15px]", dark ? "text-[#141210]" : "text-[#F3EDE3]")}>{(user?.name || 'U').charAt(0).toLocaleUpperCase('tr')}</span>
                            </div>
                            {(!isCollapsed || isMobileOpen) && (
                                <>
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className={cn("text-[15.5px] font-bold leading-tight truncate", dark ? "text-[#F3EDE3]" : "text-[#0E0E0E]")}>
                                            {user?.name || 'Kullanıcı'}
                                        </p>
                                        <p className={cn("text-[13.5px] font-medium flex items-center gap-1.5", dark ? "text-[rgba(243,237,227,0.64)]" : "text-[rgba(14,14,14,0.62)]")}>
                                            <span className="w-[7px] h-[7px] rounded-full bg-[#2D8F32]"></span>
                                            {/* Gerçek rol (organization_members) — eskiden herkese sabit "Admin" yazıyordu. */}
                                            {roleLabel(orgRole) ?? ''}
                                        </p>
                                    </div>
                                    <LChevronUp className={cn(
                                        "w-4 h-4 shrink-0 transition-transform",
                                        dark ? "text-[rgba(243,237,227,0.64)]" : "text-[rgba(14,14,14,0.62)]",
                                        !showUserMenu && "rotate-180"
                                    )} />
                                </>
                            )}
                        </button>

                        {/* Bildirim zili — mobilde üst başlıkta olduğu için burada
                            gizli. Sidebar daralınca da gizlenir: 80px'lik şeritte
                            avatarın altına sarkıp ayrı bir sıra açıyordu. Künye dipte
                            durduğundan panel yukarı ve sağa açılır. */}
                        {!isCollapsed && (
                            <div className="hidden md:block shrink-0">
                                <NotificationDropdown placement="top-left" compact />
                            </div>
                        )}
                    </div>

                    {/* Dropdown Menu */}
                    {showUserMenu && (!isCollapsed || isMobileOpen) && (
                        <div className={cn(
                            "absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-lg border overflow-hidden",
                            dark ? "bg-[#1B1815] border-[rgba(243,237,227,0.08)]" : "bg-white border-gray-100"
                        )}>
                            <button
                                onClick={() => { handleNavClick('/settings/hesabim'); setShowUserMenu(false); }}
                                className={cn("w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors", menuItemClass)}
                            >
                                <LProfile className="w-4 h-4" />
                                Profil
                            </button>
                            {/* Karanlık mod — sadece dashboard'a uygulanır */}
                            <button
                                onClick={() => toggleTheme()}
                                className={cn("w-full flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors", menuItemClass)}
                            >
                                <span className="flex items-center gap-3">
                                    {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                    {dark ? 'Açık Mod' : 'Karanlık Mod'}
                                </span>
                                {/* mini switch */}
                                <span className={cn(
                                    "relative inline-flex h-[18px] w-[32px] items-center rounded-full transition-colors flex-shrink-0",
                                    dark ? "bg-[#FF5A1F]" : "bg-gray-300"
                                )}>
                                    <span className={cn(
                                        "inline-block h-[14px] w-[14px] rounded-full bg-white transition-transform",
                                        dark ? "translate-x-[16px]" : "translate-x-[2px]"
                                    )} />
                                </span>
                            </button>
                            <button
                                onClick={() => { handleNavClick('/settings'); setShowUserMenu(false); }}
                                className={cn("w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors", menuItemClass)}
                            >
                                <LSettings className="w-4 h-4" />
                                Ayarlar
                            </button>
                            <button
                                onClick={() => { navigate('/personel'); setShowUserMenu(false); }}
                                className={cn("w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors", menuItemClass)}
                            >
                                <LProfile className="w-4 h-4" />
                                Personel Modu
                            </button>
                            <div className={cn("border-t", dark ? "border-[rgba(243,237,227,0.08)]" : "border-gray-100")} />
                            <button
                                onClick={async () => {
                                    await logout();
                                    setShowUserMenu(false);
                                    navigate('/login');
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                                    dark ? "text-red-400 hover:bg-red-500/10" : "text-red-600 hover:bg-red-50"
                                )}
                            >
                                <LLogout className="w-4 h-4" />
                                Çıkış Yap
                            </button>
                        </div>
                    )}
                    </div>
                </div>
            </aside>
        </>
    );
};
