export type ScheduleCadence = 'monthly' | 'weekly';

function localIsoDate(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

/**
 * Produces a due date without JavaScript's month-overflow surprise. A schedule
 * starting on January 31 therefore continues on February 28/29 and March 31.
 */
export function installmentDueDate(firstDueDate: string, index: number, cadence: ScheduleCadence): string {
    const [year, month, day] = firstDueDate.split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
        || year < 1 || month < 1 || month > 12 || day < 1 || day > 31
        || !Number.isInteger(index) || index < 0
        || (cadence !== 'weekly' && cadence !== 'monthly')) {
        throw new RangeError('invalid_installment_due_date');
    }
    const parsed = new Date(year, month - 1, day, 12, 0, 0);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
        throw new RangeError('invalid_installment_due_date');
    }

    if (cadence === 'weekly') {
        return localIsoDate(new Date(year, month - 1, day + index * 7, 12, 0, 0));
    }

    const absoluteMonth = month - 1 + index;
    const targetYear = year + Math.floor(absoluteMonth / 12);
    const targetMonth = ((absoluteMonth % 12) + 12) % 12;
    const lastDay = new Date(targetYear, targetMonth + 1, 0, 12, 0, 0).getDate();
    return localIsoDate(new Date(targetYear, targetMonth, Math.min(day, lastDay), 12, 0, 0));
}

/** Splits money in integer cents so the installments always total exactly. */
export function splitInstallmentAmounts(totalAmount: number, count: number): number[] {
    const totalCents = Math.round(totalAmount * 100);
    if (!Number.isFinite(totalAmount) || !Number.isSafeInteger(totalCents)
        || !Number.isInteger(count) || count < 1 || totalCents < count) {
        throw new RangeError('invalid_installment_amount');
    }

    const baseCents = Math.floor(totalCents / count);
    const extraCents = totalCents % count;
    return Array.from({ length: count }, (_, index) =>
        (baseCents + (index < extraCents ? 1 : 0)) / 100);
}
