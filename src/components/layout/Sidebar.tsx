import { useState, type MouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun, Link2, Wallet, Armchair, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useModules } from '@/hooks/useModules';
import type { ModuleKey } from '@/types';
import { LueraTimeflowMark } from '@/components/brand/LueraTimeflowMark';
import {
    LDashboard,
    LCalendar,
    LClipboard,
    LUsers,
    LProfile,
    LChart,
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
    const { user, logout } = useAuth();
    const { dark, toggle: toggleTheme } = useTheme();
    const { isEnabled } = useModules();
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

    // module yoksa core (her zaman görünür); varsa modül açıkken görünür
    const allMenuItems: { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; module?: ModuleKey }[] = [
        { id: '/', label: 'Dashboard', icon: LDashboard },
        { id: '/calendar', label: 'Takvim', icon: LCalendar, module: 'randevu' },
        { id: '/reservations', label: 'Rezervasyonlar', icon: LClipboard, module: 'randevu' },
        { id: '/masa', label: 'Masalar', icon: Armchair, module: 'masa' },
        { id: '/queue', label: 'Sıra', icon: Users, module: 'sira' },
        { id: '/customers', label: 'Müşteriler', icon: LUsers },
        { id: '/kasa', label: 'Kasa', icon: Wallet, module: 'kasa' },
        { id: '/staff', label: 'Personel', icon: LProfile, module: 'personel' },
        { id: '/analytics', label: 'Analiz', icon: LChart, module: 'analiz' },
        { id: '/settings?tab=booking', label: 'Booking Sayfam', icon: Link2, module: 'randevu' },
    ];
    const menuItems = allMenuItems.filter((m) => !m.module || isEnabled(m.module));

    const handleNavClick = (path: string) => {
        navigate(path);
        if (window.innerWidth < 768) {
            onMobileClose?.();
        }
    };

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    // Nav öğesi renkleri — light/dark (tasarım: Luera Sidebar Dark.html)
    const navItemClass = (active: boolean) =>
        active
            ? dark
                ? "bg-[rgba(243,237,227,0.07)] text-[#F3EDE3] font-bold"
                : "bg-[#EDEAE5] text-[#131211] font-bold"
            : dark
                ? "text-[rgba(243,237,227,0.4)] font-semibold hover:bg-[rgba(243,237,227,0.05)] hover:text-[rgba(243,237,227,0.75)]"
                : "text-[#8A8580] font-semibold hover:bg-[#131211]/[0.045] hover:text-[#3B3835]";

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
                "fixed top-0 bottom-0 z-50 border-r transition-all duration-300 ease-in-out",
                dark
                    ? "bg-[#141210] border-[rgba(243,237,227,0.07)]"
                    : "bg-[#FAF7F3] border-[#131211]/[0.06]",
                "md:translate-x-0",
                isMobileOpen ? "translate-x-0 w-64 left-0" : "-translate-x-full left-0",
                "md:left-0",
                isCollapsed ? "md:w-20" : "md:w-64"
            )}>
                {/* Logo Section */}
                <div className={cn(
                    "relative p-6 border-b flex items-center justify-between transition-colors duration-300",
                    dark
                        ? "border-[rgba(243,237,227,0.08)]"   // dark: card zemini miras, divider çizgi
                        : "border-[#131211]/10"
                )}>
                    <div className={cn(
                        "flex items-center gap-3 transition-all duration-300",
                        isCollapsed && "md:justify-center"
                    )}>
                        {(!isCollapsed || isMobileOpen) && (
                            <LueraTimeflowMark size={40} pillHeightRatio={0.5} textRatio={0.64} dark={dark} />
                        )}
                        {isCollapsed && !isMobileOpen && (
                            <span
                                style={{
                                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                                    fontWeight: 900,
                                    fontSize: 34,
                                    letterSpacing: '-0.045em',
                                    color: dark ? '#F3ECE0' : '#0E0E0E',
                                }}
                            >
                                l
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

                {/* Navigation */}
                <nav className="p-3 space-y-1">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.id);
                        const popped = justActivated === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={(e) => onItemClick(e, item.id)}
                                className={cn(
                                    "relative w-full flex items-center gap-3 px-4 py-3 rounded-xl overflow-hidden transition-all duration-200 active:scale-[0.975]",
                                    isCollapsed && !isMobileOpen ? "justify-center px-3" : "",
                                    navItemClass(active)
                                )}
                            >
                                {active && (
                                    <div className="sb-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[52%] bg-[#FF5A1F] rounded-r-[3px]" />
                                )}
                                <Icon size={20} className={cn(popped && "sb-pop")} />
                                {(!isCollapsed || isMobileOpen) && <span className={cn(popped && "sb-pop")}>{item.label}</span>}
                            </button>
                        );
                    })}

                    {/* Divider */}
                    <div className={cn("pt-4 mt-4 border-t", dark ? "border-[rgba(243,237,227,0.08)]" : "border-[#131211]/10")}>
                        <button
                            type="button"
                            onClick={(e) => onItemClick(e, '/settings')}
                            className={cn(
                                "relative w-full flex items-center gap-3 px-4 py-3 rounded-xl overflow-hidden transition-all duration-200 active:scale-[0.975]",
                                isCollapsed && !isMobileOpen ? "justify-center px-3" : "",
                                navItemClass(isActive('/settings'))
                            )}
                        >
                            {isActive('/settings') && (
                                <div className="sb-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[52%] bg-[#FF5A1F] rounded-r-[3px]" />
                            )}
                            <LSettings size={20} className={cn(justActivated === '/settings' && "sb-pop")} />
                            {(!isCollapsed || isMobileOpen) && <span className={cn(justActivated === '/settings' && "sb-pop")}>Ayarlar</span>}
                        </button>
                    </div>
                </nav>

                {/* User Profile */}
                <div className={cn(
                    "absolute bottom-0 w-full p-4 border-t",
                    dark ? "border-[rgba(243,237,227,0.08)] bg-[#141210]" : "border-[#131211]/10 bg-[#FAF7F3]"
                )}>
                    <div className="relative">
                        <button
                            onClick={() => (!isCollapsed || isMobileOpen) && setShowUserMenu(!showUserMenu)}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-xl transition-colors",
                                dark ? "hover:bg-[rgba(243,237,227,0.05)]" : "hover:bg-gray-100",
                                isCollapsed && !isMobileOpen ? "justify-center" : ""
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shadow-md",
                                dark ? "bg-[#F3EDE3]" : "bg-[#0E0E0E]"
                            )}>
                                <span className={cn("font-bold text-sm", dark ? "text-[#141210]" : "text-[#F3EDE3]")}>{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                            {(!isCollapsed || isMobileOpen) && (
                                <>
                                    <div className="flex-1 text-left">
                                        <p className={cn("text-sm font-semibold", dark ? "text-[#F3EDE3]" : "text-gray-900")}>
                                            {user?.name || 'Kullanıcı'}
                                        </p>
                                        <p className={cn("text-xs flex items-center gap-1", dark ? "text-[rgba(243,237,227,0.4)]" : "text-gray-500")}>
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            {user?.role || 'User'}
                                        </p>
                                    </div>
                                    <LChevronUp className={cn(
                                        "w-4 h-4 transition-transform",
                                        dark ? "text-[rgba(243,237,227,0.4)]" : "text-gray-400",
                                        !showUserMenu && "rotate-180"
                                    )} />
                                </>
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        {showUserMenu && (!isCollapsed || isMobileOpen) && (
                            <div className={cn(
                                "absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-lg border overflow-hidden",
                                dark ? "bg-[#1B1815] border-[rgba(243,237,227,0.08)]" : "bg-white border-gray-100"
                            )}>
                                <button
                                    onClick={() => { handleNavClick('/settings'); setShowUserMenu(false); }}
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
