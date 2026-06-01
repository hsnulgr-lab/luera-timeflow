import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Calendar, ClipboardList, Users, Settings, ChevronLeft, ChevronRight, LogOut, User, ChevronUp, X, BarChart3, UserCog } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
    isCollapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

export const Sidebar = ({ isCollapsed, onCollapsedChange, isMobileOpen = false, onMobileClose }: SidebarProps) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);

    const menuItems = [
        { id: '/', label: 'Dashboard', icon: Home },
        { id: '/calendar', label: 'Takvim', icon: Calendar },
        { id: '/reservations', label: 'Rezervasyonlar', icon: ClipboardList },
        { id: '/customers', label: 'Müşteriler', icon: Users },
        { id: '/staff', label: 'Personel', icon: UserCog },
        { id: '/analytics', label: 'Analiz', icon: BarChart3 },
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
                "fixed top-0 bottom-0 bg-white/80 backdrop-blur-xl border-r border-gray-100 z-50 transition-all duration-300 ease-in-out",
                "md:translate-x-0",
                isMobileOpen ? "translate-x-0 w-64 left-0" : "-translate-x-full left-0",
                "md:left-0",
                isCollapsed ? "md:w-20" : "md:w-64"
            )}>
                {/* Logo Section */}
                <div className="relative p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className={cn(
                        "flex items-center gap-3 transition-all duration-300",
                        isCollapsed && "md:justify-center"
                    )}>
                        {(!isCollapsed || isMobileOpen) && (
                            <div className="flex items-baseline gap-1.5">
                                <h1 className="text-2xl font-bold text-gray-900">
                                    LUERA
                                </h1>
                                <span className="text-xs text-gray-400 tracking-wide">TimeFlow</span>
                            </div>
                        )}
                        {isCollapsed && !isMobileOpen && (
                            <span className="text-2xl font-bold text-gray-900">L</span>
                        )}
                    </div>

                    {/* Mobile Close Button */}
                    <button
                        onClick={onMobileClose}
                        className="md:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                        <X size={20} />
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
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
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
                                        ? "bg-[#CCFF00]/10 text-gray-900 font-medium"
                                        : "text-gray-500 hover:bg-gray-100/80 hover:text-gray-900"
                                )}
                            >
                                {active && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#CCFF00] rounded-r-full" />
                                )}
                                <Icon size={20} className={cn(active && "text-gray-900")} />
                                {(!isCollapsed || isMobileOpen) && <span>{item.label}</span>}
                            </button>
                        );
                    })}

                    {/* Divider */}
                    <div className="pt-4 mt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => handleNavClick('/settings')}
                            className={cn(
                                "relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                isCollapsed && !isMobileOpen ? "justify-center px-3" : "",
                                isActive('/settings')
                                    ? "bg-[#CCFF00]/10 text-gray-900 font-medium"
                                    : "text-gray-500 hover:bg-gray-100/80 hover:text-gray-900"
                            )}
                        >
                            {isActive('/settings') && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#CCFF00] rounded-r-full" />
                            )}
                            <Settings size={20} />
                            {(!isCollapsed || isMobileOpen) && <span>Ayarlar</span>}
                        </button>
                    </div>
                </nav>

                {/* User Profile */}
                <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-white/50">
                    <div className="relative">
                        <button
                            onClick={() => (!isCollapsed || isMobileOpen) && setShowUserMenu(!showUserMenu)}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 transition-colors",
                                isCollapsed && !isMobileOpen ? "justify-center" : ""
                            )}
                        >
                            <div className="w-10 h-10 rounded-full bg-[#CCFF00] flex items-center justify-center shadow-md">
                                <span className="font-bold text-gray-900 text-sm">{(user?.name || 'U').charAt(0).toUpperCase()}</span>
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
                                    <ChevronUp className={cn(
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
                                    <User className="w-4 h-4" />
                                    Profil
                                </button>
                                <button
                                    onClick={() => { handleNavClick('/settings'); setShowUserMenu(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <Settings className="w-4 h-4" />
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
                                    <LogOut className="w-4 h-4" />
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
