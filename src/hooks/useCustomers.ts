import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import { todayISO, toISODate } from '@/utils/date';
import type { Customer } from '@/types';

interface CustomerDbRow {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    total_reservations?: number | null;
    last_visit?: string | null;
    notes?: string | null;
    loyalty_stamps?: number | null;
    custom_fields?: Record<string, string | number | boolean> | null;
    recall_date?: string | null;
    created_at: string;
}

interface ReservationMetricRow {
    customer_id: string | null;
    date: string;
    start_time?: string | null;
    status?: string | null;
    service_ended_at?: string | null;
}

interface CustomerDbUpdates {
    updated_at: string;
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
    custom_fields?: Record<string, string | number | boolean>;
    recall_date?: string | null;
}

type CustomerMetrics = Pick<Customer,
    'totalReservations' | 'lastVisit' | 'nextAppointment' | 'nextAppointmentTime'>;

function rememberCustomerMetrics(
    snapshots: Map<string, Map<string, CustomerMetrics>>,
    organizationId: string,
    customerList: Customer[],
) {
    // Listede artık görünmeyen (ör. arşivlenen) hastanın son sağlam geçmişini de
    // bellekte tut. Kayıt geri getirilirse zenginleştirme tamamlanana kadar bu
    // değerler kullanılabilir.
    const organizationMetrics = snapshots.get(organizationId) || new Map<string, CustomerMetrics>();
    for (const customer of customerList) {
        organizationMetrics.set(customer.id, {
            totalReservations: customer.totalReservations,
            lastVisit: customer.lastVisit,
            nextAppointment: customer.nextAppointment,
            nextAppointmentTime: customer.nextAppointmentTime,
        });
    }
    snapshots.set(organizationId, organizationMetrics);
}

function mapDbCustomer(row: CustomerDbRow): Customer {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email || undefined,
        totalReservations: row.total_reservations || 0,
        lastVisit: row.last_visit || undefined,
        notes: row.notes || '',
        loyaltyStamps: row.loyalty_stamps ?? 0,
        customFields: row.custom_fields || {},
        recallDate: row.recall_date || undefined,
        createdAt: row.created_at,
    };
}

