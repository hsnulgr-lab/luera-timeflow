import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/swrCache';
import { useAuth } from '@/contexts/AuthContext';

// Paket şablonları ("Paket tanımları") — satış drawer'ının kaynağı. 069 ile tablo.
export interface PackageTemplate {
    id: string;
    name: string;
    sessionCount: number;
    price: number;
    color?: string;
    validityMonths?: number;
    isActive: boolean;
    createdAt: string;
}

export interface TemplateInput {
    name: string;
    sessionCount: number;
    price: number;
    color?: string;
    validityMonths?: number;
}

function mapRow(row: Record<string, unknown>): PackageTemplate {
    return {
        id: String(row.id),
        name: String(row.name),
        sessionCount: Math.max(1, Number(row.session_count ?? 1) || 1),
        price: Number(row.price ?? 0),
        color: (row.color as string) || undefined,
        validityMonths: row.validity_months != null ? Number(row.validity_months) : undefined,
        isActive: row.is_active !== false,
        createdAt: String(row.created_at),
    };
}

export function usePackageTemplates() {
    const { orgId } = useAuth();
    const [templates, setTemplates] = useState<PackageTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const busyRef = useRef(false);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        const { data, error } = await supabase.from('package_templates')
            .select('*').eq('organization_id', orgId).eq('is_active', true)
            .order('created_at', { ascending: false });
        if (error) { console.error('Paket tanımları yüklenemedi:', error); setIsLoading(false); return; }
        const rows = (data || []).map(mapRow);
        setTemplates(rows);
        writeCache(`pkg-templates:${orgId}`, rows);
        setIsLoading(false);
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const cached = readCache<PackageTemplate[]>(`pkg-templates:${orgId}`);
        if (cached) { setTemplates(cached); setIsLoading(false); }
        void refresh();
        const ch = supabase
            .channel(`pkg-templates:${orgId}:${Math.random().toString(36).slice(2)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'package_templates', filter: `organization_id=eq.${orgId}` },
                () => { void refresh(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [orgId, refresh]);

    const addTemplate = useCallback(async (input: TemplateInput): Promise<boolean> => {
        if (!orgId || busyRef.current || !input.name.trim()) return false;
        busyRef.current = true;
        try {
            const { error } = await supabase.from('package_templates').insert({
                organization_id: orgId,
                name: input.name.trim(),
                session_count: Math.min(50, Math.max(1, Math.round(input.sessionCount))),
                price: Math.max(0, Math.round(input.price)),
                color: input.color || null,
                validity_months: input.validityMonths || null,
            });
            if (error) { console.error(error); return false; }
            await refresh();
            return true;
        } finally { busyRef.current = false; }
    }, [orgId, refresh]);

    const updateTemplate = useCallback(async (id: string, input: TemplateInput): Promise<boolean> => {
        if (!orgId) return false;
        const { error } = await supabase.from('package_templates').update({
            name: input.name.trim(),
            session_count: Math.min(50, Math.max(1, Math.round(input.sessionCount))),
            price: Math.max(0, Math.round(input.price)),
            color: input.color || null,
            validity_months: input.validityMonths || null,
            updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) { console.error(error); return false; }
        await refresh();
        return true;
    }, [orgId, refresh]);

    // Silme = pasifleştir (satılmış paketlerin şablon izini korumak için soft delete)
    const removeTemplate = useCallback(async (id: string): Promise<boolean> => {
        const { error } = await supabase.from('package_templates').update({ is_active: false }).eq('id', id);
        if (error) { console.error(error); return false; }
        await refresh();
        return true;
    }, [refresh]);

    return { templates, isLoading, refresh, addTemplate, updateTemplate, removeTemplate };
}
