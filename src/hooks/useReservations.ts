import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { todayISO, toISODate } from '@/utils/date';
import { sendTextMessage, buildRebookMessage } from '@/services/evolutionApi';
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
    if (!time || !time.includes(':')) return 0;
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
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
        source: row.source || 'manual',
        isPaid: row.is_paid ?? false,
        arrivedAt: row.arrived_at || undefined,
        customerArrivedAt: row.customer_arrived_at || undefined,
        serviceEndedAt: row.service_ended_at || undefined,
        adisyonItems: Array.isArray(row.adisyon_items) ? row.adisyon_items : [],
        groupId: row.group_id || undefined,
    };
}

// Ağır mantık — yalnızca Provider içinde BİR KEZ çalışır
function useReservationsState() {
    const { user, orgId } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);

    // Webhook URL'yi ref'te tut — CRUD callback'leri stale closure olmadan erişsin
    const webhookUrlRef = useRef<string | undefined>(undefined);
    useEffect(() => { webhookUrlRef.current = settings.webhookUrl; }, [settings.webhookUrl]);

    // ─── Standart webhook gönderici ──────────────────────────────────────────
    const fireWebhook = useCallback((event: string, payload: object) => {
        const url = webhookUrlRef.current;
        if (!url) return;
        const body = JSON.stringify({
            event,
            source: 'timeflow',
            timestamp: new Date().toISOString(),
            data: payload,
        });
        // Fire-and-forget with 8s timeout — UI'ı bloklamaz, hata sessizce loglanır
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
        })
            .catch(err => console.error('Webhook error:', err))
            .finally(() => clearTimeout(timer));
    }, []);

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

        // Son 90 gün + gelecekteki tüm rezervasyonlar; 1000-satır truncation'ı engeller
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoff = ninetyDaysAgo.toISOString().slice(0, 10);

        const { data, error } = await query
            .gte('date', cutoff)
            .order('date', { ascending: false })
            .order('start_time', { ascending: true })
            .limit(500);

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
        const { data: settingsData, error: settingsErr } = await supabase
            .from('settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (settingsErr) {
            console.error('Ayarlar yüklenemedi:', settingsErr);
            toast.error('Ayarlar yüklenemedi');
        }

        // Servisler org bazlı paylaşılır — aynı organizasyondaki tüm kullanıcılar
        // aynı hizmet kataloğunu görür (RLS de organization_id'ye dayanır).
        const { data: servicesData, error: servicesErr } = resolvedOrgId
            ? await supabase
                .from('services')
                .select('*')
                .eq('organization_id', resolvedOrgId)
                .order('created_at')
            : { data: [], error: null };

        if (servicesErr) {
            console.error('Hizmetler yüklenemedi:', servicesErr);
        }

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
                sector: settingsData.sector || 'genel',
                managerPin: settingsData.manager_pin || undefined,
                loyaltyEnabled: settingsData.loyalty_enabled ?? false,
                loyaltyThreshold: settingsData.loyalty_threshold ?? 10,
                loyaltyReward: settingsData.loyalty_reward || 'Ücretsiz hizmet',
                rebookEnabled: settingsData.rebook_enabled ?? false,
                rebookNote: settingsData.rebook_note || '',
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

    // ─── Yükleme + Real-time subscription ────────────────────────────────────
    useEffect(() => {
        if (!user || !orgId) return;

        fetchReservations(orgId);
        fetchSettings(orgId);

        // Aynı org'daki tüm değişiklikleri dinle — çoklu kullanıcı desteği.
        // Tam tabloyu yeniden çekmek yerine değişen satırı doğrudan state'e merge
        // ediyoruz — websocket gecikmesinin üstüne ekstra round-trip binmesin diye
        // (eski hâli ~500 satırlık join'li bir SELECT'i her event'te tetikliyordu).
        const channel = supabase
            .channel(`reservations:${orgId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'reservations', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setReservations(prev => prev.filter(r => r.id !== oldId));
                        return;
                    }

                    const rawRow = payload.new as any;
                    const newId = rawRow?.id;
                    if (!newId) return;

                    // staff(name,color) join'i postgres_changes payload'ında gelmiyor —
                    // anında göstermek için aynı staffId'ye sahip mevcut bir satırdan
                    // local olarak doldur (round-trip yok); sonra tek satırlık düzeltme
                    // sorgusuyla kesinleştir.
                    setReservations(prev => {
                        const fallbackStaff = rawRow.staff_id
                            ? prev.find(r => r.staffId === rawRow.staff_id)
                            : undefined;
                        const mapped = mapDbReservation(rawRow);
                        if (fallbackStaff) {
                            mapped.staffName = mapped.staffName ?? fallbackStaff.staffName;
                            mapped.staffColor = mapped.staffColor ?? fallbackStaff.staffColor;
                        }
                        const exists = prev.some(r => r.id === newId);
                        return exists
                            ? prev.map(r => r.id === newId ? mapped : r)
                            : [mapped, ...prev];
                    });

                    // Fire-and-forget: staff adı/rengi dahil kesin veriyi getir ve düzelt.
                    supabase
                        .from('reservations')
                        .select('*, staff(name, color)')
                        .eq('id', newId)
                        .single()
                        .then(({ data, error }) => {
                            if (error || !data) return;
                            const corrected = mapDbReservation(data);
                            setReservations(prev => prev.map(r => r.id === newId ? corrected : r));
                        });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Rezervasyon ekle ────────────────────────────────────────────────────
    const addReservation = useCallback(async (reservation: Omit<Reservation, 'id' | 'createdAt'>) => {
        if (!user) return null;

        if (!orgId) {
            toast.error('Organizasyon bilgisi alınamadı. Lütfen sayfayı yenileyin.');
            return null;
        }

        // Temel validasyon
        if (!reservation.customerName?.trim()) {
            toast.error('Müşteri adı gerekli');
            return null;
        }
        if (!reservation.date || !reservation.startTime || !reservation.endTime) {
            toast.error('Tarih ve saat alanları gerekli');
            return null;
        }
        if (timeToMinutes(reservation.endTime) <= timeToMinutes(reservation.startTime)) {
            toast.error('Bitiş saati başlangıç saatinden sonra olmalı');
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
                group_id: reservation.groupId || null,
                recurrence_rule:  reservation.recurrenceRule || null,
                recurrence_until: reservation.recurrenceUntil || null,
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
        if (updates.isPaid !== undefined) dbUpdates.is_paid = updates.isPaid;
        // staff_name/staff_color kolonu yok — ad ve renk select'teki staff() join'inden gelir
        if (updates.staffId !== undefined) dbUpdates.staff_id = updates.staffId ?? null;
        if (updates.arrivedAt !== undefined) dbUpdates.arrived_at = updates.arrivedAt;
        if (updates.customerArrivedAt !== undefined) dbUpdates.customer_arrived_at = updates.customerArrivedAt;
        if (updates.serviceEndedAt !== undefined) dbUpdates.service_ended_at = updates.serviceEndedAt;
        if (updates.adisyonItems !== undefined) dbUpdates.adisyon_items = updates.adisyonItems;

        const { data: serverRow, error } = await supabase
            .from('reservations')
            .update(dbUpdates)
            .eq('id', id)
            .select('*, staff(name, color)')
            .single();

        if (error) {
            toast.error('Rezervasyon güncellenemedi');
            console.error('Error updating reservation:', error);
            return;
        }

        if (!serverRow) {
            // Başka bir tab/kullanıcı bu rezervasyonu silmiş olabilir; listeyi yenile
            toast.error('Rezervasyon bulunamadı, liste yenileniyor');
            fetchReservations(orgId!);
            return;
        }
        // Server'dan gelen satırı kullan — trigger/default değerleri korunur
        const updated = mapDbReservation(serverRow);
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

        // Boşluk doldurma: panelden iptal → bekleyenleri bilgilendir (fire-and-forget)
        if (updates.status === 'cancelled' && (serverRow as any).organization_id) {
            supabase.functions.invoke('notify-waitlist', {
                body: { organization_id: (serverRow as any).organization_id, date: updated.date },
            }).catch(() => {});
        }

        // Sıradaki Randevu Otomasyonu: tamamlanınca WhatsApp ile tekrar-randevu daveti
        // (idempotent: rebook_sent; gönderim başarılıysa işaretlenir)
        if (updates.status === 'completed' && !(serverRow as any).rebook_sent
            && settings.rebookEnabled && settings.whatsappInstance && updated.customerPhone) {
            (async () => {
                let bookingUrl = '';
                const { data: org } = await supabase.from('organizations')
                    .select('slug').eq('id', (serverRow as any).organization_id).maybeSingle();
                if (org?.slug) bookingUrl = `${window.location.origin}/book/${org.slug}`;
                const msg = buildRebookMessage({
                    customerName: updated.customerName,
                    service: updated.service,
                    businessName: settings.businessName,
                    note: settings.rebookNote,
                    bookingUrl,
                });
                const ok = await sendTextMessage(settings.whatsappInstance!, updated.customerPhone, msg);
                if (ok) await supabase.from('reservations').update({ rebook_sent: true }).eq('id', id);
            })().catch(() => {});
        }
    }, [reservations, fireWebhook, fetchReservations, orgId, settings]);

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
                sector: newSettings.sector || 'genel',
                manager_pin: newSettings.managerPin || null,
                loyalty_enabled: newSettings.loyaltyEnabled ?? false,
                loyalty_threshold: newSettings.loyaltyThreshold ?? 10,
                loyalty_reward: newSettings.loyaltyReward || 'Ücretsiz hizmet',
                rebook_enabled: newSettings.rebookEnabled ?? false,
                rebook_note: newSettings.rebookNote || '',
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (settingsError) {
            toast.error('Ayarlar kaydedilemedi');
            console.error('Error updating settings:', settingsError);
            return;
        }

        // Hizmetleri diff-upsert ile güncelle — mevcut ID'ler KORUNUR.
        // Eski "tümünü sil + yeniden ekle" yaklaşımı her kayıtta servis ID'lerini
        // değiştiriyor, böylece rezervasyon referansları ve geçmiş bütünlüğü
        // bozulabiliyordu. Artık sadece eklenen/değişen/kaldırılan satırlara dokunulur.
        const { data: existingRows, error: exErr } = await supabase
            .from('services').select('id').eq('organization_id', orgId);
        if (exErr) {
            toast.error('Hizmetler güncellenemedi');
            console.error('Error reading services:', exErr);
            return;
        }

        // DB'de gerçekten var olan ID'ler — varsayılan ('1'..'5') ID'ler buraya girmez,
        // dolayısıyla onlar otomatik olarak "yeni satır" (insert) sayılır.
        const existingIds = new Set((existingRows || []).map((r: any) => r.id as string));
        const toUpdate = newSettings.services.filter(s => existingIds.has(s.id));
        const toInsert = newSettings.services.filter(s => !existingIds.has(s.id));
        const keepIds = new Set(toUpdate.map(s => s.id));
        const toDelete = [...existingIds].filter(id => !keepIds.has(id));

        // 1) Kaldırılan hizmetleri sil
        if (toDelete.length > 0) {
            const { error } = await supabase.from('services').delete().in('id', toDelete);
            if (error) {
                toast.error('Hizmetler güncellenemedi');
                console.error('Error deleting services:', error);
                return;
            }
        }

        // 2) Mevcut hizmetleri güncelle (ID korunur)
        for (const s of toUpdate) {
            const { error } = await supabase
                .from('services')
                .update({ name: s.name, duration: s.duration, color: s.color, price: s.price || null })
                .eq('id', s.id);
            if (error) {
                toast.error('Hizmetler güncellenemedi');
                console.error('Error updating service:', error);
                return;
            }
        }

        // 3) Yeni hizmetleri ekle (ID'yi DB üretir)
        if (toInsert.length > 0) {
            const { error } = await supabase.from('services').insert(
                toInsert.map(s => ({
                    user_id: user.id,
                    organization_id: orgId,
                    name: s.name,
                    duration: s.duration,
                    color: s.color,
                    price: s.price || null,
                }))
            );
            if (error) {
                toast.error('Hizmetler kaydedilemedi');
                console.error('Error inserting services:', error);
                return;
            }
        }

        const { data: servicesData } = await supabase
            .from('services')
            .select('*')
            .eq('organization_id', orgId)
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

    // ─── Çakışma kontrolü (kaynak = personel bazlı doluluk) ──────────────────
    // Çakışma yalnızca AYNI kaynak içinde geçerlidir:
    //   • Personel seçiliyse → sadece o personelin randevularıyla (farklı
    //     personeller paralel çalışır, çakışma sayılmaz).
    //   • Personel seçili değilse → yalnızca diğer "atanmamış" randevularla
    //     (tek kişilik işletme / walk-in havuzu kendi içinde çakışır).
    // Böylece bir personelin dolu saati başkasının boş saatini bloklamaz.
    const checkConflict = useCallback((date: string, startTime: string, endTime: string, excludeId?: string, staffId?: string): Reservation | null => {
        const startMin = timeToMinutes(startTime);
        const endMin = timeToMinutes(endTime);
        const target = staffId || null;

        const conflict = reservations.find(r => {
            if (r.id === excludeId) return false;
            if (r.date !== date) return false;
            if (r.status === 'cancelled') return false;
            // Yalnızca aynı kaynağı (aynı personel; ya da ikisi de atanmamış) karşılaştır
            if ((r.staffId || null) !== target) return false;

            const rStart = timeToMinutes(r.startTime);
            const rEnd = timeToMinutes(r.endTime);

            return startMin < rEnd && rStart < endMin;
        });

        return conflict || null;
    }, [reservations]);

    return useMemo(() => ({
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
        sendWebhook: fireWebhook,
        refetch: fetchReservations,
        refetchSettings: fetchSettings,
    }), [
        reservations, settings, isLoading, orgId,
        addReservation, updateReservation, deleteReservation,
        getReservationsByDate, getTodayReservations, getUpcomingReservations,
        getStats, updateSettings, checkConflict, fireWebhook, fetchReservations, fetchSettings,
    ]);
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
