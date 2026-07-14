import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { installmentDueDate, splitInstallmentAmounts } from '@/lib/installmentSchedule';
import { useAuth } from '@/contexts/AuthContext';
import type { InstallmentCadence, TreatmentInstallment } from '@/types';

export interface CreateInstallmentScheduleInput {
    planId: string;
    customerId: string;
    totalAmount: number;
    count: number;
    firstDueDate: string;
    cadence: InstallmentCadence;
}

interface InstallmentRow {
    id: string;
    organization_id: string;
    customer_id: string;
    treatment_plan_id: string;
    sequence_no: number | string;
    due_date: string;
    amount: number | string;
    created_at: string;
}

function mapRow(row: InstallmentRow): TreatmentInstallment {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerId: row.customer_id,
        treatmentPlanId: row.treatment_plan_id,
        sequenceNo: Number(row.sequence_no),
        dueDate: row.due_date,
        amount: Number(row.amount),
        createdAt: row.created_at,
    };
}

function isMissingInstallmentsTable(error: { code?: string; message?: string; details?: string } | null): boolean {
    if (!error) return false;
    const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return error.code === '42P01'
        || error.code === 'PGRST205'
        || (message.includes('treatment_installments')
            && (message.includes('does not exist') || message.includes('could not find') || message.includes('schema cache')));
}

export function useInstallmentSchedules(planIds: string[]) {
    const { orgId } = useAuth();
    const key = useMemo(() => [...new Set(planIds.filter(Boolean))].sort().join(','), [planIds]);
    const [installments, setInstallments] = useState<TreatmentInstallment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [available, setAvailable] = useState<boolean | null>(null);

    const fetchAll = useCallback(async () => {
        if (!key) { setInstallments([]); setIsLoading(false); return; }
        setIsLoading(true);
        const { data, error } = await supabase
            .from('treatment_installments')
            .select('*')
            .in('treatment_plan_id', key.split(','))
            .order('sequence_no', { ascending: true });
        if (error) {
            if (isMissingInstallmentsTable(error)) {
                setAvailable(false);
                setInstallments([]);
            } else {
                console.error('Error fetching installment schedules:', error);
                toast.error('Taksit planı yüklenemedi');
            }
        } else {
            setAvailable(true);
            setInstallments((data || []).map(mapRow));
        }
        setIsLoading(false);
    }, [key]);

    useEffect(() => {
        // Ağ çağrısını effect'in senkron render zincirinden ayır; hızlı plan
        // değişimlerinde eski timer temizlenir.
        const timer = window.setTimeout(() => { void fetchAll(); }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchAll]);

    const createSchedule = useCallback(async (input: CreateInstallmentScheduleInput) => {
        if (!orgId || available !== true) return null;
        const count = Math.trunc(input.count);
        const totalCents = Math.round(input.totalAmount * 100);
        if (!Number.isFinite(input.count) || count < 2 || count > 24) {
            toast.error('Taksit sayısı 2–24 arasında olmalı');
            return null;
        }
        if (!Number.isSafeInteger(totalCents) || totalCents < count || !/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueDate)) {
            toast.error('Taksit tutarı veya ilk vade geçersiz');
            return null;
        }
        if (installments.some((item) => item.treatmentPlanId === input.planId)) {
            toast.error('Bu planın taksit vadeleri zaten oluşturulmuş');
            return null;
        }

        let rows: Array<{
            organization_id: string;
            customer_id: string;
            treatment_plan_id: string;
            sequence_no: number;
            due_date: string;
            amount: number;
        }>;
        try {
            const amounts = splitInstallmentAmounts(input.totalAmount, count);
            rows = Array.from({ length: count }, (_, index) => ({
                organization_id: orgId,
                customer_id: input.customerId,
                treatment_plan_id: input.planId,
                sequence_no: index + 1,
                due_date: installmentDueDate(input.firstDueDate, index, input.cadence),
                amount: amounts[index],
            }));
        } catch {
            toast.error('Taksit tutarı veya ilk vade geçersiz');
            return null;
        }

        const { data, error } = await supabase
            .from('treatment_installments')
            .insert(rows)
            .select();
        if (error) {
            if (isMissingInstallmentsTable(error)) setAvailable(false);
            else if (error.code === '23505') toast.error('Bu planın taksit vadeleri zaten oluşturulmuş');
            else if (`${error.message || ''} ${error.details || ''}`.includes('treatment_schedule_exceeds_plan_balance')) {
                toast.error('Plan bakiyesi değişti; ödeme ve vadeleri yenileyip tekrar deneyin');
            } else { console.error('Error creating installment schedule:', error); toast.error('Taksit planı oluşturulamadı'); }
            return null;
        }
        const created = (data || []).map(mapRow).sort((a, b) => a.sequenceNo - b.sequenceNo);
        setInstallments((prev) => [...prev.filter((item) => !created.some((row) => row.id === item.id)), ...created]);
        toast.success(`${created.length} taksit ve vade oluşturuldu`);
        return created;
    }, [available, installments, orgId]);

    return { installments, isLoading, available: available === true, createSchedule, refetch: fetchAll };
}
