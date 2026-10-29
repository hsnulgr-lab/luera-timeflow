// Türkçe saat ve gün ekleri — şablonların ortak dili.
//
// "12:00'de / 12:30'da / 13:00'te" eki okunuşa göre değişir; elle "'de"
// yazmak saatlerin yarısında yanlış Türkçe üretiyordu. Gün de insan diliyle:
// "Bugün", "Yarın", hafta içi gün adı, daha ilerisi tarih.
//
// Saf modül: tests/wa-agent.test.mjs ve wa-scheduler.test.mjs doğrudan import eder.

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const UNITS = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli'];

/** Sayının okunuşunun son kelimesi: 12 → "iki", 40 → "kırk". */
function lastSpokenWord(n: number): string {
    if (n === 0) return 'sıfır';
    return n % 10 > 0 ? UNITS[n % 10] : TENS[Math.floor(n / 10)];
}

/**
 * Saate gelen "-de" eki okunuşa göre değişir: 12:00'de, 12:30'da, 13:00'te,
 * 10:40'ta. Dakika 00 ise saat okunur, değilse dakika.
 */
export function timeLocative(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const word = lastSpokenWord(m > 0 ? m : h);
    const vowels = [...word].filter((ch) => 'aeıioöuü'.includes(ch));
    const back = 'aıou'.includes(vowels[vowels.length - 1] ?? 'e');
    const voiceless = 'çfhkpsşt'.includes(word[word.length - 1]);
    return `'${voiceless ? 't' : 'd'}${back ? 'a' : 'e'}`;
}

/** "-deki": 12:00'deki, 12:30'daki, 13:00'teki, 10:40'taki. */
export function timeLocativeKi(time: string): string {
    return `${timeLocative(time)}ki`;
}

/** "Bugün", "Yarın", hafta içindeyse gün adı, değilse "31 Ekim". */
export function relativeDayLabel(dateISO: string, todayISO: string): string {
    const diff = Math.round(
        (Date.parse(`${dateISO}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86_400_000,
    );
    if (diff === 0) return 'Bugün';
    if (diff === 1) return 'Yarın';
    if (diff > 1 && diff < 7) return WEEKDAYS[new Date(`${dateISO}T00:00:00Z`).getUTCDay()];
    return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('tr-TR', {
        day: 'numeric', month: 'long', timeZone: 'UTC',
    });
}
