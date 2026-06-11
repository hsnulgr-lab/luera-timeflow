import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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
    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);

    const menuItems = [
        { id: '/', label: 'Dashboard', icon: LDashboard },
        { id: '/calendar', label: 'Takvim', icon: LCalendar },
        { id: '/reservations', label: 'Rezervasyonlar', icon: LClipboard },
        { id: '/customers', label: 'Müşteriler', icon: LUsers },
        { id: '/staff', label: 'Personel', icon: LProfile },
        { id: '/analytics', label: 'Analiz', icon: LChart },
    ];

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
                "fixed top-0 bottom-0 bg-[#FAF7F3] border-r border-[#131211]/[0.06] z-50 transition-all duration-300 ease-in-out",
                "md:translate-x-0",
                isMobileOpen ? "translate-x-0 w-64 left-0" : "-translate-x-full left-0",
                "md:left-0",
                isCollapsed ? "md:w-20" : "md:w-64"
            )}>
                {/* Logo Section */}
                <div className="relative p-6 border-b border-[#131211]/10 flex items-center justify-between">
                    <div className={cn(
                        "flex items-center gap-3 transition-all duration-300",
                        isCollapsed && "md:justify-center"
                    )}>
                        {(!isCollapsed || isMobileOpen) && (
                            <LueraTimeflowMark size={40} pillHeightRatio={0.5} textRatio={0.64} />
                        )}
                        {isCollapsed && !isMobileOpen && (
                            <span
                                style={{
                                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                                    fontWeight: 900,
                                    fontSize: 34,
                                    letterSpacing: '-0.045em',
                                    color: '#0E0E0E',
                                }}
                            >
                                l
                            </span>
                        )}
                    </div>

                    {/* Mobile Close Button */}
                    <button
                        onClick={onMobileClose}
                        className="md:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                        <LClose size={20} />
                    </button>

                    {/* Desktop Collapse Toggle */}
                    <button
                        onClick={() => onCollapsedChange(!isCollapsed)}
                        className={cn(
                            "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full",
                            "bg-white border border-gray-200 shadow-sm",
                            "hidden md:flex items-center justify-center",
                            "hover:bg-gray-50 transition-colors",
                            "text-gray-400 hover:text-gray-600"
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
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleNavClick(item.id)}
                                className={cn(
                                    "relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                    isCollapsed && !isMobileOpen ? "justify-center px-3" : "",
                                    active
                                        ? "bg-[#EDEAE5] text-[#131211] font-bold"
                                        : "text-[#8A8580] font-semibold hover:bg-[#131211]/[0.045] hover:text-[#3B3835]"
                                )}
                            >
                                {active && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[52%] bg-[#FF5A1F] rounded-r-[3px]" />
                                )}
                                <Icon size={20} />
                                {(!isCollapsed || isMobileOpen) && <span>{item.label}</span>}
                            </button>
                        );
                    })}

                    {/* Divider */}
                    <div className="pt-4 mt-4 border-t border-[#131211]/10">
                        <button
                            type="button"
                            onClick={() => handleNavClick('/settings')}
                            className={cn(
                                "relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                isCollapsed && !isMobileOpen ? "justify-center px-3" : "",
                                isActive('/settings')
                                    ? "bg-[#EDEAE5] text-[#131211] font-bold"
                                    : "text-[#8A8580] font-semibold hover:bg-[#131211]/[0.045] hover:text-[#3B3835]"
                            )}
                        >
                            {isActive('/settings') && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[52%] bg-[#FF5A1F] rounded-r-[3px]" />
                            )}
                            <LSettings size={20} />
                            {(!isCollapsed || isMobileOpen) && <span>Ayarlar</span>}
                        </button>
                    </div>
                </nav>

                {/* User Profile */}
                <div className="absolute bottom-0 w-full p-4 border-t border-[#131211]/10 bg-[#FAF7F3]">
                    <div className="relative">
                        <button
                            onClick={() => (!isCollapsed || isMobileOpen) && setShowUserMenu(!showUserMenu)}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 transition-colors",
                                isCollapsed && !isMobileOpen ? "justify-center" : ""
                            )}
                        >
                            <div className="w-10 h-10 rounded-full bg-[#0E0E0E] flex items-center justify-center shadow-md">
                                <span className="font-bold text-[#F0EBE1] text-sm">{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                            {(!isCollapsed || isMobileOpen) && (
                                <>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-gray-900">
                                            {user?.name || 'Kullanıcı'}
                                        </p>
                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            {user?.role || 'User'}
                                        </p>
                                    </div>
                                    <LChevronUp className={cn(
                                        "w-4 h-4 text-gray-400 transition-transform",
                                        !showUserMenu && "rotate-180"
                                    )} />
                                </>
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        {showUserMenu && (!isCollapsed || isMobileOpen) && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                                <button
                                    onClick={() => { handleNavClick('/settings'); setShowUserMenu(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <LProfile className="w-4 h-4" />
                                    Profil
                                </button>
                                {/* Karanlık mod — sadece dashboard'a uygulanır */}
                                <button
                                    onClick={() => toggleTheme()}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <LSettings className="w-4 h-4" />
                                    Ayarlar
                                </button>
                                <div className="border-t border-gray-100" />
                                <button
                                    onClick={async () => {
                                        await logout();
                                        setShowUserMenu(false);
                                        navigate('/login');
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
