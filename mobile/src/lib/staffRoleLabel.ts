// Personel rolünün EKRANDA okunan adı — sektöre göre.
//
// Sunucu rolü anahtar olarak tutuyor (`doctor`, `assistant`, `cashier`,
// `staff`) ve giriş listesi bunu olduğu gibi gösteriyordu: kuaförde personel
// kendini "doctor" diye görüyordu. Ad sektörden geliyor — kuaförde Kuaför,
// dişte Hekim, berberde Berber.
//
// Tablo masaüstünün `src/lib/staffPermissions.ts · staffRoleLabel` fonksiyonunun
// ÇIKTISI; `tests/staff-role-label.test.mjs` iki tarafı her sektör × rol için
// karşılaştırıyor. Masaüstünde bir ad değişirse test kırılır.
//
// Saf: import yok.

type Role = 'doctor' | 'assistant' | 'cashier' | 'staff';

const BASE: Record<Role, string> = { doctor: 'Uzman', assistant: 'Asistan', cashier: 'Kasa', staff: 'Personel' };

const BY_SECTOR: Record<string, Partial<Record<Role, string>>> = {
    genel: {},
    guzellik: {},
    kuafor: { doctor: 'Kuaför', assistant: 'Çırak' },
    berber: { doctor: 'Berber', assistant: 'Çırak' },
    estetik: {},
    dis: { doctor: 'Hekim' },
    saglik: { doctor: 'Hekim', assistant: 'Yardımcı personel' },
    fizyoterapi: { doctor: 'Fizyoterapist' },
    tattoo: { doctor: 'Artist' },
    avukat: { doctor: 'Avukat', assistant: 'Katip', cashier: 'Muhasebe' },
    danismanlik: { doctor: 'Danışman' },
    gym: { doctor: 'Antrenör' },
    gelinlikci: { doctor: 'Satış danışmanı', assistant: 'Terzi' },
    restoran: { doctor: 'Şef garson', assistant: 'Garson' },
};

export const ROLE_LABEL_SECTORS = Object.keys(BY_SECTOR);

/** Bilinmeyen rol ya da boş değer "Personel"e düşer; anahtar ASLA ekrana çıkmaz. */
export function staffRoleLabel(role: string | null | undefined, sector?: string | null): string {
    const key = (role ?? '') as Role;
    if (!(key in BASE)) return role?.trim() && !/^[a-z_]+$/.test(role.trim()) ? role.trim() : 'Personel';
    const table = BY_SECTOR[sector ?? ''] ?? BY_SECTOR.genel;
    return table[key] ?? BASE[key];
}