export function useCustomers() {
    const { user, orgId } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const requestGenerationRef = useRef(0);
    const isMountedRef = useRef(false);
    const activeOrgRef = useRef(orgId);
    const requestedOrgRef = useRef<string | null>(null);
    const metricSnapshotsRef = useRef(new Map<string, Map<string, CustomerMetrics>>());

    // Render ile org değiştiği anda eski isteğin sonucu geçersiz sayılsın. Effect'i
    // beklemek, hızlı hesap değişiminde eski organizasyon verisinin kısa süreliğine
    // yeni ekrana yazılmasına izin verebilir.
    activeOrgRef.current = orgId;

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            requestGenerationRef.current += 1;
        };
    }, []);

    // ─── Müşterileri getir (N+1 fix: 3 sorgu → 1 sorgu) ─────────────────────
    const fetchCustomers = useCallback(async (resolvedOrgId: string) => {
        const requestGeneration = ++requestGenerationRef.current;
        const organizationChanged = requestedOrgRef.current !== resolvedOrgId;
        requestedOrgRef.current = resolvedOrgId;
        const isCurrentRequest = () => isMountedRef.current
            && requestGenerationRef.current === requestGeneration
            && activeOrgRef.current === resolvedOrgId;

        // SWR: önce son bilinen liste, arkada ağdan tazele
        const cacheKey = `customers:${resolvedOrgId}`;
        const cached = readCache<Customer[]>(cacheKey);
        if (cached) {
            rememberCustomerMetrics(metricSnapshotsRef.current, resolvedOrgId, cached);
            if (isCurrentRequest()) {
                setCustomers(cached);
                setIsLoading(false);
            }
        } else if (isCurrentRequest()) {
            if (organizationChanged) setCustomers([]);
            setIsLoading(true);
        }

        // Müşterileri getir
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (!isCurrentRequest()) return;

        if (error) {
            toast.error('Müşteriler yüklenemedi');
            console.error('Error fetching customers:', error);
            setIsLoading(false);
            return;
        }

        const customerList = (data || []) as CustomerDbRow[];
        if (customerList.length === 0) {
            setCustomers([]);
            writeCache(cacheKey, []);
            setIsLoading(false);
            return;
        }

        // Tüm müşteri ID'leri için rezervasyonları tek sorguda getir (N+1 fix)
        const customerIds = customerList.map(customer => customer.id);
        const { data: reservations, error: reservationsError } = await supabase
            .from('reservations')
            .select('customer_id, date, start_time, status, service_ended_at')
            .in('customer_id', customerIds)
            .order('date', { ascending: false });

        if (!isCurrentRequest()) return;

        if (reservationsError) {
            // Rezervasyon zenginleştirmesi başarısız olduğunda `reservations || []`
            // ile devam etmek tüm geçmişi sıfırlayıp sağlam cache'i bozuyordu. Temel
            // hasta kaydını tazele, ancak son bilinen metrikleri koru ve bu kısmi
            // sonucu cache'e yazma; sonraki refetch gerçek geçmişi yeniden hesaplar.
            const cachedById = new Map((cached || []).map(customer => [customer.id, customer]));
            const rememberedById = metricSnapshotsRef.current.get(resolvedOrgId);
            const customersWithPreservedMetrics = customerList.map(row => {
                const base = mapDbCustomer(row);
                const previous = rememberedById?.get(base.id) || cachedById.get(base.id);
                return {
                    ...base,
                    totalReservations: previous?.totalReservations ?? base.totalReservations,
                    lastVisit: previous?.lastVisit ?? base.lastVisit,
                    nextAppointment: previous?.nextAppointment,
                    nextAppointmentTime: previous?.nextAppointmentTime,
                };
            });

            console.error('Error fetching customer reservations:', reservationsError);
            toast.error('Randevu geçmişi yüklenemedi; mevcut metrikler korundu');
            setCustomers(customersWithPreservedMetrics);
            setIsLoading(false);
            return;
        }

        // JS'de toplam randevu, son tamamlanan ziyaret ve sıradaki randevuyu hesapla.
        // Gelecekteki bir randevu hiçbir zaman "son ziyaret" sayılmaz.
        const countMap = new Map<string, number>();
        const lastVisitMap = new Map<string, { date: string; sortKey: string }>();
        const nextAppointmentMap = new Map<string, { date: string; time?: string; sortKey: string }>();
        const today = todayISO();
        const now = new Date();
        const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        for (const res of (reservations || []) as ReservationMetricRow[]) {
            if (!res.customer_id) continue;
            countMap.set(res.customer_id, (countMap.get(res.customer_id) || 0) + 1);

            const startTime = res.start_time?.slice(0, 5) || undefined;

            if (res.status === 'completed') {
                // service_ended_at, mevcut şemadaki gerçek tamamlanma zamanıdır.
                // Eski kayıtlarda yoksa randevu tarihini kullanırız; iki durumda da
                // gelecek tarihleri ziyaret geçmişine sokmayız.
                const endedAt = res.service_ended_at ? new Date(res.service_ended_at) : null;
                const hasValidEndedAt = !!endedAt && !Number.isNaN(endedAt.getTime());
                const completedDate = hasValidEndedAt ? toISODate(endedAt) : res.date;
                const isCompletedInPast = hasValidEndedAt
                    ? endedAt.getTime() <= now.getTime()
                    : res.date <= today;
                if (isCompletedInPast) {
                    const sortKey = hasValidEndedAt
                        ? endedAt.toISOString()
                        : `${res.date}T${startTime || '23:59'}:00`;
                    const current = lastVisitMap.get(res.customer_id);
                    if (!current || sortKey > current.sortKey) {
                        lastVisitMap.set(res.customer_id, { date: completedDate, sortKey });
                    }
                }
            }

            const isUpcoming = res.status !== 'completed'
                && res.status !== 'cancelled'
                && (res.date > today || (res.date === today && (!startTime || startTime >= nowTime)));
            if (isUpcoming) {
                const sortKey = `${res.date}T${startTime || '23:59'}:00`;
                const current = nextAppointmentMap.get(res.customer_id);
                if (!current || sortKey < current.sortKey) {
                    nextAppointmentMap.set(res.customer_id, { date: res.date, time: startTime, sortKey });
                }
            }
        }

        const enriched: Customer[] = customerList.map(c => ({
            ...mapDbCustomer(c),
            totalReservations: countMap.get(c.id) || 0,
            lastVisit: lastVisitMap.get(c.id)?.date,
            nextAppointment: nextAppointmentMap.get(c.id)?.date,
            nextAppointmentTime: nextAppointmentMap.get(c.id)?.time,
        }));

        setCustomers(enriched);
        rememberCustomerMetrics(metricSnapshotsRef.current, resolvedOrgId, enriched);
        writeCache(cacheKey, enriched);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) {
            void fetchCustomers(orgId);
        } else {
            // Çıkış/org değişimi sırasında devam eden istek artık state yazamaz.
            requestGenerationRef.current += 1;
            requestedOrgRef.current = null;
            setCustomers([]);
            setIsLoading(false);
        }
    }, [user, orgId, fetchCustomers]);

    // Race condition guard: aynı anda iki ekleme isteği gönderilmesini engeller
    const addingRef = useRef(false);

    // ─── Müşteri ekle ────────────────────────────────────────────────────────
    const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'createdAt' | 'totalReservations'>) => {
        if (!user || !orgId) {
            toast.error('Organizasyon bilgisi alınamadı. Lütfen sayfayı yenileyin.');
            return null;
        }
        if (addingRef.current) return null;
        addingRef.current = true;

        try {
            // Telefon numarası duplicate kontrolü
            const normalizedPhone = customer.phone.replace(/\s+/g, '').trim();
            const { data: existing } = await supabase
                .from('customers')
                .select('id, name, is_active')
                .eq('organization_id', orgId)
                .eq('phone', normalizedPhone)
                .order('is_active', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (existing) {
                if (existing.is_active !== false) {
                    toast.error(`Bu numara zaten kayıtlı: ${existing.name}`);
                    return null;
                }

                // Yeni randevu alan arşivlenmiş hastayı ikinci bir kayıt açmak
                // yerine geri getir; deep-link detay paneli de böylece boş kalmaz.
                const { data: restored, error: restoreError } = await supabase
                    .from('customers')
                    .update({
                        is_active: true,
                        name: customer.name,
                        email: customer.email || null,
                        notes: customer.notes || '',
                        ...(customer.customFields ? { custom_fields: customer.customFields } : {}),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                if (restoreError || !restored) {
                    toast.error('Arşivlenmiş müşteri geri getirilemedi');
                    console.error('Error restoring customer:', restoreError);
                    return null;
                }
                const restoredBase = mapDbCustomer(restored);
                const cachedCustomer = readCache<Customer[]>(`customers:${orgId}`)
                    ?.find(item => item.id === restoredBase.id);
                const rememberedCustomer = metricSnapshotsRef.current.get(orgId)?.get(restoredBase.id);
                const previousMetrics = rememberedCustomer || cachedCustomer;
                const restoredCustomer: Customer = {
                    ...restoredBase,
                    totalReservations: previousMetrics?.totalReservations ?? restoredBase.totalReservations,
                    lastVisit: previousMetrics?.lastVisit ?? restoredBase.lastVisit,
                    nextAppointment: previousMetrics?.nextAppointment,
                    nextAppointmentTime: previousMetrics?.nextAppointmentTime,
                };
                if (isMountedRef.current && activeOrgRef.current === orgId) {
                    setCustomers(prev => [restoredCustomer, ...prev.filter(c => c.id !== restoredCustomer.id)]);
                    // Arşivdeyken de var olan randevuları yeniden hesapla; optimistik
                    // satır gerçek geçmiş yüklenene kadar DB/cache değerlerini korur.
                    void fetchCustomers(orgId);
                }
                return restoredCustomer;
            }

            const { data, error } = await supabase
                .from('customers')
                .insert({
                    user_id: user.id,
                    organization_id: orgId,
                    name: customer.name,
                    phone: normalizedPhone,
                    email: customer.email || null,
                    notes: customer.notes || '',
                    // 050 uygulanmadan kolonu göndermeyelim — boşken eklemek gereksiz
                    ...(customer.customFields && Object.keys(customer.customFields).length
                        ? { custom_fields: customer.customFields } : {}),
                })
                .select()
                .single();

            if (error) {
                // UNIQUE constraint ihlali — iki tab aynı anda ekledi
                if (error.code === '23505') {
                    toast.error('Bu telefon numarası zaten kayıtlı');
                } else {
                    toast.error('Müşteri eklenemedi');
                    console.error('Error adding customer:', error);
                }
                return null;
            }

            const newCust: Customer = { ...mapDbCustomer(data), totalReservations: 0 };
            if (isMountedRef.current && activeOrgRef.current === orgId) {
                setCustomers(prev => [newCust, ...prev]);
            }
            return newCust;
        } finally {
            addingRef.current = false;
        }
    }, [user, orgId, fetchCustomers]);

    // ─── Müşteri güncelle ────────────────────────────────────────────────────
    const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>): Promise<boolean> => {
        const dbUpdates: CustomerDbUpdates = { updated_at: new Date().toISOString() };

        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone.replace(/\s+/g, '').trim();
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
        if (updates.customFields !== undefined) dbUpdates.custom_fields = updates.customFields;
        if (updates.recallDate !== undefined) dbUpdates.recall_date = updates.recallDate || null;

        const { error } = await supabase
            .from('customers')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            toast.error('Müşteri güncellenemedi');
            console.error('Error updating customer:', error);
            return false;
        }

        setCustomers(prev => prev.map(c => c.id === id ? {
            ...c,
            ...updates,
            ...(updates.phone !== undefined ? { phone: dbUpdates.phone } : {}),
        } : c));
        return true;
    }, []);

    // ─── Müşteri sil (soft delete) ───────────────────────────────────────────
    const deleteCustomer = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('customers')
            .update({ is_active: false })
            .eq('id', id);

        if (error) {
            toast.error('Müşteri silinemedi');
            console.error('Error deleting customer:', error);
            return;
        }

        setCustomers(prev => prev.filter(c => c.id !== id));
        toast.success('Müşteri arşivlendi');
    }, []);

    // ─── Sadakat ödülü kullan (damgayı eşik kadar düşür) ─────────────────────
    const redeemLoyalty = useCallback(async (id: string, threshold: number) => {
        const cust = customers.find(c => c.id === id);
        const current = cust?.loyaltyStamps ?? 0;
        if (current < threshold) { toast.error('Yeterli damga yok'); return; }
        const next = current - threshold;
        const { error } = await supabase.from('customers').update({ loyalty_stamps: next }).eq('id', id);
        if (error) { toast.error('Ödül kullanılamadı'); console.error(error); return; }
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, loyaltyStamps: next } : c));
        toast.success('Ödül kullanıldı 🎉');
    }, [customers]);

    // ─── Arama filtresi (memoized) ───────────────────────────────────────────
    const filteredCustomers = useMemo(() => {
        if (!searchQuery) return customers;
        const q = searchQuery.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.email && c.email.toLowerCase().includes(q))
        );
    }, [customers, searchQuery]);

    return {
        customers: filteredCustomers,
        allCustomers: customers,
        searchQuery,
        setSearchQuery,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        redeemLoyalty,
        isLoading,
        refetch: () => { if (orgId) fetchCustomers(orgId); },
    };
}
