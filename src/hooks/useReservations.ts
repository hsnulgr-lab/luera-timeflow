import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { todayISO, toISODate } from '@/utils/date';
import type { Reservation, Settings, Service } from '@/types';

// Renkler Luera paletinden (src/utils/palette.ts) — tasarımla uyumlu, sıcak tonlar
const defaultServices: Service[] = [
    { id: '1', name: 'Genel Randevu', duration: 30, color: '#FF5A1F' }, // turuncu
    { id: '2', name: 'Konsültasyon', duration: 60, color: '#8E70B2' }, // erik
    { id: '3', name: 'Kontrol', duration: 15, color: '#3F9D9A' },      // teal
    { id: '4', name: 'Tedavi', duration: 45, color: '#E8973C' },       // amber
    { id: '5', name: 'Toplantı', duration: 90, color: '#CB5E84' },     // gül
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
        reminder24hSent: row.reminder_24h_sent ?? false,
        reminder2hSent: row.reminder_2h_sent ?? false,
        staffId: row.staff_id || undefined,
        staffName: row.staff?.name || undefined,
        staffColor: row.staff?.color || undefined,
    };
}

// Ağır mantık — yalnızca Provider içinde BİR KEZ çalışır
function useReservationsState() {
    const { user } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [orgId, setOrgId] = useState<string | null>(null);

    // Webhook URL'yi ref'te tut — CRUD callback'leri stale closure olmadan erişsin
    const webhookUrlRef = useRef<string | undefined>(undefined);
    useEffect(() => { webhookUrlRef.current = settings.webhookUrl; }, [settings.webhookUrl]);

    // ─── Standart webhook gönderici ──────────────────────────────────────────
    const fireWebhook = useCallback(async (event: string, payload: object) => {
        const url = webhookUrlRef.current;
        if (!url) return;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event,
                    source: 'timeflow',
                    timestamp: new Date().toISOString(),
                    data: payload,
                }),
            });
        } catch (err) {
            console.error('Webhook error:', err);
        }
    }, []);

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
    const fetchReservations = useCallback(async (currentOrgId?: string | null) => {
        if (!user) return;
        setIsLoading(true);

        // Tenant izolasyonu — orgId bilindiğinde açık filtre (RLS'e ek savunma)
        const resolvedOrgId = currentOrgId ?? orgId;
        let query = supabase
            .from('reservations')
            .select('*, staff(name, color)');
        if (resolvedOrgId) query = query.eq('organization_id', resolvedOrgId);

        const { data, error } = await query
            .order('date', { ascending: false })
            .order('start_time', { ascending: true });

        if (error) {
            toast.error('Rezervasyonlar yüklenemedi');
            console.error('Error fetching reservations:', error);
        } else {
            setReservations((data || []).map(mapDbReservation));
        }
        setIsLoading(false);
    }, [user, orgId]);

    // ─── Ayarları getir ──────────────────────────────────────────────────────
    const fetchSettings = useCallback(async (currentOrgId?: string | null) => {
        if (!user) return;

        const resolvedOrgId = currentOrgId ?? orgId;

        // maybeSingle: çoklu satırda .single() patlardı; yokken null döner
        const { data: settingsData } = await supabase
            .from('settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        const { data: servicesData } = await supabase
            .from('services')
            .select('*')
            .eq('user_id', user.id)
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
                fetchReservations(id);
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
                staff_id: reservation.staffId || null,
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
        fireWebhook('reservation.created', {
            id: newRes.id,
            customer_name:  newRes.customerName,
            customer_phone: newRes.customerPhone,
            customer_email: newRes.customerEmail ?? null,
            date:           newRes.date,
            start_time:     newRes.startTime,
            end_time:       newRes.endTime,
            service:        newRes.service,
            status:         newRes.status,
            notes:          newRes.notes ?? '',
            staff_id:       newRes.staffId ?? null,
            staff_name:     newRes.staffName ?? null,
        });
        return newRes;
    }, [user, orgId, fireWebhook]);

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

        const updated = { ...reservations.find(r => r.id === id)!, ...updates, updatedAt: new Date().toISOString() };
        setReservations(prev => prev.map(r => r.id === id ? updated : r));
        fireWebhook('reservation.updated', {
            id,
            customer_name:  updated.customerName,
            customer_phone: updated.customerPhone,
            date:           updated.date,
            start_time:     updated.startTime,
            end_time:       updated.endTime,
            service:        updated.service,
            status:         updated.status,
            notes:          updated.notes ?? '',
            staff_id:       updated.staffId ?? null,
        });
    }, [reservations, fireWebhook]);

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
        fireWebhook('reservation.deleted', { id });
    }, [fireWebhook]);

    // ─── Yardımcı sorgular ───────────────────────────────────────────────────
    const getReservationsByDate = useCallback((date: string) => {
        return reservations.filter(r => r.date === date);
    }, [reservations]);

    const getTodayReservations = useCallback(() => {
        const today = todayISO();
        return reservations
            .filter(r => r.date === today)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }, [reservations]);

    const getUpcomingReservations = useCallback((limit = 5) => {
        const now = new Date();
        const todayStr = toISODate(now);
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
        const today = todayISO();
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

        // Hizmetleri güncelle — veri kaybına karşı snapshot + rollback
        // (transaction yerine: insert başarısız olursa eski hizmetleri geri yükle)
        const { data: oldServices } = await supabase
            .from('services').select('*').eq('user_id', user.id);

        const { error: delError } = await supabase
            .from('services').delete().eq('user_id', user.id);
        if (delError) {
            toast.error('Hizmetler güncellenemedi');
            console.error('Error deleting services:', delError);
            return; // silme başarısız → eski hizmetler güvende
        }

        if (newSettings.services.length > 0) {
            const { error: insError } = await supabase.from('services').insert(
                newSettings.services.map(s => ({
                    user_id: user.id,
                    organization_id: orgId,
                    name: s.name,
                    duration: s.duration,
                    color: s.color,
                    price: s.price || null,
                }))
            );
            if (insError) {
                // ROLLBACK: yeni kayıt başarısız → eski hizmetleri geri yükle
                if (oldServices && oldServices.length > 0) {
                    await supabase.from('services').insert(
                        oldServices.map((s: any) => ({
                            user_id: s.user_id,
                            organization_id: s.organization_id,
                            name: s.name,
                            duration: s.duration,
                            color: s.color,
                            price: s.price ?? null,
                        }))
                    );
                }
                toast.error('Hizmetler kaydedilemedi — önceki haline döndürüldü');
                console.error('Error inserting services:', insError);
                return;
            }
        }

        const { data: servicesData } = await supabase
            .from('services')
            .select('*')
            .eq('user_id', user.id)
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
    const checkConflict = useCallback((date: string, startTime: string, endTime: string, excludeId?: string, staffId?: string): Reservation | null => {
        const startMin = timeToMinutes(startTime);
        const endMin = timeToMinutes(endTime);

        const conflict = reservations.find(r => {
            if (r.id === excludeId) return false;
            if (r.date !== date) return false;
            if (r.status === 'cancelled') return false;
            // Personel seçildiyse sadece aynı personelin randevularını kontrol et
            if (staffId && r.staffId && r.staffId !== staffId) return false;

            const rStart = timeToMinutes(r.startTime);
            const rEnd = timeToMinutes(r.endTime);

            return startMin < rEnd && rStart < endMin;
        });

        return conflict || null;
    }, [reservations]);

    const sendWebhook = fireWebhook;

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

// ─── Paylaşılan kaynak (Context) ─────────────────────────────────────────────
// Tüm uygulamada TEK fetch / TEK state. Provider mantığı bir kez çalıştırır;
// her sayfa aynı veriyi okur ve anında senkron kalır.
export type ReservationsContextValue = ReturnType<typeof useReservationsState>;

export const ReservationsContext = createContext<ReservationsContextValue | null>(null);

// Provider'ın kullanacağı iç state hook'u
export { useReservationsState };

// Tüketici hook — sayfalar bunu çağırmaya devam eder (imza birebir aynı)
export function useReservations(): ReservationsContextValue {
    const ctx = useContext(ReservationsContext);
    if (!ctx) {
        throw new Error('useReservations, <ReservationsProvider> içinde kullanılmalıdır');
    }
    return ctx;
}
