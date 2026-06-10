// Luera TimeFlow — tarih yardımcıları
// ÖNEMLİ: toISOString() UTC verir; Türkiye UTC+3 olduğu için gece 00:00–03:00
// arası "bugün" bir önceki güne kayar. Bu yüzden YEREL tarih bileşenleri kullanılır.

// Bir Date nesnesini YEREL saat dilimine göre "YYYY-MM-DD" döndürür.
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Bugünün yerel tarihi "YYYY-MM-DD".
export function todayISO(): string {
  return toISODate(new Date());
}

// "YYYY-MM-DD" → "9 Haz 2026" (okunaklı Avrupa biçimi).
const EU_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function formatDateEU(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${EU_MONTHS[m - 1]} ${y}`;
}
