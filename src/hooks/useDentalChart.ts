import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { DentalRecord, DentalStatus, DentalRecordType, ToothSurface } from '@/types';

interface DentalRecordDbRow {
    id: string;
    customer_id: string;
    tooth_number: number;
    status: DentalStatus;
    surfaces?: ToothSurface[] | null;
    record_type?: DentalRecordType | null;
    treatment_plan_id?: string | null;
    note?: string | null;
    staff_id?: string | null;
    created_at: string;
}

function mapRow(row: DentalRecordDbRow): DentalRecord {
    return {
        id: row.id,
        customerId: row.customer_id,
        toothNumber: row.tooth_number,
        status: row.status,
        surfaces: row.surfaces || [],
        recordType: row.record_type || 'existing',
        treatmentPlanId: row.treatment_plan_id || undefined,
        note: row.note || undefined,
        staffId: row.staff_id || undefined,
        createdAt: row.created_at,
    };
}

export interface SetToothOptions {
    note?: string;
    staffId?: string;
    surfaces?: ToothSurface[];
    recordType?: DentalRecordType;
    treatmentPlanId?: string;
}

// Hasta başına diş şeması — açık seçili hasta değişince o hastanın kayıtlarını
// çeker. Küçük hacimli, per-customer bir görünüm olduğu için SWR/realtime
// gerekmiyor (customer paneli her açılışta zaten taze veri ister).
export function useDentalChart(customerId: string | undefined) {
    const { orgId } = useAuth();
    const [result, setResult] = useState<{
        customerId: string | undefined;
        records: DentalRecord[];
    }>({ customerId: undefined, records: [] });

    useEffect(() => {
        if (!customerId) return;
        let alive = true;
        const timer = window.setTimeout(() => {
            void supabase
                .from('dental_records')
                .select('*')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: true })
                .then(({ data, error }) => {
                    if (!alive) return;
                    if (error) {
                        toast.error('Diş şeması yüklenemedi');
                        console.error(error);
                        setResult({ customerId, records: [] });
                        return;
                    }
                    setResult({ customerId, records: (data || []).map(mapRow) });
                });
        }, 0);
        return () => {
            alive = false;
            window.clearTimeout(timer);
        };
    }, [customerId]);

    // Hasta değiştiği anda önceki hastanın kayıtlarını bir kare dahi gösterme.
    // Yeni sorgu tamamlanana kadar görünüm boş/yükleniyor kalır.
    const records = useMemo(
        () => result.customerId === customerId ? result.records : [],
        [customerId, result.customerId, result.records],
    );
    const isLoading = Boolean(customerId && result.customerId !== customerId);

    // Diş numarası → en güncel kayıt (append-only log kronolojik geldiği için son yazan kalır).
    // Planlanan (planned) kayıtlar mevcut durumu EZMEZ — ayrı haritada tutulur.
    const current = useMemo(() => {
        const map = new Map<number, DentalRecord>();
        for (const r of records) if (r.recordType !== 'planned') map.set(r.toothNumber, r);
        return map;
    }, [records]);

    // Diş numarası → bekleyen planlı işlem (varsa en günceli)
    const planned = useMemo(() => {
        const map = new Map<number, DentalRecord>();
        for (const r of records) if (r.recordType === 'planned') map.set(r.toothNumber, r);
        // Plan sonrası aynı dişe 'existing' kaydı düşülmüşse plan gerçekleşmiş sayılır
        for (const [n, p] of map) {
            const cur = current.get(n);
            if (cur && cur.createdAt > p.createdAt && cur.status === p.status) map.delete(n);
        }
        return map;
    }, [records, current]);

    // Diş numarası → kronolojik geçmiş (en yeni önce)
    const historyFor = useCallback(
        (toothNumber: number) => records.filter((r) => r.toothNumber === toothNumber).slice().reverse(),
        [records],
    );

    const setTooth = useCallback(async (toothNumber: number, status: DentalStatus, opts: SetToothOptions = {}) => {
        if (!orgId || !customerId) return false;
        const { data, error } = await supabase.from('dental_records').insert({
            organization_id: orgId, customer_id: customerId, tooth_number: toothNumber,
            status, note: opts.note || null, staff_id: opts.staffId || null,
            surfaces: opts.surfaces || [],
            record_type: opts.recordType || 'existing',
            treatment_plan_id: opts.treatmentPlanId || null,
        }).select().single();
        if (error) { toast.error('Diş durumu kaydedilemedi'); console.error(error); return false; }
        setResult((previous) => previous.customerId === customerId
            ? { ...previous, records: [...previous.records, mapRow(data)] }
            : previous);
        return true;
    }, [orgId, customerId]);

    return { current, planned, history: records, historyFor, isLoading, setTooth };
}

// Birden çok hasta için tek sorguda diş şeması özeti (dashboard "bugün gelen
// hastalar" kartı gibi yerler) — hook sayısı sabit kalsın diye hasta başına
// useDentalChart çağırmak yerine tek .in() sorgusu kullanılır.
export function useDentalChartsForCustomers(customerIds: string[]) {
    const [byCustomer, setByCustomer] = useState<Map<string, DentalRecord[]>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const key = [...new Set(customerIds)].sort().join(',');

    useEffect(() => {
        let alive = true;
        const timer = window.setTimeout(() => {
            if (!key) { setByCustomer(new Map()); setIsLoading(false); return; }
            setIsLoading(true);
            void supabase.from('dental_records').select('*').in('customer_id', key.split(',')).order('created_at', { ascending: true })
                .then(({ data, error }) => {
                    if (!alive) return;
                    if (error) { console.error(error); setIsLoading(false); return; }
                    const map = new Map<string, DentalRecord[]>();
                    for (const row of (data || [])) {
                        const rec = mapRow(row);
                        const arr = map.get(rec.customerId) || [];
                        arr.push(rec);
                        map.set(rec.customerId, arr);
                    }
                    setByCustomer(map);
                    setIsLoading(false);
                });
        }, 0);
        return () => { alive = false; window.clearTimeout(timer); };
    }, [key]);

    const currentFor = useCallback((customerId: string) => {
        const recs = byCustomer.get(customerId) || [];
        const map = new Map<number, DentalRecord>();
        for (const r of recs) if (r.recordType !== 'planned') map.set(r.toothNumber, r);
        return map;
    }, [byCustomer]);

    return { byCustomer, currentFor, isLoading };
}
