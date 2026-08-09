// Personel yetkileri — edge tarafındaki AYNA.
//
// Kaynak `src/lib/staffPermissions.ts`. Neden kopya: edge fonksiyonları yalnız
// `supabase/functions/` altını görüyor (deploy scripti orayı rsync'liyor);
// `src/` sunucuya hiç gitmiyor. İçe aktarmak mümkün değil.
//
// finance.ts ile aynı desen: kopya var ama SESSİZ DEĞİL — tests/staff-api
// testi iki dosyanın rol→yetki haritasını karşılaştırıyor, ayrışırlarsa kırılır.
//
// Yalnız kumandanın ihtiyaç duyduğu yetkiler burada. Tam liste (diş şeması,
// tedavi planı) sunucuda gerekmiyor; gerektiğinde eklenir.

export type StaffRole = 'doctor' | 'assistant' | 'cashier' | 'staff';

export type StaffPermission =
    | 'appointments:view-own'
    | 'appointments:view-all'
    | 'appointments:create'
    | 'appointments:update-own'
    | 'appointments:update-all'
    | 'patients:view'
    | 'patients:edit'
    | 'payments:view'
    | 'payments:collect';

export const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
    doctor: [
        'appointments:view-own', 'appointments:create', 'appointments:update-own',
        'patients:view', 'patients:edit', 'payments:view', 'payments:collect',
    ],
    assistant: [
        'appointments:view-all', 'appointments:create', 'appointments:update-all',
        'patients:view', 'patients:edit',
    ],
    cashier: [
        'appointments:view-all', 'patients:view', 'payments:view', 'payments:collect',
    ],
    staff: [
        'appointments:view-own', 'appointments:update-own', 'patients:view',
    ],
};

export function roleOf(raw: string | null | undefined): StaffRole {
    return raw === 'doctor' || raw === 'assistant' || raw === 'cashier' ? raw : 'staff';
}

export function can(role: string | null | undefined, perm: StaffPermission): boolean {
    return ROLE_PERMISSIONS[roleOf(role)].includes(perm);
}

/**
 * Bu personel bu randevuya dokunabilir mi?
 *
 * "Kendi randevusu" kuralı SUNUCUDA uygulanır. Arayüz zaten yalnız kendi
 * randevularını gösteriyor ama gösterim bir güvenlik önlemi değildir: istek
 * elle de atılabilir.
 */
export function canTouchReservation(
    role: string | null | undefined,
    staffId: string,
    reservationStaffId: string | null,
): boolean {
    if (can(role, 'appointments:update-all')) return true;
    return can(role, 'appointments:update-own') && reservationStaffId === staffId;
}
