import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { Menu } from 'lucide-react';
import { cn } from '@/utils/cn';
import { AiAssistant } from '@/components/ai/AiAssistant';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTheme } from '@/contexts/ThemeContext';

export const Layout = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const { dark } = useTheme();

    return (
        <div className={cn("min-h-screen", dark ? "bg-[#0C0A08]" : "bg-[#F3ECE0]")}>
            <Sidebar
                isCollapsed={isCollapsed}
                onCollapsedChange={setIsCollapsed}
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

            {/* Desktop Top Bar (notification area) */}
            <div className={cn(
                "hidden md:flex fixed top-0 right-0 h-14 items-center gap-4 px-6 z-20 transition-all duration-300",
                isCollapsed ? "left-20" : "left-64"
            )}>
                {/* AI Asistan — içgörü + aksiyonlar tek merkezde */}
                <AiAssistant />

                <div className="ml-auto">
                    <NotificationDropdown />
                </div>
            </div>

            {/* Main Content */}
            <main className={cn(
                "transition-all duration-300 pt-14 md:pt-14 h-screen flex flex-col",
                isCollapsed ? "md:ml-20" : "md:ml-64"
            )}>
                <ErrorBoundary>
                    <Outlet />
                </ErrorBoundary>
            </main>
        </div>
    );
};
