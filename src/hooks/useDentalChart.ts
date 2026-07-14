import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { DentalRecord, DentalStatus, DentalRecordType, ToothSurface } from '@/types';

function mapRow(row: any): DentalRecord {
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
    const [records, setRecords] = useState<DentalRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAll = useCallback(async (cid: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('dental_records')
            .select('*')
            .eq('customer_id', cid)
            .order('created_at', { ascending: true });
        if (error) { toast.error('Diş şeması yüklenemedi'); console.error(error); }
        else setRecords((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (!customerId) { setRecords([]); setIsLoading(false); return; }
        fetchAll(customerId);
    }, [customerId, fetchAll]);

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
        setRecords((p) => [...p, mapRow(data)]);
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
        if (!key) { setByCustomer(new Map()); setIsLoading(false); return; }
        let alive = true;
        setIsLoading(true);
        supabase.from('dental_records').select('*').in('customer_id', key.split(',')).order('created_at', { ascending: true })
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
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const currentFor = useCallback((customerId: string) => {
        const recs = byCustomer.get(customerId) || [];
        const map = new Map<number, DentalRecord>();
        for (const r of recs) if (r.recordType !== 'planned') map.set(r.toothNumber, r);
        return map;
    }, [byCustomer]);

    return { byCustomer, currentFor, isLoading };
}
