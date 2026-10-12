/**
 * G5 · Gün kartının seçicisi — hareketin GEOMETRİSİ.
 *
 * Tasarım: `docs/design-reference/Luera Mobil - Tek Kisilik G5 Secici.html`
 * (hareket tablosu + `lay`/`rb`/`settle` fonksiyonları). Değerler oradan
 * BİREBİR; bileşen (`SoloPicker.tsx`) yalnız bunları native sürücüye
 * `interpolate` olarak veriyor.
 *
 * SAF KATMAN: React, react-native ve Expo import edilmez — test edilebilsin.
 */

/** Parmağın bir randevu için gittiği yol (pt): konum = başlangıç − dy / 72. */
export const PICK_STEP = 72;

/** Ara noktada çıkan kartın yukarı kalkışı (pt): 28 · sin(π·d). */
export const PICK_BUMP = 28;

/** Oturma yayı — uygulamanın hareket sözlüğü (sönüm 20, sertlik 330, kütle 0,5). */
export const PICK_SPRING = { stiffness: 330, damping: 20, mass: 0.5 } as const;

/** Bırakış hızının hedefe katkısı: hedef = yuvarla(konum + hız × 0,12). */
export const PICK_PROJECTION = 0.12;

/** Bırakış hızının sınırı (randevu / sn). */
export const PICK_MAX_VELOCITY = 25;

/** İlk açılış ipucu: 0 → 0,25 → 0, 260 ms arayla, bir kez. */
export const PICK_HINT = { to: 0.25, backAfterMs: 260 } as const;

/** Karttan başlayan sürüklemenin "kaydırma" sayılma eşiği (pt). */
export const PICK_DRAG_SLOP = 5;

/** Sayfa jestinden seçiciyi devralma eşiği (pt) — dikey ve yataydan büyük. */
export const PICK_CAPTURE_SLOP = 6;

/** Yığının sayfaya eklediği pay: iki kenar görünüyorsa 14, biri 8. */
export function stackPad(count: number): number {
    return count > 2 ? 14 : count > 1 ? 8 : 0;
}

/** İlk ve ikinci komşunun kayması: kart yüksekliğine bağlı. */
function offsets(height: number): { first: number; second: number } {
    return { first: height * 0.03 + 8, second: height * 0.06 + 14 };
}

export interface StackPose {
    /** Seçiliye göre kayma (pt) — işaretsiz; yön `d`nin işaretinden. */
    shift: number;
    scale: number;
    opacity: number;
    /** Kartın İÇİNİN opaklığı: komşuda yazı solar, yalnız kenar görünür. */
    content: number;
}

/**
 * Seçiliye `distance` (|d|) uzaklıktaki kartın duruşu:
 *   d = 0     → tam kart
 *   d = ±1    → ≈ ±11 pt · %94 · ,50 opak · yazı 0
 *   d = ±2    → ≈ ±20 pt · %88 · ,25 opak
 *   d ≥ 3     → görünmez
 *   d = ±0,5  → çıkan kart yukarı kalkıp arkaya geçer (28 · sin πd)
 */
export function stackPose(distance: number, height: number): StackPose {
    const a = Math.abs(distance);
    const { first, second } = offsets(height);
    if (a <= 1) {
        return {
            shift: first * a + PICK_BUMP * Math.sin(Math.PI * a),
            scale: 1 - 0.06 * a,
            opacity: 1 - 0.5 * a,
            content: Math.max(0, 1 - a * 1.4),
        };
    }
    if (a <= 2) {
        const t = a - 1;
        return { shift: first + (second - first) * t, scale: 0.94 - 0.06 * t, opacity: 0.5 - 0.25 * t, content: 0 };
    }
    const t = Math.min(1, a - 2);
    return { shift: second + 6 * t, scale: 0.88 - 0.04 * t, opacity: 0.25 * (1 - t), content: 0 };
}

