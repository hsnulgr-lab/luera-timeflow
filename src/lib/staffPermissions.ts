import { labelsForSector, profileForSector } from '@/lib/sectorProfiles';

export type StaffRole = 'doctor' | 'assistant' | 'cashier' | 'staff';

export type StaffPermission =
    | 'appointments:view-own'
    | 'appointments:view-all'
    | 'appointments:create'
    | 'appointments:update-own'
    | 'appointments:update-all'
    | 'patients:view'
    | 'patients:edit'
    | 'dental-chart:view'
    | 'dental-chart:edit'
    | 'treatment-plans:view'
    | 'treatment-plans:edit'
    | 'payments:view'
    | 'payments:collect';

export interface StaffRoleOption {
    value: StaffRole;
    label: string;
    description: string;
}

const ROLE_ORDER: readonly StaffRole[] = ['doctor', 'assistant', 'cashier', 'staff'];

/**
 * Sektörün diliyle rol listesi. Rol DEĞERLERİ sabittir (yetki setini onlar
 * belirler, DB'de saklanan da odur); değişen yalnızca adlandırma — bir güzellik
 * salonunda "Hekim — diş şeması" yazması modülün ruhuna aykırıydı.
 *
 * Ad ve açıklama önce sektör profilinin `staffRoles` bloğundan okunur, yoksa
 * sektörün terminolojisinden (labels) türetilir. Yeni sektör eklendiğinde
 * burada kod değişmez.
 */
export function staffRoleOptionsForSector(sector?: string | null): StaffRoleOption[] {
    const L = labelsForSector(sector);
    const overrides = profileForSector(sector).staffRoles || {};
    const lc = (s: string) => s.toLocaleLowerCase('tr-TR');

    const derived: Record<StaffRole, { label: string; description: string }> = {
        doctor: { label: L.staff, description: `${L.service} uygular, ${lc(L.customer)} dosyasını ve tahsilatı yönetir` },
        assistant: { label: 'Asistan', description: `${L.reservation} ve ${lc(L.customer)} akışı desteği` },
        cashier: { label: 'Kasa', description: 'Tahsilat ve finans işlemleri' },
        staff: { label: 'Personel', description: `Kendi ${lc(L.reservation)} kayıtları ve temel ${lc(L.customer)} bilgileri` },
    };

    return ROLE_ORDER.map((value) => ({
        value,
        label: overrides[value]?.label ?? derived[value].label,
        description: overrides[value]?.description ?? derived[value].description,
    }));
}

/** Sektör bilinmeyen yerler için güvenli varsayılan (genel işletme dili). */
export const STAFF_ROLE_OPTIONS: ReadonlyArray<StaffRoleOption> = staffRoleOptionsForSector('genel');

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
    doctor: [
        'appointments:view-own',
        'appointments:create',
        'appointments:update-own',
        'patients:view',
        'patients:edit',
        'dental-chart:view',
        'dental-chart:edit',
        'treatment-plans:view',
        'treatment-plans:edit',
        'payments:view',
        'payments:collect',
    ],
    assistant: [
        'appointments:view-all',
        'appointments:create',
        'appointments:update-all',
        'patients:view',
        'patients:edit',
        'dental-chart:view',
        'treatment-plans:view',
    ],
    cashier: [
        'appointments:view-all',
        'patients:view',
        'treatment-plans:view',
        'payments:view',
        'payments:collect',
    ],
    staff: [
        'appointments:view-own',
        'appointments:update-own',
        'patients:view',
    ],
};

const ROLE_VALUES = new Set<StaffRole>(['doctor', 'assistant', 'cashier', 'staff']);

export function inferStaffRoleFromSpecialty(specialty?: string | null): StaffRole {
    const value = (specialty || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // "Diş hekimi asistanı" gibi ifadeler hekimden önce asistan olarak
    // değerlendirilmelidir.
    if (/(asistan|assistant|yardımcı|yardimci)/.test(value)) return 'assistant';
    if (/(hekim|doktor|doctor|dentist|diş|dis)/.test(value)) return 'doctor';
    if (/(kasa|kasiyer|cashier|vezne|tahsilat)/.test(value)) return 'cashier';
    return 'staff';
}

export function normalizeStaffRole(role?: string | null, specialty?: string | null): StaffRole {
    return role && ROLE_VALUES.has(role as StaffRole)
        ? role as StaffRole
        : inferStaffRoleFromSpecialty(specialty);
}

export function permissionsForStaffRole(role: StaffRole): StaffPermission[] {
    return [...STAFF_ROLE_PERMISSIONS[role]];
}

export function staffRoleLabel(role: StaffRole, sector?: string | null): string {
    return staffRoleOptionsForSector(sector).find((option) => option.value === role)?.label || 'Personel';
}
