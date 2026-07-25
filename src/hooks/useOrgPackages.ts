import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/swrCache';
import { useAuth } from '@/contexts/AuthContext';
import type { TreatmentPlan, TreatmentPlanStatus } from '@/types';

// Yeni paket satışı — güvenli oluşturma girdisi (drawer step 4)
export interface NewPackageInput {
    customerId: string;
    title: string;
    sessionCount: number;   // 1..50 (055/064 DB kısıtı)
    totalAmount: number;    // en küçük birim, tamsayı
    staffId?: string;
    notes?: string;
}

// Paketler sayfası satırı: plan + yenileme teklifi damgası (067)
export interface OrgPackage extends TreatmentPlan {
    renewalOfferedAt?: string;
}

// Güzellik "paket" motoru = treatment_plans'ın org-geneli görünümü.
// Diş tarafındaki hasta-başına useTreatmentPlans'tan farkı: dashboard'ın
// aksiyon kuyruğu ("sonraki seansı planlanmamış", "biten paketler") tüm
// müşterilerin paketlerine tek sorguda bakmak zorunda. Tablo aynı — paket =
// çok seanslı plan (064: session_count/sessions_done), bakiye patientBalance'la
// aynı formülden hesaplanır; yeni tablo/şema YOKTUR.
export function useOrgPackages() {
    const { orgId } = useAuth();
    const [packages, setPackages] = useState<OrgPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        const { data, error } = await supabase
            .from('treatment_plans')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(500);
        if (error) { console.error('Paketler yüklenemedi:', error); setIsLoading(false); return; }
        const rows: OrgPackage[] = (data || []).map((row) => ({
            id: row.id,
            customerId: row.customer_id,
            title: row.title,
            totalAmount: Number(row.total_amount),
            status: row.status as TreatmentPlanStatus,
            staffId: row.staff_id || undefined,
            reservationId: row.reservation_id || undefined,
            notes: row.notes || undefined,
            createdAt: row.created_at,
            sessionCount: Math.max(1, Number(row.session_count ?? 1) || 1),
            sessionsDone: Math.max(0, Number(row.sessions_done ?? 0) || 0),
            renewalOfferedAt: row.renewal_offered_at || undefined,
        }));
        setPackages(rows);
        writeCache(`packages:${orgId}`, rows);
        setIsLoading(false);
    }, [orgId]);

    // SWR: önbellekteki paketleri anında göster (kasa/diğer sayfalar gibi),
    // ardından ağdan tazele — "Henüz paket yok" ve geç yükleme flash'ı biter.
    useEffect(() => {
        if (!orgId) return;
        const cached = readCache<OrgPackage[]>(`packages:${orgId}`);
        if (cached) { setPackages(cached); setIsLoading(false); }
        else { setPackages([]); setIsLoading(true); }
        void refresh();
    }, [orgId, refresh]);

    // Çift satış kilidi: drawer'da "Paketi güvenle oluştur" iki kez tetiklenirse
    // (çift tık / çift enter) ikinci çağrı sessizce düşer — çift paket kaydı olmaz.
    const creatingRef = useRef(false);
    const addPackage = useCallback(async (input: NewPackageInput): Promise<OrgPackage | null> => {
        if (!orgId) return null;
        if (creatingRef.current) return null;
        creatingRef.current = true;
        try {
            const count = Math.min(50, Math.max(1, Math.round(input.sessionCount)));
            const amount = Math.max(0, Math.round(input.totalAmount));
            const { data, error } = await supabase.from('treatment_plans').insert({
                organization_id: orgId,
                customer_id: input.customerId,
                title: input.title.trim(),
                total_amount: amount,
                session_count: count,
                sessions_done: 0,
                status: 'active',
                staff_id: input.staffId || null,
                notes: input.notes || null,
            }).select('*').single();
            if (error || !data) { console.error('Paket oluşturulamadı:', error); return null; }
            await refresh();
            return {
                id: data.id, customerId: data.customer_id, title: data.title,
                totalAmount: Number(data.total_amount), status: data.status as TreatmentPlanStatus,
                staffId: data.staff_id || undefined, reservationId: data.reservation_id || undefined,
                notes: data.notes || undefined, createdAt: data.created_at,
                sessionCount: count, sessionsDone: 0,
                renewalOfferedAt: data.renewal_offered_at || undefined,
            };
        } finally {
            creatingRef.current = false;
        }
    }, [orgId, refresh]);

    // Kayıtlı hak düzeltme — plan sayacını güncelle + append-only deftere yaz.
    // Denklem korunur (used ≤ total). Tek düzeltmede |delta| ≤ 3 (DB kısıtı da var).
    const correctingRef = useRef(false);
    const correctRights = useCallback(async (
        planId: string, field: 'total' | 'used', delta: number, reason: string,
    ): Promise<{ ok: boolean; error?: string }> => {
        if (!orgId) return { ok: false, error: 'Organizasyon yok' };
        if (!reason.trim()) return { ok: false, error: 'Sebep gerekli' };
        if (![-3, -2, -1, 1, 2, 3].includes(delta)) return { ok: false, error: 'En fazla 3 hak düzeltilebilir' };
        if (correctingRef.current) return { ok: false, error: 'İşlem sürüyor' };
        const plan = packages.find((p) => p.id === planId);
        if (!plan) return { ok: false, error: 'Paket bulunamadı' };
        const prev = field === 'total' ? plan.sessionCount : plan.sessionsDone;
        const next = prev + delta;
        if (field === 'total') {
            if (next < 1 || next > 50) return { ok: false, error: 'Toplam hak 1–50 aralığında olmalı' };
            if (next < plan.sessionsDone) return { ok: false, error: `Kullanılan ${plan.sessionsDone} hakkın altına inemez` };
        } else {
            if (next < 0) return { ok: false, error: 'Kullanılan hak negatif olamaz' };
            if (next > plan.sessionCount) return { ok: false, error: `Toplam ${plan.sessionCount} hakkı aşamaz` };
        }
        correctingRef.current = true;
        try {
            const patch = field === 'total'
                ? { session_count: next, ...(plan.sessionsDone >= next ? { status: 'completed' } : { status: 'active' }) }
                : { sessions_done: next, ...(next >= plan.sessionCount ? { status: 'completed' } : { status: 'active' }) };
            const { error: upErr } = await supabase.from('treatment_plans').update(patch).eq('id', planId);
            if (upErr) { console.error(upErr); return { ok: false, error: 'Paket güncellenemedi' }; }
            const { error: logErr } = await supabase.from('package_rights_ledger').insert({
                organization_id: orgId, plan_id: planId, customer_id: plan.customerId,
                field, kind: 'correction', prev_value: prev, new_value: next, delta, reason: reason.trim(),
            });
            if (logErr) console.error('Defter kaydı yazılamadı:', logErr);
            await refresh();
            return { ok: true };
        } finally {
            correctingRef.current = false;
        }
    }, [orgId, packages, refresh]);

    // Realtime — başka cihazda paket satılınca / seans işlenince kuyruk anında
    // tazelensin (068 ile treatment_plans publication'a eklendi). Paket değişimi
    // seyrek olduğundan tam refetch yeterince ucuz ve hesaplanan alanları korur.
    useEffect(() => {
        if (!orgId) return;
        const ch = supabase
            .channel(`org-packages:${orgId}:${Math.random().toString(36).slice(2)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'treatment_plans', filter: `organization_id=eq.${orgId}` },
                () => { void refresh(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [orgId, refresh]);

    return { packages, isLoading, refresh, addPackage, correctRights };
}
