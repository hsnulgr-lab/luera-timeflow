import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type {
    ClinicalProcedure,
    ClinicalProcedureCategory,
    ClinicalProcedureStatus,
    PatientEncounter,
    PatientEncounterStatus,
    PatientEncounterVisitType,
    ToothSurface,
} from '@/types';

interface PatientEncounterDbRow {
    id: string;
    organization_id: string;
    customer_id: string;
    reservation_id?: string | null;
    attending_staff_id?: string | null;
    visit_type: PatientEncounterVisitType;
    status: PatientEncounterStatus;
    reason_for_visit?: string | null;
    chief_complaint?: string | null;
    diagnosis?: string | null;
    clinical_notes?: string | null;
    checked_in_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
    created_by?: string | null;
    updated_by?: string | null;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown> | null;
}

interface ClinicalProcedureDbRow {
    id: string;
    organization_id: string;
    customer_id: string;
    encounter_id?: string | null;
    reservation_id?: string | null;
    treatment_plan_id?: string | null;
    source_dental_record_id?: string | null;
    category: ClinicalProcedureCategory;
    status: ClinicalProcedureStatus;
    procedure_code?: string | null;
    title: string;
    tooth_number?: number | null;
    surfaces?: ToothSurface[] | null;
    clinical_note?: string | null;
    performed_by_staff_id?: string | null;
    performed_at?: string | null;
    created_by?: string | null;
    updated_by?: string | null;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown> | null;
}

const EMPTY_PROCEDURES: ClinicalProcedure[] = [];

function mapEncounter(row: PatientEncounterDbRow): PatientEncounter {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerId: row.customer_id,
        reservationId: row.reservation_id || undefined,
        attendingStaffId: row.attending_staff_id || undefined,
        visitType: row.visit_type,
        status: row.status,
        reasonForVisit: row.reason_for_visit || undefined,
        chiefComplaint: row.chief_complaint || undefined,
        diagnosis: row.diagnosis || undefined,
        clinicalNotes: row.clinical_notes || undefined,
        checkedInAt: row.checked_in_at || undefined,
        startedAt: row.started_at || undefined,
        completedAt: row.completed_at || undefined,
        cancelledAt: row.cancelled_at || undefined,
        createdBy: row.created_by || undefined,
        updatedBy: row.updated_by || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: row.metadata || {},
    };
}

function mapProcedure(row: ClinicalProcedureDbRow): ClinicalProcedure {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerId: row.customer_id,
        encounterId: row.encounter_id || undefined,
        reservationId: row.reservation_id || undefined,
        treatmentPlanId: row.treatment_plan_id || undefined,
        sourceDentalRecordId: row.source_dental_record_id || undefined,
        category: row.category,
        status: row.status,
        procedureCode: row.procedure_code || undefined,
        title: row.title,
        toothNumber: row.tooth_number ?? undefined,
        surfaces: row.surfaces || [],
        clinicalNote: row.clinical_note || undefined,
        performedByStaffId: row.performed_by_staff_id || undefined,
        performedAt: row.performed_at || undefined,
        createdBy: row.created_by || undefined,
        updatedBy: row.updated_by || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: row.metadata || {},
    };
}

export interface EncounterUpdate {
    status?: PatientEncounterStatus;
    visitType?: PatientEncounterVisitType;
    attendingStaffId?: string | null;
    reasonForVisit?: string | null;
    chiefComplaint?: string | null;
    diagnosis?: string | null;
    clinicalNotes?: string | null;
}

export interface ClinicalProcedureInput {
    category: ClinicalProcedureCategory;
    status: ClinicalProcedureStatus;
    title: string;
    procedureCode?: string;
    toothNumber?: number;
    surfaces?: ToothSurface[];
    clinicalNote?: string;
    treatmentPlanId?: string;
    sourceDentalRecordId?: string;
    performedByStaffId?: string;
    performedAt?: string;
    metadata?: Record<string, unknown>;
}

