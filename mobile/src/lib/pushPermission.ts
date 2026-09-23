/**
 * Bildirim izninin HÂLİ — saf karar katmanı, React'siz, expo-notifications'sız.
 *
 * ── Altı hâl, hiçbiri ötekine indirgenmiyor ─────────────────────────────────
 * Bu ayrımın sebebi tek bir kural: EKRAN YALAN SÖYLEMEZ. Bir anahtarın "açık"
 * görünüp bildirim gelmemesi, bildirimin hiç olmamasından kötü — kullanıcı
 * bekler, beklediği gelmez ve nedenini bilmez.
 *
 *   unsupported  Cihaz jeton üretemez (simülatör, Expo Go). İzin sorulmaz bile.
 *   undetermined Henüz sorulmadı. iOS bunu ÖMÜRDE BİR KEZ soruyor.
 *   granted      İzin var.
 *   denied       Kullanıcı reddetti ya da OS ayarından kapattı. Yeniden
 *                sorulamaz; tek yol Ayarlar.
 *   missing      İzin var ama `extra.eas.projectId` yok → jeton ÜRETİLEMİYOR.
 *                Bizim kurulum hatamız; sessizce geçilirse "her şey yolunda"
 *                görünür ve hiçbir bildirim gelmez.
 *   error        OKUNAMADI. `denied` DEĞİL — bilmediğimiz şeyi "kapalı" diye
 *                yazmak, bir ağ boşluğunu kullanıcının kararı gibi göstermek
 *                olurdu.
 */

export type PushState =
    | 'unsupported'
    | 'undetermined'
    | 'granted'
    | 'denied'
    | 'missing'
    | 'error';

/**
 * OS'un döndüğü izin durumundan bizim hâlimize.
 *
 * `canAskAgain` yanlışsa `undetermined` hâli anlamsız: kullanıcı soruyu bir
 * kez görmüş ve kapatmış demektir.
 */
export function stateOf(input: {
    isDevice: boolean;
    status: 'granted' | 'denied' | 'undetermined' | string;
    canAskAgain?: boolean;
    hasProjectId: boolean;
}): PushState {
    if (!input.isDevice) return 'unsupported';
    if (input.status === 'granted') return input.hasProjectId ? 'granted' : 'missing';
    if (input.status === 'denied') return 'denied';
    if (input.status === 'undetermined') return input.canAskAgain === false ? 'denied' : 'undetermined';
    return 'error';
}

/** OS diyaloğunu açmanın anlamı var mı? */
export function shouldAsk(state: PushState): boolean {
    return state === 'undetermined';
}

/** Anahtar/satır "açık" diyebilir mi? Yalnız gerçekten çalışıyorsa. */
export function isLive(state: PushState): boolean {
    return state === 'granted';
}

/**
 * Kullanıcıya gösterilen cümle.
 *
 * Hiçbiri bizim durumumuz hakkında iddia içermiyor: "kapalı" yalnız gerçekten
 * kapalıyken yazılıyor, okunamadığında okunamadığı yazılıyor.
 */
export function permissionText(state: PushState): string {
    if (state === 'granted') return 'Bildirimler açık';
    if (state === 'undetermined') return 'Bildirimler için izin gerekiyor';
    if (state === 'denied') return 'Telefon ayarlarında bildirimlere izin verilmemiş';
    if (state === 'unsupported') return 'Bu cihaz bildirim alamıyor';
    if (state === 'missing') return 'Bildirim kurulumu eksik · destek ile görüşün';
    return 'Bildirim izni okunamadı';
}

/** Kullanıcıyı OS ayarlarına göndermenin işe yaradığı tek hâl. */
export function opensSettings(state: PushState): boolean {
    return state === 'denied';
}
