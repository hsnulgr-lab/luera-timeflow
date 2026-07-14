import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { TreatmentPlan, TreatmentPlanStatus } from '@/types';

function mapRow(row: any): TreatmentPlan {
    return {
        id: row.id,
        customerId: row.customer_id,
        title: row.title,
        totalAmount: Number(row.total_amount),
        status: row.status,
        staffId: row.staff_id || undefined,
        notes: row.notes || undefined,
        createdAt: row.created_at,
    };
}

// Hasta başına tedavi planları — çok seanslı tedavilerin (kanal tedavisi vb.)
// toplam ücretini tutar. Taksitler (payments.treatment_plan_id) ayrı hesaplanır;
// bu hook yalnızca planların kendisini yönetir.
export function useTreatmentPlans(customerId: string | undefined) {
    const { orgId } = useAuth();
    const [plans, setPlans] = useState<TreatmentPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAll = useCallback(async (cid: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('treatment_plans')
            .select('*')
            .eq('customer_id', cid)
            .order('created_at', { ascending: false });
        if (error) { toast.error('Tedavi planları yüklenemedi'); console.error(error); }
        else setPlans((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (!customerId) { setPlans([]); setIsLoading(false); return; }
        fetchAll(customerId);
    }, [customerId, fetchAll]);

    const addPlan = useCallback(async (title: string, totalAmount: number, staffId?: string, notes?: string) => {
        if (!orgId || !customerId) return null;
        const { data, error } = await supabase.from('treatment_plans').insert({
            organization_id: orgId, customer_id: customerId, title,
            total_amount: totalAmount, staff_id: staffId || null, notes: notes || null,
        }).select().single();
        if (error) { toast.error('Tedavi planı oluşturulamadı'); console.error(error); return null; }
        const plan = mapRow(data);
        setPlans((p) => [plan, ...p]);
        return plan;
    }, [orgId, customerId]);

    const setPlanStatus = useCallback(async (id: string, status: TreatmentPlanStatus) => {
        const { error } = await supabase.from('treatment_plans').update({ status }).eq('id', id);
        if (error) { toast.error('Plan durumu güncellenemedi'); return false; }
        setPlans((p) => p.map((pl) => (pl.id === id ? { ...pl, status } : pl)));

        // Plan tamamlandı → şemadaki bu plana bağlı 'planned' kayıtlar gerçekleşmiş
        // sayılır; append-only mantıkla diş başına bir 'existing' kaydı düşülür.
        if (status === 'completed' && orgId) {
            const { data: plannedRecs } = await supabase
                .from('dental_records')
                .select('*')
                .eq('treatment_plan_id', id)
                .eq('record_type', 'planned')
                .order('created_at', { ascending: true });
            if (plannedRecs && plannedRecs.length > 0) {
                const latestPerTooth = new Map<number, any>();
                for (const r of plannedRecs) latestPerTooth.set(r.tooth_number, r);
                const inserts = [...latestPerTooth.values()].map((r) => ({
                    organization_id: orgId, customer_id: r.customer_id, tooth_number: r.tooth_number,
                    status: r.status, surfaces: r.surfaces || [], record_type: 'existing',
                    treatment_plan_id: id, note: r.note, staff_id: r.staff_id,
                }));
                const { error: syncErr } = await supabase.from('dental_records').insert(inserts);
                if (syncErr) console.error(syncErr);
                else toast.success('Diş şeması güncellendi — planlı işlemler tamamlandı olarak işlendi');
            }
        }
        return true;
    }, [orgId]);

    const removePlan = useCallback(async (id: string) => {
        const { error } = await supabase.from('treatment_plans').delete().eq('id', id);
        if (error) { toast.error('Plan silinemedi'); return false; }
        setPlans((p) => p.filter((pl) => pl.id !== id));
        return true;
    }, []);

    return { plans, isLoading, addPlan, setPlanStatus, removePlan };
}