export interface ClinicalProcedureUpdate {
    status?: ClinicalProcedureStatus;
    title?: string;
    procedureCode?: string | null;
    toothNumber?: number | null;
    surfaces?: ToothSurface[];
    clinicalNote?: string | null;
    treatmentPlanId?: string | null;
    performedByStaffId?: string | null;
    performedAt?: string | null;
    metadata?: Record<string, unknown>;
}

function toEncounterPatch(patch: EncounterUpdate) {
    return {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.visitType !== undefined ? { visit_type: patch.visitType } : {}),
        ...(patch.attendingStaffId !== undefined ? { attending_staff_id: patch.attendingStaffId } : {}),
        ...(patch.reasonForVisit !== undefined ? { reason_for_visit: patch.reasonForVisit } : {}),
        ...(patch.chiefComplaint !== undefined ? { chief_complaint: patch.chiefComplaint } : {}),
        ...(patch.diagnosis !== undefined ? { diagnosis: patch.diagnosis } : {}),
        ...(patch.clinicalNotes !== undefined ? { clinical_notes: patch.clinicalNotes } : {}),
    };
}

function toProcedurePatch(patch: ClinicalProcedureUpdate) {
    return {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.procedureCode !== undefined ? { procedure_code: patch.procedureCode } : {}),
        ...(patch.toothNumber !== undefined ? { tooth_number: patch.toothNumber } : {}),
        ...(patch.surfaces !== undefined ? { surfaces: patch.surfaces } : {}),
        ...(patch.clinicalNote !== undefined ? { clinical_note: patch.clinicalNote } : {}),
        ...(patch.treatmentPlanId !== undefined ? { treatment_plan_id: patch.treatmentPlanId } : {}),
        ...(patch.performedByStaffId !== undefined ? { performed_by_staff_id: patch.performedByStaffId } : {}),
        ...(patch.performedAt !== undefined ? { performed_at: patch.performedAt } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    };
}

function isMissingEncounterSchema(error: { code?: string; message?: string; details?: string } | null): boolean {
    if (!error) return false;
    const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return error.code === '42P01'
        || error.code === '42883'
        || error.code === 'PGRST202'
        || error.code === 'PGRST205'
        || ((message.includes('patient_encounters') || message.includes('ensure_patient_encounter'))
            && (message.includes('does not exist') || message.includes('could not find') || message.includes('schema cache')));
}

