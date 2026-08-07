// Kurulum sihirbazının adım listesi ve ilerleme hesabı — saf modül.
//
// Neden ayrı dosya: "kurulum bitti mi" sorusunu ÜÇ yer soruyor — sihirbazın
// kendi ilerleme çubuğu, bitiş özeti ve uygulamanın üstündeki "devam et"
// şeridi. Üçü ayrı hesaplasaydı biri "%60" derken diğeri "tamamlandı"
// diyebilirdi.
//
// Bir adımın "tamam" olması, kullanıcının o adımı GÖRMESİ değil VERİNİN
// bulunması demek. Böylece sihirbazı hiç açmamış eski bir org da doğru okunur:
// hizmetleri varsa o adım zaten tamamdır, sihirbaz onu tekrar sormaz.
//
// tests/setup-progress.test.mjs doğrudan import eder — `@/` alias'ı node'da
// çözülmediği için burada hiçbir alias import'u olmamalı.

export type StepKey =
    | 'welcome' | 'sector' | 'identity' | 'hours'
    | 'services' | 'resources' | 'team' | 'whatsapp';

export interface StepDef {
    key: StepKey;
    /** İlerleme çubuğunun altındaki kısa etiket. */
    label: string;
    /** Karşılama ve bitiş ekranları sayılmaz; atlanabilir adımlar işaretli. */
    skippable?: boolean;
}

export const SETUP_STEPS: readonly StepDef[] = [
    { key: 'welcome', label: 'Başlangıç' },
    { key: 'sector', label: 'Sektör' },
    { key: 'identity', label: 'Kimlik' },
    { key: 'hours', label: 'Saatler' },
    { key: 'services', label: 'Hizmetler' },
    { key: 'resources', label: 'Kaynak', skippable: true },
    { key: 'team', label: 'Ekip', skippable: true },
    { key: 'whatsapp', label: 'WhatsApp', skippable: true },
];

/** Sihirbazın okuduğu dünya durumu — hangi verinin VAR olduğu. */
export interface SetupFacts {
    sector?: string | null;
    businessName?: string | null;
    address?: string | null;
    phone?: string | null;
    /** Açık (isOff olmayan) gün sayısı. */
    openDays: number;
    serviceCount: number;
    resourceCount: number;
    /** Sektörün hiç kaynak türü yoksa bu adım GEREKSİZDİR, atlanmış sayılmaz. */
    resourcesApply: boolean;
    staffCount: number;
    /** "Yalnız ben çalışıyorum" seçildi — ekip adımı bilinçli olarak boş. */
    soloDeclared: boolean;
    whatsappConnected: boolean;
}

/**
 * Adım tamam mı?
 *
 * 'welcome' her zaman tamamdır: ilerleme çubuğunda yer tutar ama kullanıcıdan
 * bir şey istemez. Aksi halde sihirbazı bitiren biri bile %88'de kalırdı.
 */
export function isStepDone(key: StepKey, f: SetupFacts): boolean {
    switch (key) {
        case 'welcome': return true;
        case 'sector': return Boolean(f.sector) && f.sector !== 'genel';
        case 'identity': return Boolean(f.businessName?.trim()) && Boolean(f.address?.trim() || f.phone?.trim());
        case 'hours': return f.openDays > 0;
        case 'services': return f.serviceCount > 0;
        // Kaynak kavramı olmayan sektörde (danışmanlık, restoran) bu adım
        // sorulmaz; "atlandı" damgası vurmak da yanlış olur — yok sayılır.
        case 'resources': return !f.resourcesApply || f.resourceCount > 0;
        case 'team': return f.soloDeclared || f.staffCount > 0;
        case 'whatsapp': return f.whatsappConnected;
    }
}

export interface SetupProgress {
    /** Tamamlanmış adımların anahtarları. */
    done: StepKey[];
    /** Kullanıcıdan hâlâ bir şey isteyen adımlar, sırayla. */
    pending: StepKey[];
    /** 0–100 arası tam sayı. */
    percent: number;
    /** Hepsi bittiyse true — şerit gösterilmez. */
    complete: boolean;
    /** Sıradaki adım; yoksa null. */
    next: StepKey | null;
}

export function setupProgress(f: SetupFacts): SetupProgress {
    const done: StepKey[] = [];
    const pending: StepKey[] = [];
    for (const s of SETUP_STEPS) (isStepDone(s.key, f) ? done : pending).push(s.key);
    return {
        done, pending,
        percent: Math.round((done.length / SETUP_STEPS.length) * 100),
        complete: pending.length === 0,
        next: pending[0] ?? null,
    };
}

/**
 * Şeritteki "yaklaşık N dakika" tahmini. Uydurma bir sayı değil, adım başına
 * ölçülü bir bütçe: kullanıcı "3 dakika" yazısını görüp 10 dakika harcarsa bir
 * daha o şeride güvenmez.
 */
const MINUTES: Record<StepKey, number> = {
    welcome: 0, sector: 1, identity: 2, hours: 1,
    services: 2, resources: 1, team: 2, whatsapp: 1,
};

export function remainingMinutes(pending: StepKey[]): number {
    return pending.reduce((sum, k) => sum + MINUTES[k], 0);
}