/**
 * Bir kartın `interpolate` tabloları — konumun (`pos`, sıradaki yer) fonksiyonu.
 *
 * Kartın seçiliye uzaklığı d = i − pos. Sinüs çıkıntısı doğrusal olmadığı için
 * ±1 arası sekizde bir örnekleniyor; ötesi doğrusal (tasarımın da öyle).
 */
const SAMPLES = [
    -3, -2.5, -2, -1.5, -1, -0.875, -0.75, -0.625, -0.5, -0.375, -0.25, -0.125,
    0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.5, 2, 2.5, 3,
];

export interface StackTables {
    inputRange: number[];
    translateY: number[];
    scale: number[];
    opacity: number[];
    content: number[];
}

export function stackTables(index: number, height: number): StackTables {
    // pos artan sırada: d azalan sırada.
    const ds = [...SAMPLES].reverse();
    const tables: StackTables = { inputRange: [], translateY: [], scale: [], opacity: [], content: [] };
    for (const d of ds) {
        const pose = stackPose(d, height);
        tables.inputRange.push(index - d);
        // d > 0: kart seçiliden SONRA → aşağıda.
        tables.translateY.push(Math.sign(d) * pose.shift);
        tables.scale.push(pose.scale);
        tables.opacity.push(pose.opacity);
        tables.content.push(pose.content);
    }
    return tables;
}

/** Lastik bant: uçtan öte aşma en çok yarım randevu (c ,55). */
function rubber(over: number): number {
    return (1 - 1 / ((over * 0.55) / 0.5 + 1)) * 0.5;
}

/** Parmağın istediği konum → ekrandaki konum (uçlarda direnç). */
export function rubberBand(raw: number, count: number): number {
    const last = count - 1;
    if (raw < 0) return -rubber(-raw);
    if (raw > last) return last + rubber(raw - last);
    return raw;
}

/**
 * Uçta yığının TAMAMI kayar (kartlar arası çıkıntı orada çalışmaz):
 * aşma × 72 × ,6 pt. `interpolate` tablosu — dışarıya doğrusal uzar.
 */
export function overshootTable(count: number): { inputRange: number[]; outputRange: number[] } {
    const last = count - 1;
    const pull = PICK_STEP * 0.6;
    return { inputRange: [-1, 0, last, last + 1], outputRange: [pull, 0, 0, -pull] };
}

/** Bırakınca oturulacak randevu: hız yönünde, uçlarda kırpılmış. */
export function settleTarget(position: number, velocity: number, count: number): number {
    const v = Math.max(-PICK_MAX_VELOCITY, Math.min(PICK_MAX_VELOCITY, velocity));
    const projected = Math.round(position + v * PICK_PROJECTION);
    return Math.max(0, Math.min(count - 1, projected));
}

/**
 * Dokunulan yerden hangi kart: seçili kart 0…H; alttaki kenarlar H…H+8 ve
 * H+8…H+14, üsttekiler −8…0 ve −14…−8. Orada kart yoksa `null` (boş paya
 * dokunmak hiçbir şey açmaz).
 */
export function tapTarget(y: number, height: number, selected: number, count: number): number | null {
    // Komşunun görünen kenarı: kayma − ölçekten kalan yarı pay = 8 pt; ikinci
    // komşununki 14 pt (`stackPose`, d = 1 ve 2).
    const near = offsets(height).first - height * 0.03;
    let target = selected;
    if (y < -near) target = selected - 2;
    else if (y < 0) target = selected - 1;
    else if (y > height + near) target = selected + 2;
    else if (y > height) target = selected + 1;
    return target >= 0 && target < count ? target : null;
}

/** reduceMotion: kart parmağı izlemez; her 72 pt bir randevu, anlık. */
export function stepTarget(start: number, dy: number, count: number): number {
    const steps = Math.trunc(-dy / PICK_STEP);
    return Math.max(0, Math.min(count - 1, Math.round(start) + steps));
}