// Randevu route'u önce mevcut ziyareti okur; ilk klinik işlemde ensure RPC
// aynı randevuyu atomik ve idempotent biçimde oluşturur. expectedCustomerId,
// URL ile randevu/hasta bağlamının istemcide de yanlış eşleşmesini engeller;
// asıl tenant ve scope doğrulaması 062 trigger'larında sunucu tarafındadır.
export function usePatientEncounter(
    reservationId: string | undefined,
    expectedCustomerId?: string,
) {
    const { orgId } = useAuth();
    const contextKey = orgId && reservationId ? `${orgId}:${reservationId}` : '';
    const requestRef = useRef(0);
    const activeContextKeyRef = useRef(contextKey);
    activeContextKeyRef.current = contextKey;
    const ensurePromiseRef = useRef<{
        key: string;
        promise: Promise<PatientEncounter | null>;
    } | null>(null);
    const [result, setResult] = useState<{
        key: string;
        encounter: PatientEncounter | null;
        procedures: ClinicalProcedure[];
        loaded: boolean;
        available: boolean | null;
    }>({ key: '', encounter: null, procedures: [], loaded: false, available: null });

    const fetchProcedures = useCallback(async (encounterId: string) => {
        const { data, error } = await supabase
            .from('clinical_procedures')
            .select('*')
            .eq('encounter_id', encounterId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return ((data || []) as ClinicalProcedureDbRow[]).map(mapProcedure);
    }, []);

    const refetch = useCallback(async () => {
        if (!orgId || !reservationId || !contextKey) return null;
        const requestId = ++requestRef.current;
        const { data, error } = await supabase
            .from('patient_encounters')
            .select('*')
            .eq('organization_id', orgId)
            .eq('reservation_id', reservationId)
            .maybeSingle();

        if (requestId !== requestRef.current) return null;
        if (error) {
            const missingSchema = isMissingEncounterSchema(error);
            if (!missingSchema) console.error(error);
            setResult({ key: contextKey, encounter: null, procedures: [], loaded: true, available: !missingSchema });
            return null;
        }
        if (!data) {
            setResult({ key: contextKey, encounter: null, procedures: [], loaded: true, available: true });
            return null;
        }

        const encounter = mapEncounter(data as PatientEncounterDbRow);
        if (expectedCustomerId && encounter.customerId !== expectedCustomerId) {
            console.error('Encounter/customer route mismatch');
            setResult({ key: contextKey, encounter: null, procedures: [], loaded: true, available: true });
            return null;
        }

        try {
            const procedures = await fetchProcedures(encounter.id);
            if (requestId === requestRef.current) {
                setResult({ key: contextKey, encounter, procedures, loaded: true, available: true });
            }
        } catch (procedureError) {
            console.error(procedureError);
            if (requestId === requestRef.current) {
                setResult({ key: contextKey, encounter, procedures: [], loaded: true, available: true });
            }
        }
        return encounter;
    }, [contextKey, expectedCustomerId, fetchProcedures, orgId, reservationId]);

    useEffect(() => {
        if (!contextKey) {
            requestRef.current += 1;
            setResult({ key: '', encounter: null, procedures: [], loaded: true, available: null });
            return;
        }
        setResult({ key: contextKey, encounter: null, procedures: [], loaded: false, available: null });
        void refetch();
        return () => { requestRef.current += 1; };
    }, [contextKey, refetch]);

    const ensureEncounter = useCallback(async (visitType?: PatientEncounterVisitType) => {
        if (!orgId || !reservationId || !contextKey) return null;
        const current = result.key === contextKey ? result.encounter : null;
        if (current) return current;
        if (result.key === contextKey && result.available === false) return null;
        if (ensurePromiseRef.current?.key === contextKey) return ensurePromiseRef.current.promise;

        const promise = (async () => {
            const { data, error } = await supabase
                .rpc('ensure_patient_encounter', {
                    p_organization_id: orgId,
                    p_reservation_id: reservationId,
                    p_visit_type: visitType || null,
                })
                .single();
            if (error || !data) {
                const missingSchema = isMissingEncounterSchema(error);
                if (missingSchema && activeContextKeyRef.current === contextKey) {
                    setResult({ key: contextKey, encounter: null, procedures: [], loaded: true, available: false });
                } else {
                    console.error(error);
                    toast.error('Hasta ziyareti açılamadı');
                }
                return null;
            }
            const encounter = mapEncounter(data as PatientEncounterDbRow);
            if (expectedCustomerId && encounter.customerId !== expectedCustomerId) {
                toast.error('Randevu ile hasta dosyası eşleşmiyor');
                return null;
            }

            let procedures: ClinicalProcedure[] = [];
            try {
                procedures = await fetchProcedures(encounter.id);
            } catch (procedureError) {
                console.error(procedureError);
            }
            if (activeContextKeyRef.current === contextKey) {
                setResult({ key: contextKey, encounter, procedures, loaded: true, available: true });
            }
            return encounter;
        })();

        ensurePromiseRef.current = { key: contextKey, promise };
        try {
            return await promise;
        } finally {
            if (ensurePromiseRef.current?.promise === promise) ensurePromiseRef.current = null;
        }
    }, [contextKey, expectedCustomerId, fetchProcedures, orgId, reservationId, result.available, result.encounter, result.key]);

    const updateEncounter = useCallback(async (patch: EncounterUpdate) => {
        const current = (result.key === contextKey ? result.encounter : null) || await ensureEncounter();
        if (!current || !orgId) return false;
        const { data, error } = await supabase
            .from('patient_encounters')
            .update(toEncounterPatch(patch))
            .eq('id', current.id)
            .eq('organization_id', orgId)
            .eq('customer_id', current.customerId)
            .select('*')
            .maybeSingle();
        if (error || !data) {
            console.error(error);
            toast.error('Muayene kaydı güncellenemedi');
            return false;
        }
        const encounter = mapEncounter(data as PatientEncounterDbRow);
        setResult((previous) => previous.key === contextKey ? { ...previous, encounter } : previous);
        return true;
    }, [contextKey, ensureEncounter, orgId, result.encounter, result.key]);

    const updateNotes = useCallback((chiefComplaint: string, clinicalNotes: string) => (
        updateEncounter({ chiefComplaint, clinicalNotes })
    ), [updateEncounter]);

    const updateClinicalSummary = useCallback((summary: Pick<
        EncounterUpdate,
        'chiefComplaint' | 'diagnosis' | 'clinicalNotes'
    >) => updateEncounter(summary), [updateEncounter]);

    const setStatus = useCallback((status: PatientEncounterStatus) => (
        updateEncounter({ status })
    ), [updateEncounter]);

    const addProcedure = useCallback(async (input: ClinicalProcedureInput) => {
        const current = (result.key === contextKey ? result.encounter : null) || await ensureEncounter();
        if (!current || !orgId) return null;
        const { data, error } = await supabase.from('clinical_procedures').insert({
            organization_id: orgId,
            customer_id: current.customerId,
            encounter_id: current.id,
            reservation_id: current.reservationId || reservationId || null,
            treatment_plan_id: input.treatmentPlanId || null,
            source_dental_record_id: input.sourceDentalRecordId || null,
            category: input.category,
            status: input.status,
            procedure_code: input.procedureCode || null,
            title: input.title,
            tooth_number: input.toothNumber ?? null,
            surfaces: input.surfaces || [],
            clinical_note: input.clinicalNote || null,
            performed_by_staff_id: input.performedByStaffId || current.attendingStaffId || null,
            performed_at: input.performedAt || null,
            metadata: input.metadata || {},
        }).select('*').single();
        if (error || !data) {
            console.error(error);
            toast.error('Klinik işlem kaydedilemedi');
            return null;
        }
        const procedure = mapProcedure(data as ClinicalProcedureDbRow);
        setResult((previous) => previous.key === contextKey
            ? { ...previous, procedures: [...previous.procedures, procedure] }
            : previous);
        return procedure;
    }, [contextKey, ensureEncounter, orgId, reservationId, result.encounter, result.key]);

    const updateProcedure = useCallback(async (id: string, patch: ClinicalProcedureUpdate) => {
        const current = result.key === contextKey ? result.encounter : null;
        if (!current || !orgId) return false;
        const { data, error } = await supabase
            .from('clinical_procedures')
            .update(toProcedurePatch(patch))
            .eq('id', id)
            .eq('organization_id', orgId)
            .eq('customer_id', current.customerId)
            .eq('encounter_id', current.id)
            .select('*')
            .maybeSingle();
        if (error || !data) {
            console.error(error);
            toast.error('Klinik işlem güncellenemedi');
            return false;
        }
        const procedure = mapProcedure(data as ClinicalProcedureDbRow);
        setResult((previous) => previous.key === contextKey
            ? {
                ...previous,
                procedures: previous.procedures.map((item) => item.id === id ? procedure : item),
            }
            : previous);
        return true;
    }, [contextKey, orgId, result.encounter, result.key]);

    const encounter = result.key === contextKey ? result.encounter : null;
    const procedures = result.key === contextKey ? result.procedures : EMPTY_PROCEDURES;
    const isLoading = Boolean(contextKey && (result.key !== contextKey || !result.loaded));
    const available = result.key === contextKey ? result.available : null;

    return useMemo(() => ({
        encounter,
        procedures,
        isLoading,
        available,
        ensureEncounter,
        refetch,
        updateEncounter,
        updateNotes,
        updateClinicalSummary,
        setStatus,
        addProcedure,
        updateProcedure,
    }), [
        addProcedure,
        available,
        encounter,
        ensureEncounter,
        isLoading,
        procedures,
        refetch,
        setStatus,
        updateEncounter,
        updateClinicalSummary,
        updateNotes,
        updateProcedure,
    ]);
}
