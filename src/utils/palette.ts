// Luera TimeFlow — tasarımla (krem #F0EBE1 · ink #0E0E0E · turuncu #FF5A1F) uyumlu,
// sıcak tonlu ve birbirinden ayrık renk paleti.
// Hizmet ve personel renk seçimleri bu paletten gelir.
export const LUERA_PALETTE = [
  '#FF5A1F', // turuncu (marka)
  '#E8973C', // amber / bal
  '#C95A3C', // terracotta
  '#CB5E84', // gül
  '#8E70B2', // erik / lavanta
  '#3F9D9A', // teal
  '#5E9C6C', // adaçayı yeşili
  '#5B7CC2', // periwinkle mavi
];

// Verilen arka plan rengi üzerinde okunaklı metin rengini döndürür (ink ya da cream).
export function textOn(hex: string): string {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return '#0E0E0E';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.45 ? '#F0EBE1' : '#0E0E0E';
}
