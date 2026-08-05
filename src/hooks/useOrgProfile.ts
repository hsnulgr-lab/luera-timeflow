import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';

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
    /** Google değerlendirme (yorum yaz) linki — yol tarifinden AYRI URL. */
    googleReviewUrl: string;
    /**
     * İşletmenin yayınladığı KVKK aydınlatma metninin adresi. Randevu
     * sayfasındaki rıza kutusunun yanında bağlantı olarak çıkar; boşsa yalnız
     * rıza metni görünür. Metin ürüne gömülmez — veri sorumlusu işletmedir.
     */
    kvkkUrl: string;
    /** "Sizi özledik" mesajıyla verilen indirim oranı; 0 = indirim yok. */
    winbackDiscountPercent: number;
    /** İndirim kodu kaç gün geçerli; 0 = süresiz. */
    winbackDiscountDays: number;
    bookingAutoConfirm: boolean;
}

const EMPTY: OrgProfile = {
    slug: '', bio: '', logoUrl: '', coverUrl: '', galleryUrls: [],
    address: '', publicPhone: '', instagramUrl: '', mapsUrl: '', googleReviewUrl: '', kvkkUrl: '',
    winbackDiscountPercent: 0, winbackDiscountDays: 30, bookingAutoConfirm: false,
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
        googleReviewUrl: row.google_review_url || '',
        kvkkUrl: row.kvkk_url || '',
        winbackDiscountPercent: Number(row.winback_discount_percent ?? 0) || 0,
        winbackDiscountDays: Number(row.winback_discount_days ?? 30) || 0,
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
            // SWR: önce son bilinen profil, arkada ağdan tazele
            const cached = readCache<OrgProfile>(`org_profile:${orgId}`);
            if (cached) { setProfile(cached); setLoading(false); } else setLoading(true);
            const { data, error } = await supabase
                .from('organizations')
                .select('slug, bio, logo_url, cover_url, gallery_urls, address, public_phone, instagram_url, maps_url, google_review_url, kvkk_url, winback_discount_percent, winback_discount_days, booking_auto_confirm')
                .eq('id', orgId)
                .maybeSingle();
            if (!error && data) {
                const fresh = mapRow(data);
                setProfile(fresh);
                writeCache(`org_profile:${orgId}`, fresh);
            }
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
                kvkk_url: p.kvkkUrl || null,
                google_review_url: p.googleReviewUrl || null,
                winback_discount_percent: p.winbackDiscountPercent || 0,
                winback_discount_days: p.winbackDiscountDays ?? 30,
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

    // Alan eşlemesi — savePartial yalnız verilen anahtarları yazsın diye.
    const COLUMN_OF: Partial<Record<keyof OrgProfile, string>> = {
        slug: 'slug', bio: 'bio', logoUrl: 'logo_url', coverUrl: 'cover_url',
        galleryUrls: 'gallery_urls', address: 'address', publicPhone: 'public_phone',
        instagramUrl: 'instagram_url', mapsUrl: 'maps_url', kvkkUrl: 'kvkk_url',
        googleReviewUrl: 'google_review_url',
        winbackDiscountPercent: 'winback_discount_percent',
        winbackDiscountDays: 'winback_discount_days',
        bookingAutoConfirm: 'booking_auto_confirm',
    };

    /**
     * Yalnız verilen alanları yazar.
     *
     * `save` profilin TAMAMINI gönderir; bu, profil formunun kendisi için doğru
     * ama iki alanlık bir ayar kutusu için tehlikeli: kanca örneği henüz
     * yüklenmemişse (ya da başka bir sekmede boş kalmışsa) bio/logo/adres gibi
     * alanlar boş değerle ezilir. Kısmi kayıt bu riski tamamen kaldırır.
     */
    const savePartial = useCallback(async (patch: Partial<OrgProfile>): Promise<boolean> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return false; }
        const row: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            const col = COLUMN_OF[key as keyof OrgProfile];
            if (col) row[col] = value;
        }
        if (Object.keys(row).length === 0) return true;

        setSaving(true);
        const { error } = await supabase.from('organizations').update(row).eq('id', orgId);
        setSaving(false);
        if (error) {
            toast.error('Ayar kaydedilemedi');
            console.error('savePartial:', error);
            return false;
        }
        setProfile((prev) => ({ ...prev, ...patch }));
        toast.success('Kaydedildi');
        return true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    return { profile, setProfile, loading, saving, save, savePartial, uploadImage };
}
