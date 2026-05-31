import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
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

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function mapDbReservation(row: any): Reservation {
    return {
        id: row.id,
        customerId: row.customer_id || '',
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email || undefined,
        date: row.date,
        startTime: row.start_time?.slice(0, 5) || row.start_time,
        endTime: row.end_time?.slice(0, 5) || row.end_time,
        service: row.service,
        serviceColor: row.service_color || '#CCFF00',
        status: row.status,
        notes: row.notes || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at || undefined,
    };
}

export function useReservations() {
    const { user } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [orgId, setOrgId] = useState<string | null>(null);

    // ─── org_id çöz ──────────────────────────────────────────────────────────
    const fetchOrgId = useCallback(async () => {
        if (!user) return null;
        const { data } = await supabase
            .from('organization_members')
            .select('org_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        const id = data?.org_id ?? null;
        setOrgId(id);
        return id;
    }, [user]);

    // ─── Rezervasyonları getir ────────────────────────────────────────────────
    const fetchReservations = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .order('date', { ascending: false })
            .order('start_time', { ascending: true });

        if (error) {
            toast.error('Rezervasyonlar yüklenemedi');
            console.error('Error fetching reservations:', error);
        } else {
            setReservations((data || []).map(mapDbReservation));
        }
        setIsLoading(false);
    }, [user]);

    // ─── Ayarları getir ──────────────────────────────────────────────────────
    const fetchSettings = useCallback(async (currentOrgId?: string | null) => {
        if (!user) return;

        const resolvedOrgId = currentOrgId ?? orgId;

        const { data: settingsData } = await supabase
            .from('settings')
            .select('*')
            .single();

        const { data: servicesData } = await supabase
            .from('services')
            .select('*')
            .order('created_at');

        const allServices: Service[] = (servicesData || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            duration: s.duration,
            color: s.color,
            price: s.price ? Number(s.price) : undefined,
        }));

        const seen = new Set<string>();
        const services = allServices.filter(s => {
            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
        });

        if (settingsData) {
            setSettings({
                businessName: settingsData.business_name,
                workingHours: settingsData.working_hours || defaultSettings.workingHours,
                services: services.length > 0 ? services : defaultSettings.services,
                slotDuration: settingsData.slot_duration,
                webhookUrl: settingsData.webhook_url || undefined,
                whatsappInstance: settingsData.whatsapp_instance || undefined,
            });
        } else {
            // Fallback: handle_new_user trigger bu kaydı oluşturur,
            // ama organizasyon bulunabilirse manuel oluştur
            if (resolvedOrgId) {
                await supabase.from('settings').insert({
                    user_id: user.id,
                    organization_id: resolvedOrgId,
                    business_name: defaultSettings.businessName,
                    slot_duration: defaultSettings.slotDuration,
                    working_hours: defaultSettings.workingHours,
                });

                if (services.length === 0) {
                    await supabase.from('services').insert(
                        defaultServices.map(s => ({
                            user_id: user.id,
                            organization_id: resolvedOrgId,
                            name: s.name,
                            duration: s.duration,
                            color: s.color,
                        }))
                    );
                }
            }

            setSettings({
                ...defaultSettings,
                services: services.length > 0 ? services : defaultSettings.services,
            });
        }
    }, [user, orgId]);

    // ─── Yükleme ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (user) {
            fetchOrgId().then(id => {
                fetchReservations();
                fetchSettings(id);
            });
        }
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Rezervasyon ekle ────────────────────────────────────────────────────
    const addReservation = useCallback(async (reservation: Omit<Reservation, 'id' | 'createdAt'>) => {
        if (!user) return null;

        if (!orgId) {
            toast.error('Organizasyon bilgisi alınamadı. Lütfen sayfayı yenileyin.');
            return null;
        }

        const { data, error } = await supabase
            .from('reservations')
            .insert({
                user_id: user.id,
                organization_id: orgId,
                customer_id: reservation.customerId || null,
                customer_name: reservation.customerName,
                customer_phone: reservation.customerPhone,
                customer_email: reservation.customerEmail || null,
                date: reservation.date,
                start_time: reservation.startTime,
                end_time: reservation.endTime,
                service: reservation.service,
                service_color: reservation.serviceColor || '#CCFF00',
                status: reservation.status || 'pending',
                notes: reservation.notes || '',
            })
            .select()
            .single();

        if (error) {
            toast.error('Rezervasyon oluşturulamadı');
            console.error('Error adding reservation:', error);
            return null;
        }

        const newRes = mapDbReservation(data);
        setReservations(prev => [newRes, ...prev]);
        return newRes;
    }, [user, orgId]);

    // ─── Rezervasyon güncelle ────────────────────────────────────────────────
    const updateReservation = useCallback(async (id: string, updates: Partial<Reservation>) => {
        const dbUpdates: any = { updated_at: new Date().toISOString() };

        if (updates.customerName !== undefined) dbUpdates.customer_name = updates.customerName;
        if (updates.customerPhone !== undefined) dbUpdates.customer_phone = updates.customerPhone;
        if (updates.customerEmail !== undefined) dbUpdates.customer_email = updates.customerEmail;
        if (updates.date !== undefined) dbUpdates.date = updates.date;
        if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
        if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
        if (updates.service !== undefined) dbUpdates.service = updates.service;
        if (updates.serviceColor !== undefined) dbUpdates.service_color = updates.serviceColor;
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

        const { error } = await supabase
            .from('reservations')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            toast.error('Rezervasyon güncellenemedi');
            console.error('Error updating reservation:', error);
            return;
        }

        setReservations(prev =>
            prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r)
        );
    }, []);

    // ─── Rezervasyon sil ─────────────────────────────────────────────────────
    const deleteReservation = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('reservations')
            .delete()
            .eq('id', id);

        if (error) {
            toast.error('Rezervasyon silinemedi');
            console.error('Error deleting reservation:', error);
            return;
        }

        setReservations(prev => prev.filter(r => r.id !== id));
    }, []);

    // ─── Yardımcı sorgular ───────────────────────────────────────────────────
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

    // ─── Ayarları güncelle ───────────────────────────────────────────────────
    const updateSettings = useCallback(async (newSettings: Settings) => {
        if (!user) return;

        if (!orgId) {
            toast.error('Organizasyon bilgisi alınamadı');
            return;
        }

        const { error: settingsError } = await supabase
            .from('settings')
            .upsert({
                user_id: user.id,
                organization_id: orgId,
                business_name: newSettings.businessName,
                slot_duration: newSettings.slotDuration,
                working_hours: newSettings.workingHours,
                webhook_url: newSettings.webhookUrl || null,
                whatsapp_instance: newSettings.whatsappInstance || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (settingsError) {
            toast.error('Ayarlar kaydedilemedi');
            console.error('Error updating settings:', settingsError);
            return;
        }

        await supabase.from('services').delete().eq('user_id', user.id);
        if (newSettings.services.length > 0) {
            await supabase.from('services').insert(
                newSettings.services.map(s => ({
                    user_id: user.id,
                    organization_id: orgId,
                    name: s.name,
                    duration: s.duration,
                    color: s.color,
                    price: s.price || null,
                }))
            );
        }

        const { data: servicesData } = await supabase
            .from('services')
            .select('*')
            .order('created_at');

        const updatedServices: Service[] = (servicesData || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            duration: s.duration,
            color: s.color,
            price: s.price ? Number(s.price) : undefined,
        }));

        setSettings({ ...newSettings, services: updatedServices.length > 0 ? updatedServices : newSettings.services });
    }, [user, orgId]);

    // ─── Çakışma kontrolü ────────────────────────────────────────────────────
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

    // ─── Webhook gönder ──────────────────────────────────────────────────────
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
        orgId,
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
        refetch: fetchReservations,
    };
}
