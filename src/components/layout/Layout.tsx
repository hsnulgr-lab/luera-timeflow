import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useInsight } from '@/hooks/useInsight';

export const Layout = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const { insight, loading: insightLoading } = useInsight();

    return (
        <div className="min-h-screen bg-gray-50/50">
            <Sidebar
                isCollapsed={isCollapsed}
                onCollapsedChange={setIsCollapsed}
                isMobileOpen={isMobileOpen}
                onMobileClose={() => setIsMobileOpen(false)}
            />

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-xl border-b border-gray-100 z-30 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsMobileOpen(true)}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    >
                        <Menu size={20} />
                    </button>
                    <div className="flex items-baseline gap-1.5">
                        <h1 className="text-lg font-bold text-gray-900">LUERA</h1>
                        <span className="text-[10px] text-gray-400 tracking-wide">TimeFlow</span>
                    </div>
                </div>
                <NotificationDropdown />
            </div>

            {/* Desktop Top Bar (notification area) */}
            <div className={cn(
                "hidden md:flex fixed top-0 right-0 h-14 items-center gap-4 px-6 z-20 transition-all duration-300",
                isCollapsed ? "left-20" : "left-64"
            )}>
                {/* AI Günlük İçgörü — üst şerit */}
                {(insight || insightLoading) && (
                    <div className="flex items-center gap-2.5 min-w-0 max-w-2xl px-3.5 py-1.5 rounded-full bg-slate-900 shadow-sm" title={insight ?? ''}>
                        <Sparkles className="w-3.5 h-3.5 text-[#CCFF00] flex-shrink-0" />
                        {insightLoading && !insight ? (
                            <span className="h-2.5 w-40 bg-white/15 rounded-full animate-pulse" />
                        ) : (
                            <span className="text-[13px] text-white/90 truncate">{insight}</span>
                        )}
                    </div>
                )}

                <div className="ml-auto">
                    <NotificationDropdown />
                </div>
            </div>

            {/* Main Content */}
            <main className={cn(
                "transition-all duration-300 pt-14 md:pt-14 h-screen flex flex-col",
                isCollapsed ? "md:ml-20" : "md:ml-64"
            )}>
                <Outlet />
            </main>
        </div>
    );
};
