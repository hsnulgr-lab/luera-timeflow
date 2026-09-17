/**
 * Müdürün hesap ve işletme bilgisinin VERİTABANI → EKRAN çevirisi. Saf.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo, react-native ya da
 * Supabase bağımlılığı TAŞIMAZ.
 *
 * Canlı kipte işletme kartı iki uydurma bilgi taşıyordu:
 *   • KONUM yerine adres satırının yerinde `slug` ("studio-ayla-kadikoy")
 *   • PERSONEL sayısı her salonda 0
 * İkisi de salon seçme ekranında, profilde ve giriş ekranlarında görünüyordu.
 */

import type { AuthBusiness } from '../api/authStub';

/**
 * Sektörün ADI — masaüstünün `sectorProfiles` etiketleri. Testi iki tabloyu
 * karşılaştırıyor; biri değişirse öteki kırılır. Kod ("kuafor") ekrana
 * hiçbir zaman yazılmıyor.
 */
export const SECTOR_LABELS: Readonly<Record<string, string>> = {
    genel: 'Genel',
    guzellik: 'Güzellik / Salon',
    kuafor: 'Kuaför',
    berber: 'Berber',
    estetik: 'Estetik Kliniği',
    dis: 'Diş Hekimi',
    saglik: 'Sağlık / Klinik',
    fizyoterapi: 'Fizyoterapi',
    tattoo: 'Tattoo / Piercing Stüdyosu',
    avukat: 'Avukatlık Bürosu',
    danismanlik: 'Danışmanlık / Koçluk',
    gym: 'Gym / PT',
    gelinlikci: 'Gelinlikçi',
    restoran: 'Restoran / Kafe',
};

/** Bilinmeyen sektör kodu ekrana ÇIKMIYOR — boş dönüyor. */
export function sectorLabel(code: unknown): string | undefined {
    return typeof code === 'string' ? SECTOR_LABELS[code] : undefined;
}

/**
 * Adresin KISA hâli — ilçe.
 *
 * Adres serbest metin ("Caferağa Mah. Moda Cad. No:5, Kadıköy/İstanbul").
 * Kart tek satırda "Kadıköy" diyebilsin diye son virgülden sonrası alınıyor,
 * "/İl" kısmı atılıyor. Bu kalıba uymayan adres KISALTILMIYOR ve kısa değilse
 * hiç yazılmıyor: uzun bir adresin rastgele bir parçasını konum diye
 * göstermektense boş bırakmak dürüst.
 */
export const LOCATION_MAX = 28;

export function locationOf(address: unknown): string {
    const raw = typeof address === 'string' ? address.trim() : '';
    if (!raw) return '';
    const tail = raw.includes(',') ? raw.slice(raw.lastIndexOf(',') + 1).trim() : raw;
    const district = tail.includes('/') ? tail.slice(0, tail.indexOf('/')).trim() : tail;
    if (district && district.length <= LOCATION_MAX && (raw.includes(',') || raw.includes('/'))) {
        return district;
    }
    return raw.length <= LOCATION_MAX ? raw : '';
}

export function initialsOfBusiness(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2)
        .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
        .join('');
}

export interface OrgRow {
    id: string;
    name: string;
    address?: string | null;
    owner_id?: string | null;
}

export interface SettingsSectorRow {
    organization_id: string;
    user_id: string | null;
    sector: string | null;
    created_at: string | null;
    business_name?: string | null;
}

/**
 * Org satırları + aktif personel + ayar satırları → işletme kartları.
 *
 * Sektör, org SAHİBİNİN ayar satırından (yoksa en eskisinden) — okuma
 * katmanının `fetchOrgSettings` kuralıyla aynı; aynı salon iki ekranda iki
 * farklı sektör söylemesin.
 *
 * `subscriptionStatus` her zaman `active`: abonelik Core'da ve telefon onu
 * okumuyor. Sahte bir "süresi doldu" rozeti çizmemek için tek doğru değer.
 */
export function businessesOf(
    orgs: readonly OrgRow[],
    activeStaff: readonly { organization_id: string }[],
    settings: readonly SettingsSectorRow[],
): AuthBusiness[] {
    const counts = new Map<string, number>();
    for (const member of activeStaff) {
        counts.set(member.organization_id, (counts.get(member.organization_id) ?? 0) + 1);
    }
    return orgs.map((org) => {
        const rows = settings.filter((row) => row.organization_id === org.id);
        const owner = rows.find((row) => org.owner_id && row.user_id === org.owner_id);
        const oldest = [...rows].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))[0];
        /*
         * SALONUN ADI `settings.business_name`'den.
         *
         * `organizations.name`'i yalnız kayıt tetikleyicisi yazıyor ve oraya
         * E-POSTAYI koyuyor (migration 006); masaüstünde salon adı
         * değiştirildiğinde ayar satırı güncelleniyor, org satırına
         * dokunulmuyor. Telefon org satırını okuduğu için müdür kendi
         * salonunu "furkan@..." diye görüyordu. Ayar satırı okunamazsa org
         * adına düşülür — adsız bir salon çizmektense e-posta bile yeğdir.
         */
        const stored = (owner ?? oldest)?.business_name;
        const name = String(stored ?? '').trim() || org.name;
        const business: AuthBusiness = {
            id: org.id,
            name,
            location: locationOf(org.address),
            initials: initialsOfBusiness(name),
            staffCount: counts.get(org.id) ?? 0,
            subscriptionStatus: 'active',
        };
        const sector = sectorLabel((owner ?? oldest)?.sector);
        if (sector) business.sector = sector;
        return business;
    });
}

/** "Studio Ayla · Kadıköy" — boş parça ARAYA ayraç sokmuyor. */
export function businessLine(business: Pick<AuthBusiness, 'name' | 'location'>, separator = ' · '): string {
    return [business.name, business.location].map((part) => part.trim()).filter(Boolean).join(separator);
}

/** Kartın alt satırı: "Kadıköy · 6 personel" — konum yoksa yalnız sayı. */
export function businessMeta(business: Pick<AuthBusiness, 'location' | 'staffCount'>): string {
    return [business.location.trim(), `${business.staffCount} personel`].filter(Boolean).join(' · ');
}

export interface DeletionFactsInput {
    role: string | null;
    owners: number;
    appointments: number;
    customers: number;
    services: number;
    staff: string[];
}

/**
 * Silme ekranının sayıları.
 *
 * `soleManager` sunucunun kuralı: org'un TEK SAHİBİ bu kişiyse silme işletmenin
 * tamamını götürüyor (`account-delete`: `owners.length <= 1`). Sahip değilse
 * sunucu silmeyi reddediyor; ekran bunu önceden bilsin diye `canDeleteRole`.
 */
export function deletionFactsOf(input: DeletionFactsInput): {
    soleManager: boolean; canDeleteRole: boolean;
    appointments: number; customers: number; services: number; staff: string[];
} {
    const owner = input.role === 'owner';
    return {
        soleManager: owner && input.owners <= 1,
        canDeleteRole: owner,
        appointments: input.appointments,
        customers: input.customers,
        services: input.services,
        staff: input.staff,
    };
}
