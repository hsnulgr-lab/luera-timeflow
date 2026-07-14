import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { TreatmentPlan, TreatmentPlanStatus } from '@/types';

export interface TreatmentPlanAttribution {
    staffId?: string;
    reservationId?: string;
    notes?: string;
}

function isMissingAttributionColumn(error: { code?: string; message?: string; details?: string } | null): boolean {
    if (!error) return false;
    const message = String(error.message || error.details || '').toLowerCase();
    return (error.code === 'PGRST204' || error.code === '42703')
        && (message.includes('reservation_id') || message.includes('created_by'));
}

interface TreatmentPlanDbRow {
    id: string;
    customer_id: string;
    title: string;
    total_amount: number | string;
    status: TreatmentPlanStatus;
    staff_id?: string | null;
    reservation_id?: string | null;
    created_by?: string | null;
    notes?: string | null;
    created_at: string;
}

interface PlannedDentalRecordRow {
    customer_id: string;
    tooth_number: number;
    status: string;
    surfaces?: string[] | null;
    note?: string | null;
    staff_id?: string | null;
    created_at: string;
}

interface ExistingPlanDentalRecordRow {
    tooth_number: number;
    created_at: string;
}

function mapRow(row: TreatmentPlanDbRow): TreatmentPlan {
    return {
        id: row.id,
        customerId: row.customer_id,
        title: row.title,
        totalAmount: Number(row.total_amount),
        status: row.status,
        staffId: row.staff_id || undefined,
        reservationId: row.reservation_id || undefined,
        createdBy: row.created_by || undefined,
        notes: row.notes || undefined,
        createdAt: row.created_at,
    };
}

