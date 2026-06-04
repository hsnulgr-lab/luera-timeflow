import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { Menu, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useInsight } from '@/hooks/useInsight';

export const Layout = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [insightOpen, setInsightOpen] = useState(false);
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
                    <div className="relative min-w-0">
                        <button
                            onClick={() => setInsightOpen(o => !o)}
                            className="group flex items-center gap-2 min-w-0 max-w-xl pl-1.5 pr-2.5 py-1.5 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 ring-1 ring-[#CCFF00]/25 shadow-sm hover:ring-[#CCFF00]/50 transition-all"
                        >
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#CCFF00] flex-shrink-0 shadow-sm shadow-[#CCFF00]/30">
                                <Sparkles className="w-3.5 h-3.5 text-slate-900" />
                            </span>
                            <span className="text-[10px] font-extrabold text-[#CCFF00] uppercase tracking-wider flex-shrink-0">AI</span>
                            <span className="w-px h-3.5 bg-white/15 flex-shrink-0" />
                            {insightLoading && !insight ? (
                                <span className="h-2.5 w-32 bg-white/15 rounded-full animate-pulse" />
                            ) : (
                                <span className="text-[13px] text-white/90 truncate">{insight}</span>
                            )}
                            <ChevronDown className={cn("w-3.5 h-3.5 text-white/40 flex-shrink-0 transition-transform", insightOpen && "rotate-180")} />
                        </button>

                        {insightOpen && insight && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setInsightOpen(false)} />
                                <div className="absolute z-50 left-0 mt-2 w-[22rem] rounded-2xl bg-white border border-gray-200 shadow-xl p-4 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="flex items-center gap-2 mb-2.5">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#CCFF00]">
                                            <Sparkles className="w-3.5 h-3.5 text-slate-900" />
                                        </span>
                                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Günün İçgörüsü</span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                                </div>
                            </>
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
