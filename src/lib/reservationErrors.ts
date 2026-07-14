export type ReservationConflictKind = 'staff' | 'resource' | 'unknown';

export interface ReservationConflictError {
    kind: ReservationConflictKind;
    message: string;
}

const CONFLICT_MESSAGES: Record<ReservationConflictKind, string> = {
    staff: 'Seçilen personel bu saat aralığında dolu. Takvim yenilenmiş olabilir; başka bir saat veya personel seçin.',
    resource: 'Seçilen kaynak/ünite bu saat aralığında dolu. Takvim yenilenmiş olabilir; başka bir saat veya kaynak seçin.',
    unknown: 'Bu saat aralığı az önce doldu. Başka bir saat, personel veya kaynak seçin.',
};

function fold(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .toLowerCase();
}

function errorText(error: unknown): string {
    if (typeof error === 'string') return error;
    if (!error || typeof error !== 'object') return '';

    const record = error as Record<string, unknown>;
    return ['code', 'message', 'details', 'hint', 'description', 'error_description']
        .map((key) => record[key])
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
}

/**
 * Supabase/PostgREST, PostgreSQL exclusion violations as SQLSTATE 23P01.
 * Trigger messages are also recognised so the UI keeps working if an API
 * layer only forwards the message and omits the SQLSTATE code.
 */
export function getReservationConflictError(error: unknown): ReservationConflictError | null {
    // Trigger/constraint adları çoğunlukla snake_case gelir. Ayraçları boşluğa
    // çevirerek hem `reservation_staff_conflict` hem doğal dil mesajlarını aynı
    // sözcük eşlemesiyle ele alırız.
    const text = fold(errorText(error)).replace(/[_-]+/g, ' ');
    if (!text) return null;

    const mentionsStaff = /\b(staff|personel|hekim|doktor|calisan|employee)\b/.test(text);
    const mentionsResource = /\b(resource|kaynak|unite|unit|chair|koltuk|oda|room|masa)\b/.test(text);
    const mentionsConflict = /\b(conflict|overlap|cakis\w*|dolu\w*|capacity|kapasite)\b/.test(text);
    const isKnownTriggerMessage = mentionsConflict && (mentionsStaff || mentionsResource);
    const isExclusionViolation = /\b23p01\b/.test(text);

    if (!isExclusionViolation && !isKnownTriggerMessage) return null;

    let kind: ReservationConflictKind = 'unknown';
    if (mentionsResource && !mentionsStaff) kind = 'resource';
    else if (mentionsStaff && !mentionsResource) kind = 'staff';
    else if (/resource[_ -]?(conflict|overlap)|kaynak[_ -]?(cakisma|dolu)/.test(text)) kind = 'resource';
    else if (/staff[_ -]?(conflict|overlap)|personel[_ -]?(cakisma|dolu)/.test(text)) kind = 'staff';

    return { kind, message: CONFLICT_MESSAGES[kind] };
}
