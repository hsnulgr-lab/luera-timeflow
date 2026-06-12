import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, CheckCircle2, XCircle, AlertCircle, Clock, X } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { toISODate } from '@/utils/date';

interface Notification {
    id: string;
    type: 'pending' | 'upcoming' | 'cancelled' | 'completed';
    title: string;
    message: string;
    time: string;
    read: boolean;
}

export const NotificationDropdown = () => {
    const { dark } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [readIds, setReadIds] = useState<Set<string>>(() => {
        const stored = localStorage.getItem('tf_read_notifications');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { reservations } = useReservations();

    const notifications = useMemo<Notification[]>(() => {
        const notifs: Notification[] = [];
        const now = new Date();
        const todayStr = toISODate(now);
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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

        const todayUpcoming = reservations.filter(r =>
            r.date === todayStr && r.startTime > currentTime && r.status !== 'cancelled'
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

        reservations
            .filter(r => r.status === 'cancelled')
            .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
            .slice(0, 2)
            .forEach(r => {
                notifs.push({
                    id: `cancelled-${r.id}`,
                    type: 'cancelled',
                    title: `İptal: ${r.customerName}`,
                    message: `${r.date} ${r.startTime} randevusu iptal edildi.`,
                    time: r.date,
                    read: readIds.has(`cancelled-${r.id}`),
                });
            });

        reservations
            .filter(r => r.status === 'completed')
            .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
            .slice(0, 2)
            .forEach(r => {
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
        const ids = new Set(notifications.map(n => n.id));
        setReadIds(ids);
        localStorage.setItem('tf_read_notifications', JSON.stringify([...ids]));
    };

    const markRead = (id: string) => {
        const ids = new Set(readIds);
        ids.add(id);
        setReadIds(ids);
        localStorage.setItem('tf_read_notifications', JSON.stringify([...ids]));
    };

    // Per-type icon + color config
    const typeConfig = {
        pending: {
            icon: <AlertCircle className="w-4 h-4" />,
            color:  dark ? '#FDBA74' : '#d97706',
            bg:     dark ? 'rgba(253,186,116,0.12)' : 'rgba(245,158,11,0.10)',
            border: dark ? 'rgba(253,186,116,0.22)' : 'rgba(245,158,11,0.20)',
        },
        upcoming: {
            icon: <Clock className="w-4 h-4" />,
            color:  dark ? '#93C5FD' : '#2563eb',
            bg:     dark ? 'rgba(96,165,250,0.12)' : 'rgba(59,130,246,0.10)',
            border: dark ? 'rgba(96,165,250,0.22)' : 'rgba(59,130,246,0.20)',
        },
        cancelled: {
            icon: <XCircle className="w-4 h-4" />,
            color:  dark ? '#FCA5A5' : '#dc2626',
            bg:     dark ? 'rgba(248,113,113,0.12)' : 'rgba(239,68,68,0.10)',
            border: dark ? 'rgba(248,113,113,0.22)' : 'rgba(239,68,68,0.20)',
        },
        completed: {
            icon: <CheckCircle2 className="w-4 h-4" />,
            color:  dark ? '#86EFAC' : '#16a34a',
            bg:     dark ? 'rgba(74,222,128,0.12)' : 'rgba(34,197,94,0.10)',
            border: dark ? 'rgba(74,222,128,0.22)' : 'rgba(34,197,94,0.20)',
        },
    } as const;

    // Dark mode tokens
    const T = {
        cardBg:     dark ? '#141209' : '#FFFFFF',
        cardBorder: dark ? 'rgba(243,237,227,0.11)' : 'rgba(14,14,14,0.09)',
        cardShadow: dark
            ? '0 0 0 1px rgba(255,90,31,0.06), 0 24px 64px rgba(0,0,0,0.80), 0 8px 24px rgba(0,0,0,0.50)'
            : '0 8px 32px rgba(14,14,14,0.14), 0 2px 8px rgba(14,14,14,0.07)',
        headerBg:   dark ? 'rgba(243,237,227,0.03)' : 'rgba(14,14,14,0.02)',
        headerBorder: dark ? 'rgba(243,237,227,0.07)' : 'rgba(14,14,14,0.07)',
        ink:        dark ? '#F3EDE3' : '#0E0E0E',
        muted:      dark ? 'rgba(243,237,227,0.55)' : 'rgba(14,14,14,0.45)',
        muted2:     dark ? 'rgba(243,237,227,0.35)' : 'rgba(14,14,14,0.30)',
        rowBorder:  dark ? 'rgba(243,237,227,0.06)' : 'rgba(14,14,14,0.05)',
        rowHover:   dark ? 'rgba(243,237,227,0.04)' : 'rgba(14,14,14,0.03)',
        rowUnread:  dark ? 'rgba(255,90,31,0.04)'   : 'rgba(255,90,31,0.03)',
        dot:        dark ? '#FF5A1F'                 : '#FF5A1F',
        orange:     '#FF5A1F',
        bellHover:  dark ? 'rgba(243,237,227,0.07)' : 'rgba(14,14,14,0.06)',
        bellColor:  dark ? 'rgba(243,237,227,0.55)' : 'rgba(14,14,14,0.45)',
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-xl transition-all"
                style={{ color: T.bellColor }}
                onMouseEnter={e => (e.currentTarget.style.background = T.bellHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold rounded-full"
                        style={{ background: T.orange, color: '#fff', boxShadow: '0 0 8px rgba(255,90,31,0.45)' }}>
                        {unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div
                        className="absolute right-0 top-full mt-2 w-80 z-50 overflow-hidden"
                        style={{
                            background: T.cardBg,
                            border: `1px solid ${T.cardBorder}`,
                            borderRadius: 18,
                            boxShadow: T.cardShadow,
                            borderTop: dark ? '1.5px solid rgba(255,90,31,0.28)' : undefined,
                        }}
                    >
                        {/* Ambient glow — dark only */}
                        {dark && (
                            <div style={{
                                position: 'absolute', top: -30, right: -30,
                                width: 180, height: 140, pointerEvents: 'none', zIndex: 0,
                                background: 'radial-gradient(ellipse, rgba(255,90,31,0.10) 0%, transparent 70%)',
                            }} />
                        )}

                        <div style={{ position: 'relative', zIndex: 1 }}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3"
                                style={{ background: T.headerBg, borderBottom: `1px solid ${T.headerBorder}` }}>
                                <div>
                                    <h3 className="text-sm font-bold" style={{ color: T.ink }}>Bildirimler</h3>
                                    <p className="text-[10px]" style={{ color: T.muted2 }}>{unreadCount} okunmamış</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllRead}
                                            className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
                                            style={{ color: T.orange }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,90,31,0.08)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            Tümünü oku
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-1.5 rounded-lg transition-colors"
                                        style={{ color: T.muted2 }}
                                        onMouseEnter={e => (e.currentTarget.style.background = T.rowHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Notification List */}
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="py-12 text-center">
                                        <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: T.muted2 }} />
                                        <p className="text-sm" style={{ color: T.muted }}>Bildirim yok</p>
                                    </div>
                                ) : (
                                    notifications.map((notif) => {
                                        const cfg = typeConfig[notif.type];
                                        return (
                                            <button
                                                key={notif.id}
                                                onClick={() => markRead(notif.id)}
                                                className={cn("w-full text-left px-4 py-3 transition-all")}
                                                style={{
                                                    borderBottom: `1px solid ${T.rowBorder}`,
                                                    background: !notif.read ? T.rowUnread : 'transparent',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = T.rowHover)}
                                                onMouseLeave={e => (e.currentTarget.style.background = !notif.read ? T.rowUnread : 'transparent')}
                                            >
                                                <div className="flex gap-3">
                                                    {/* Icon pill */}
                                                    <div className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center"
                                                        style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
                                                        {cfg.icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-1">
                                                            <p className="text-sm truncate"
                                                                style={{ color: T.ink, fontWeight: notif.read ? 500 : 700 }}>
                                                                {notif.title}
                                                            </p>
                                                            {!notif.read && (
                                                                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                                                                    style={{ background: T.dot, boxShadow: '0 0 6px rgba(255,90,31,0.5)' }} />
                                                            )}
                                                        </div>
                                                        <p className="text-xs mt-0.5 truncate" style={{ color: T.muted }}>{notif.message}</p>
                                                        <p className="text-[10px] mt-1" style={{ color: T.muted2 }}>{notif.time}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