// Hasta başına tedavi planları — çok seanslı tedavilerin (kanal tedavisi vb.)
// toplam ücretini tutar. Taksitler (payments.treatment_plan_id) ayrı hesaplanır;
// bu hook yalnızca planların kendisini yönetir.
export function useTreatmentPlans(customerId: string | undefined) {
    const { user, orgId } = useAuth();
    const [result, setResult] = useState<{
        customerId: string | undefined;
        plans: TreatmentPlan[];
    }>({ customerId: undefined, plans: [] });

    useEffect(() => {
        if (!customerId) return;
        let alive = true;
        const timer = window.setTimeout(() => {
            void supabase
                .from('treatment_plans')
                .select('*')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false })
                .then(({ data, error }) => {
                    if (!alive) return;
                    if (error) {
                        toast.error('Tedavi planları yüklenemedi');
                        console.error(error);
                        setResult({ customerId, plans: [] });
                        return;
                    }
                    setResult({ customerId, plans: (data || []).map(mapRow) });
                });
        }, 0);
        return () => {
            alive = false;
            window.clearTimeout(timer);
        };
    }, [customerId]);

    const plans = result.customerId === customerId ? result.plans : [];
    const isLoading = Boolean(customerId && result.customerId !== customerId);

    const updatePlans = useCallback((update: (plans: TreatmentPlan[]) => TreatmentPlan[]) => {
        setResult((previous) => previous.customerId === customerId
            ? { ...previous, plans: update(previous.plans) }
            : previous);
    }, [customerId]);

    const addPlan = useCallback(async (
        title: string,
        totalAmount: number,
        attribution: TreatmentPlanAttribution = {},
    ) => {
        if (!orgId || !customerId) return null;
        const basePayload = {
            organization_id: orgId, customer_id: customerId, title,
            total_amount: totalAmount,
            staff_id: attribution.staffId || null,
            notes: attribution.notes || null,
        };
        let result = await supabase.from('treatment_plans').insert({
            ...basePayload,
            reservation_id: attribution.reservationId || null,
            created_by: user?.id || null,
        }).select().single();

        // Migration henüz uygulanmamış bir ortamda plan oluşturmayı tamamen
        // kırma. 057 uygulandığında yeni bağlar otomatik olarak yazılır.
        if (isMissingAttributionColumn(result.error)) {
            result = await supabase.from('treatment_plans').insert(basePayload).select().single();
        }
        const { data, error } = result;
        if (error) { toast.error('Tedavi planı oluşturulamadı'); console.error(error); return null; }
        const plan = mapRow(data);
        updatePlans((previous) => [plan, ...previous]);
        return plan;
    }, [orgId, customerId, user?.id, updatePlans]);

    const setPlanStatus = useCallback(async (id: string, status: TreatmentPlanStatus, completedByStaffId?: string) => {
        if (!customerId || !orgId) return false;
        const { data: currentPlan, error: currentPlanError } = await supabase
            .from('treatment_plans')
            .select('status')
            .eq('id', id)
            .eq('customer_id', customerId)
            .single();
        if (currentPlanError || !currentPlan) {
            toast.error('Plan durumu doğrulanamadı');
            return false;
        }
        const previousStatus = currentPlan.status as TreatmentPlanStatus;
        if (previousStatus === status) return true;

        const { data: updatedPlan, error } = await supabase
            .from('treatment_plans')
            .update({ status })
            .eq('id', id)
            .eq('customer_id', customerId)
            .select('id')
            .maybeSingle();
        if (error || !updatedPlan) { toast.error('Plan durumu güncellenemedi'); return false; }
        updatePlans((previous) => previous.map((plan) => (plan.id === id ? { ...plan, status } : plan)));

        const rollbackStatus = async (message: string, cause: unknown) => {
            console.error(cause);
            const { data: rolledBackPlan, error: rollbackError } = await supabase
                .from('treatment_plans')
                .update({ status: previousStatus })
                .eq('id', id)
                .eq('customer_id', customerId)
                .select('id')
                .maybeSingle();
            updatePlans((previous) => previous.map((plan) => (
                plan.id === id ? { ...plan, status: previousStatus } : plan
            )));
            if (rollbackError || !rolledBackPlan) {
                console.error(rollbackError);
                toast.error('Klinik işlem tamamlanamadı; plan durumu yeniden yüklenmelidir');
            } else {
                toast.error(message);
            }
            return false;
        };

        // Plan tamamlandı → şemadaki bu plana bağlı 'planned' kayıtlar gerçekleşmiş
        // sayılır; append-only mantıkla diş başına bir 'existing' kaydı düşülür.
        // Daha önce gerçekleşmiş kaydı bulunan diş atlanır; böylece plan yeniden
        // açılıp tekrar tamamlandığında klinik geçmiş kopyalanmaz.
        if (status === 'completed' && orgId) {
            const { data: plannedRecs, error: plannedError } = await supabase
                .from('dental_records')
                .select('*')
                .eq('treatment_plan_id', id)
                .eq('record_type', 'planned')
                .order('created_at', { ascending: true });
            if (plannedError) return rollbackStatus('Diş şeması okunamadığı için tedavi tamamlanmadı', plannedError);
            if (plannedRecs && plannedRecs.length > 0) {
                const latestPerTooth = new Map<number, PlannedDentalRecordRow>();
                for (const r of plannedRecs as PlannedDentalRecordRow[]) latestPerTooth.set(r.tooth_number, r);
                const { data: existingRecs, error: existingError } = await supabase
                    .from('dental_records')
                    .select('tooth_number, created_at')
                    .eq('treatment_plan_id', id)
                    .eq('record_type', 'existing');
                if (existingError) return rollbackStatus('Diş şeması doğrulanamadığı için tedavi tamamlanmadı', existingError);
                const alreadyCompleted = new Map<number, string>();
                for (const record of (existingRecs || []) as ExistingPlanDentalRecordRow[]) {
                    const latest = alreadyCompleted.get(record.tooth_number);
                    if (!latest || record.created_at > latest) alreadyCompleted.set(record.tooth_number, record.created_at);
                }
                const inserts = [...latestPerTooth.values()]
                    .filter((record) => !alreadyCompleted.has(record.tooth_number)
                        || alreadyCompleted.get(record.tooth_number)! < record.created_at)
                    .map((r) => ({
                    organization_id: orgId, customer_id: r.customer_id, tooth_number: r.tooth_number,
                    status: r.status, surfaces: r.surfaces || [], record_type: 'existing',
                    treatment_plan_id: id, note: r.note, staff_id: r.staff_id || completedByStaffId || null,
                }));
                if (inserts.length > 0) {
                    const { error: syncErr } = await supabase.from('dental_records').insert(inserts);
                    if (syncErr) return rollbackStatus('Diş şeması güncellenemediği için tedavi tamamlanmadı', syncErr);
                    toast.success('Diş şeması güncellendi — planlı işlemler tamamlandı olarak işlendi');
                }
            }
        }
        return true;
    }, [customerId, orgId, updatePlans]);

    const setPlanAttribution = useCallback(async (
        id: string,
        attribution: Pick<TreatmentPlanAttribution, 'staffId' | 'reservationId'>,
    ) => {
        if (!attribution.staffId && !attribution.reservationId) return true;
        const staffPatch = attribution.staffId ? { staff_id: attribution.staffId } : {};
        let result = await supabase.from('treatment_plans').update({
            ...staffPatch,
            ...(attribution.reservationId ? { reservation_id: attribution.reservationId } : {}),
        }).eq('id', id).select().single();

        // Eski şemada reservation_id yoksa en azından sorumlu hekimi kalıcı
        // yaz. Migration sonrasında randevu bağı da aynı işlemde saklanır.
        if (isMissingAttributionColumn(result.error) && attribution.staffId) {
            result = await supabase.from('treatment_plans')
                .update({ staff_id: attribution.staffId })
                .eq('id', id)
                .select().single();
        }
        const { data, error } = result;
        if (error) { toast.error('Plan sorumlusu güncellenemedi'); console.error(error); return false; }
        const updated = mapRow(data);
        updatePlans((previous) => previous.map((plan) => plan.id === id ? updated : plan));
        return true;
    }, [updatePlans]);

    const removePlan = useCallback(async (id: string) => {
        const { error } = await supabase.from('treatment_plans').delete().eq('id', id);
        if (error) { toast.error('Plan silinemedi'); return false; }
        updatePlans((previous) => previous.filter((plan) => plan.id !== id));
        return true;
    }, [updatePlans]);

    return { plans, isLoading, addPlan, setPlanStatus, setPlanAttribution, removePlan };
}
