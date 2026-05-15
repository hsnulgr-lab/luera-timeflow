import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, Calendar, CheckCircle2, XCircle, AlertCircle, Clock, X } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';

interface Notification {
    id: string;
    type: 'pending' | 'upcoming' | 'cancelled' | 'completed';
    title: string;
    message: string;
    time: string;
    read: boolean;
}

export const NotificationDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [readIds, setReadIds] = useState<Set<string>>(() => {
        const stored = localStorage.getItem('tf_read_notifications');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { reservations } = useReservations();

    // Generate notifications from reservation data
    const notifications = useMemo<Notification[]>(() => {
        const notifs: Notification[] = [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Pending reservations
        const pending = reservations.filter(r => r.status === 'pending');
        if (pending.length > 0) {
            notifs.push({
                id: `pending-${pending.length}`,
                type: 'pending',
                title: `${pending.length} Bekleyen Randevu`,
                message: `${pending.length} adet randevu onayınızı bekliyor.`,
                time: 'Şimdi',
                read: readIds.has(`pending-${pending.length}`),
            });
        }

        // Today's upcoming reservations
        const todayUpcoming = reservations.filter(r =>
            r.date === todayStr &&
            r.startTime > currentTime &&
            r.status !== 'cancelled'
        ).sort((a, b) => a.startTime.localeCompare(b.startTime));

        todayUpcoming.slice(0, 3).forEach(r => {
            notifs.push({
                id: `upcoming-${r.id}`,
                type: 'upcoming',
                title: `Yaklaşan: ${r.customerName}`,
                message: `Bugün ${r.startTime} - ${r.service}`,
                time: r.startTime,
                read: readIds.has(`upcoming-${r.id}`),
            });
        });

        // Recent cancellations (last 3)
        const recentCancelled = reservations
            .filter(r => r.status === 'cancelled')
            .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
            .slice(0, 2);

        recentCancelled.forEach(r => {
            notifs.push({
                id: `cancelled-${r.id}`,
                type: 'cancelled',
                title: `İptal: ${r.customerName}`,
                message: `${r.date} ${r.startTime} randevusu iptal edildi.`,
                time: r.date,
                read: readIds.has(`cancelled-${r.id}`),
            });
        });

        // Recently completed
        const recentCompleted = reservations
            .filter(r => r.status === 'completed')
            .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
            .slice(0, 2);

        recentCompleted.forEach(r => {
            notifs.push({
                id: `completed-${r.id}`,
                type: 'completed',
                title: `Tamamlandı: ${r.customerName}`,
                message: `${r.service} randevusu tamamlandı.`,
                time: r.date,
                read: readIds.has(`completed-${r.id}`),
            });
        });

        return notifs;
    }, [reservations, readIds]);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markAllRead = () => {
        const newReadIds = new Set(notifications.map(n => n.id));
        setReadIds(newReadIds);
        localStorage.setItem('tf_read_notifications', JSON.stringify([...newReadIds]));
    };

    const markRead = (id: string) => {
        const newReadIds = new Set(readIds);
        newReadIds.add(id);
        setReadIds(newReadIds);
        localStorage.setItem('tf_read_notifications', JSON.stringify([...newReadIds]));
    };

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'pending': return <AlertCircle className="w-4 h-4 text-amber-500" />;
            case 'upcoming': return <Clock className="w-4 h-4 text-blue-500" />;
            case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        }
    };

    const getBgColor = (type: Notification['type']) => {
        switch (type) {
            case 'pending': return 'bg-amber-50 border-amber-100';
            case 'upcoming': return 'bg-blue-50 border-blue-100';
            case 'cancelled': return 'bg-red-50 border-red-100';
            case 'completed': return 'bg-emerald-50 border-emerald-100';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all duration-200"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px] shadow-lg shadow-red-500/30 animate-pulse">
                        {unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Bildirimler</h3>
                            <p className="text-[10px] text-gray-400">{unreadCount} okunmamış</p>
                        </div>
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-[10px] font-semibold text-[#7a9900] hover:text-[#5c7300] transition-colors px-2 py-1 rounded-lg hover:bg-[#CCFF00]/10"
                                >
                                    Tümünü oku
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="py-12 text-center">
                                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">Bildirim yok</p>
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <button
                                    key={notif.id}
                                    onClick={() => markRead(notif.id)}
                                    className={cn(
                                        "w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-all",
                                        !notif.read && "bg-[#CCFF00]/[0.03]"
                                    )}
                                >
                                    <div className="flex gap-3">
                                        <div className={cn("p-1.5 rounded-lg border flex-shrink-0 mt-0.5", getBgColor(notif.type))}>
                                            {getIcon(notif.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between">
                                                <p className={cn(
                                                    "text-sm truncate",
                                                    notif.read ? "text-gray-600" : "text-gray-900 font-semibold"
                                                )}>{notif.title}</p>
                                                {!notif.read && (
                                                    <div className="w-2 h-2 rounded-full bg-[#CCFF00] flex-shrink-0 mt-1.5 ml-2" />
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">{notif.message}</p>
                                            <p className="text-[10px] text-gray-300 mt-1">{notif.time}</p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
