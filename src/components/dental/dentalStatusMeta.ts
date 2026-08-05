import type { DentalStatus } from '@/types';

// Diş durumlarının görsel sözleşmesi — lejant sırası ve renk sınıfı adları.
// Bileşenlerden ayrı dosyada: hem odontogram glifi (ToothAnatomy) hem kart
// (DentalChart) aynı listeyi okur, ikisi birbirinden kayamaz.
// Renkler burada değil tooth.css'te (.dt-swatch.<cls>) tanımlıdır.

export interface DentalStatusLegendItem {
    status: DentalStatus | 'planned';
    label: string;
    /** tooth.css'teki .dt-swatch varyantı; sağlam için sınıf yok. */
    cls: string;
}

export const STATUS_LEGEND: DentalStatusLegendItem[] = [
    { status: 'saglam', label: 'Sağlam', cls: '' },
    { status: 'curuk', label: 'Çürük', cls: 'curuk' },
    { status: 'dolgu', label: 'Dolgu', cls: 'dolgu' },
    { status: 'kanal', label: 'Kanal', cls: 'kanal' },
    { status: 'kron', label: 'Kron', cls: 'kron' },
    { status: 'implant', label: 'İmplant', cls: 'implant' },
    { status: 'cekildi', label: 'Çekilmiş', cls: 'cekildi' },
    { status: 'planned', label: 'Planlı işlem', cls: 'planned' },
];

/** Ekran okuyucu etiketleri — glif aria-label'ında kullanılır. */
export const DENTAL_STATUS_LABEL: Record<DentalStatus, string> = {
    saglam: 'Sağlam', curuk: 'Çürük', dolgu: 'Dolgu', kanal: 'Kanal tedavili',
    kron: 'Kron', implant: 'İmplant', cekildi: 'Çekilmiş',
};
