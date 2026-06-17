import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgProfile {
    slug: string;
    bio: string;
    logoUrl: string;
    coverUrl: string;
    galleryUrls: string[];
    address: string;
    publicPhone: string;
    instagramUrl: string;
    mapsUrl: string;
    bookingAutoConfirm: boolean;
}

const EMPTY: OrgProfile = {
    slug: '', bio: '', logoUrl: '', coverUrl: '', galleryUrls: [],
    address: '', publicPhone: '', instagramUrl: '', mapsUrl: '', bookingAutoConfirm: false,
};

function mapRow(row: any): OrgProfile {
    return {
        slug: row.slug || '',
        bio: row.bio || '',
        logoUrl: row.logo_url || '',
        coverUrl: row.cover_url || '',
        galleryUrls: row.gallery_urls || [],
        address: row.address || '',
        publicPhone: row.public_phone || '',
        instagramUrl: row.instagram_url || '',
        mapsUrl: row.maps_url || '',
        bookingAutoConfirm: !!row.booking_auto_confirm,
    };
}

// kullanıcı girdisini güvenli slug'a çevir
export function slugify(s: string): string {
    return (s || '')
        .toLowerCase()
        .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' } as Record<string, string>)[c] || c)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function useOrgProfile() {
    const { orgId } = useAuth();
    const [profile, setProfile] = useState<OrgProfile>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        (async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('organizations')
                .select('slug, bio, logo_url, cover_url, gallery_urls, address, public_phone, instagram_url, maps_url, booking_auto_confirm')
                .eq('id', orgId)
                .maybeSingle();
            if (!error && data) setProfile(mapRow(data));
            setLoading(false);
        })();
    }, [orgId]);

    const save = useCallback(async (p: OrgProfile): Promise<boolean> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return false; }
        setSaving(true);
        const { error } = await supabase
            .from('organizations')
            .update({
                slug: p.slug || null,
                bio: p.bio || null,
                logo_url: p.logoUrl || null,
                cover_url: p.coverUrl || null,
                gallery_urls: p.galleryUrls,
                address: p.address || null,
                public_phone: p.publicPhone || null,
                instagram_url: p.instagramUrl || null,
                maps_url: p.mapsUrl || null,
                booking_auto_confirm: p.bookingAutoConfirm,
            })
            .eq('id', orgId);
        setSaving(false);
        if (error) {
            if (error.code === '23505') toast.error('Bu randevu adresi (slug) başka bir işletmede kullanılıyor');
            else { toast.error('Booking profili kaydedilemedi'); console.error(error); }
            return false;
        }
        setProfile(p);
        return true;
    }, [orgId]);

    // Görsel yükle → public URL döndür
    const uploadImage = useCallback(async (file: File, prefix: 'logo' | 'cover' | 'gallery'): Promise<string | null> => {
        if (!orgId) return null;
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${orgId}/${prefix}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('org-public').upload(path, file, { upsert: true, cacheControl: '3600' });
        if (error) { toast.error('Görsel yüklenemedi'); console.error(error); return null; }
        const { data } = supabase.storage.from('org-public').getPublicUrl(path);
        return data.publicUrl;
    }, [orgId]);

    return { profile, setProfile, loading, saving, save, uploadImage };
}
