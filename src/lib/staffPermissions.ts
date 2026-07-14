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

export const STAFF_ROLE_OPTIONS: ReadonlyArray<{
    value: StaffRole;
    label: string;
    description: string;
}> = [
    { value: 'doctor', label: 'Hekim', description: 'Muayene, diş şeması ve tedavi planı' },
    { value: 'assistant', label: 'Asistan', description: 'Randevu ve hasta akışı desteği' },
    { value: 'cashier', label: 'Kasa', description: 'Tahsilat ve finans işlemleri' },
    { value: 'staff', label: 'Personel', description: 'Kendi randevuları ve temel hasta bilgileri' },
];

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

export function staffRoleLabel(role: StaffRole): string {
    return STAFF_ROLE_OPTIONS.find((option) => option.value === role)?.label || 'Personel';
}
