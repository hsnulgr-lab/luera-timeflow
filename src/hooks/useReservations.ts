import { useState, useEffect, useCallback } from 'react';
import type { Reservation, Settings, Service } from '@/types';

const defaultServices: Service[] = [
    { id: '1', name: 'Genel Randevu', duration: 30, color: '#CCFF00' },
    { id: '2', name: 'Konsültasyon', duration: 60, color: '#8B5CF6' },
    { id: '3', name: 'Kontrol', duration: 15, color: '#06B6D4' },
    { id: '4', name: 'Tedavi', duration: 45, color: '#F59E0B' },
    { id: '5', name: 'Toplantı', duration: 90, color: '#EC4899' },
];

const defaultSettings: Settings = {
    businessName: 'Luera TimeFlow',
    workingHours: [
        { day: 0, dayName: 'Pazar', start: '09:00', end: '18:00', isOff: true },
        { day: 1, dayName: 'Pazartesi', start: '09:00', end: '18:00', isOff: false },
        { day: 2, dayName: 'Salı', start: '09:00', end: '18:00', isOff: false },
        { day: 3, dayName: 'Çarşamba', start: '09:00', end: '18:00', isOff: false },
        { day: 4, dayName: 'Perşembe', start: '09:00', end: '18:00', isOff: false },
        { day: 5, dayName: 'Cuma', start: '09:00', end: '18:00', isOff: false },
        { day: 6, dayName: 'Cumartesi', start: '10:00', end: '15:00', isOff: false },
    ],
    services: defaultServices,
    slotDuration: 30,
};

const LS_RESERVATIONS = 'luera_reservations';
const LS_SETTINGS = 'luera_settings';

function loadFromStorage<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveToStorage<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function useReservations() {
    const [reservations, setReservations] = useState<Reservation[]>(() =>
        loadFromStorage<Reservation[]>(LS_RESERVATIONS, [])
    );
    const [settings, setSettings] = useState<Settings>(() =>
        loadFromStorage<Settings>(LS_SETTINGS, defaultSettings)
    );
    const [isLoading] = useState(false);

    useEffect(() => {
        saveToStorage(LS_RESERVATIONS, reservations);
    }, [reservations]);

    useEffect(() => {
        saveToStorage(LS_SETTINGS, settings);
    }, [settings]);

    const addReservation = useCallback(async (reservation: Omit<Reservation, 'id' | 'createdAt'>) => {
        const newRes: Reservation = {
            ...reservation,
            id: generateId(),
            createdAt: new Date().toISOString(),
        };
        setReservations(prev => [newRes, ...prev]);
        return newRes;
    }, []);

    const updateReservation = useCallback(async (id: string, updates: Partial<Reservation>) => {
        setReservations(prev =>
            prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r)
        );
    }, []);

    const deleteReservation = useCallback(async (id: string) => {
        setReservations(prev => prev.filter(r => r.id !== id));
    }, []);

    const getReservationsByDate = useCallback((date: string) => {
        return reservations.filter(r => r.date === date);
    }, [reservations]);

    const getTodayReservations = useCallback(() => {
        const today = new Date().toISOString().split('T')[0];
        return reservations
            .filter(r => r.date === today)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }, [reservations]);

    const getUpcomingReservations = useCallback((limit = 5) => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        return reservations
            .filter(r =>
                r.status !== 'cancelled' && r.status !== 'completed' &&
                (r.date > todayStr || (r.date === todayStr && r.startTime >= currentTime))
            )
            .sort((a, b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date))
            .slice(0, limit);
    }, [reservations]);

    const getStats = useCallback(() => {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = reservations.filter(r => r.date === today);
        return {
            total: reservations.length,
            today: todayRes.length,
            pending: reservations.filter(r => r.status === 'pending').length,
            confirmed: reservations.filter(r => r.status === 'confirmed').length,
            cancelled: reservations.filter(r => r.status === 'cancelled').length,
            completed: reservations.filter(r => r.status === 'completed').length,
        };
    }, [reservations]);

    const updateSettings = useCallback(async (newSettings: Settings) => {
        setSettings(newSettings);
    }, []);

    const checkConflict = useCallback((date: string, startTime: string, endTime: string, excludeId?: string): Reservation | null => {
        const startMin = timeToMinutes(startTime);
        const endMin = timeToMinutes(endTime);

        const conflict = reservations.find(r => {
            if (r.id === excludeId) return false;
            if (r.date !== date) return false;
            if (r.status === 'cancelled') return false;

            const rStart = timeToMinutes(r.startTime);
            const rEnd = timeToMinutes(r.endTime);

            return startMin < rEnd && rStart < endMin;
        });

        return conflict || null;
    }, [reservations]);

    const sendWebhook = useCallback(async (event: string, data: any) => {
        if (!settings.webhookUrl) return;
        try {
            await fetch(settings.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
            });
        } catch (err) {
            console.error('Webhook error:', err);
        }
    }, [settings.webhookUrl]);

    return {
        reservations,
        settings,
        isLoading,
        addReservation,
        updateReservation,
        deleteReservation,
        getReservationsByDate,
        getTodayReservations,
        getUpcomingReservations,
        getStats,
        updateSettings,
        checkConflict,
        sendWebhook,
        refetch: async () => {},
    };
}
