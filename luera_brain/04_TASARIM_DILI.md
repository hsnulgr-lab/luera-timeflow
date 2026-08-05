# 04 — LUERA TimeFlow Tasarım Dili

> Bu dosya tek yetkili renk kaynağıdır. Burada olmayan hiçbir hex kullanılmaz.

## Karakter

TimeFlow'un görsel kimliği **"sıcak mürekkep"**tir: krem/kum zeminde koyu mürekkep
metin, tek bir keskin turuncu vurgu ve mono rakamlar. Amaç: yoğun operasyonel bilgiyi
(saatler, tutarlar, doluluk) yorucu olmayan, kâğıt hissi veren bir yüzeyde göstermek.

Referans hisler: kâğıt + matbaa, kalın ama ölçülü tipografi, çok az renk, çok fazla
hiyerarşi. **Kaçınılan:** mavi/mor SaaS gradyanları, cam-mat (glassmorphism) efektleri,
gökkuşağı KPI kartları, gereksiz ikon.

---

## Ana palet (marka)

| Rol | Işık | Koyu |
|---|---|---|
| **Turuncu (vurgu)** | `#FF5A1F` | `#FF5A1F` |
| Turuncu koyu (hover/metin) | `#E8430F` | `#FF7A45` |
| **Mürekkep (metin)** | `#0E0E0E` | `#F3EDE3` |
| Krem | `#F3EDE3` | `#120E08` |
| Sayfa zemini | `#F3ECE0` | `#120E08` |
| Yüzey 1 | `#FAF7F3` | `#1C1710` |
| Yüzey 2 | `#F0E9DF` | `#252015` |
| Yüzey 3 | `#E9E1D5` | `#30281A` |
| Kart | `#FFFDFB` | `#241E16` |
| Mürekkep kutu (ters blok) | `#0E0E0E` / metin `#F3EDE3` | `#2A2118` / metin `#F3EDE3` |

Turuncu **her iki temada da aynı**. Marka sabiti budur.

## Durum renkleri

| Durum | Işık | Işık zemin | Koyu | Koyu zemin |
|---|---|---|---|---|
| Yeşil (başarı/tamam) | `#2D8F32` | `#E8F5EA` | `#7AD3A0` | `rgba(45,160,50,.16)` |
| Kırmızı (hata/iptal) | `#C94040` | `#FBECEC` | `#e07070` | `rgba(224,112,112,.16)` |
| Amber (uyarı/bekliyor) | `#B87A00` | `rgba(184,121,10,.12)` | `#E0A12E` | `rgba(224,161,46,.16)` |
| Mavi (bilgi) | `#3B6FB0` | `rgba(59,111,176,.11)` | `#7AAFE8` | `rgba(122,175,232,.16)` |
| Mor (özel) | `#7B4FA0` | `rgba(123,79,160,.12)` | `#C09AE0` | `rgba(192,154,224,.16)` |

## Kenarlık ve sessiz metin

| Token | Işık | Koyu |
|---|---|---|
| border | `rgba(14,14,14,0.09)` | `rgba(243,237,227,0.10)` |
| border-soft | `rgba(14,14,14,0.06)` | `rgba(243,237,227,0.07)` |
| border2 (belirgin) | `rgba(14,14,14,0.14)` | `rgba(243,237,227,0.22)` |
| hair2 (saç çizgi) | `rgba(14,14,14,0.04)` | `rgba(243,237,227,0.05)` |
| muted (ikincil metin) | `rgba(14,14,14,0.48)` | `rgba(243,237,227,0.55)` |
| muted2 (üçüncül) | `rgba(14,14,14,0.30)` | `rgba(243,237,227,0.30)` |
| ink70 | `rgba(14,14,14,0.62)` | `rgba(243,237,227,0.68)` |
| offhrs (mesai dışı bant) | `rgba(14,14,14,0.028)` | `rgba(243,237,227,0.03)` |
| orange-soft | `rgba(255,90,31,0.08)` | `rgba(255,90,31,0.14)` |

---

## Token isimleri

### Masaüstü dashboard — `--dc-*`
`.dash-theme` kökü altında tanımlı, `.dash-theme.dark` ile koyu temaya geçer.

```
--dc-ink  --dc-cream  --dc-orange  --dc-orange-d  --dc-orange-soft
--dc-page --dc-surface --dc-surface2 --dc-surface3 --dc-surface2-60 --dc-card
--dc-inkbox --dc-inkbox-fg --dc-onbox-50/60/70
--dc-border --dc-border-soft --dc-border2 --dc-hair2 --dc-offhrs
--dc-muted --dc-muted2 --dc-ink70
--dc-green(-bg) --dc-red(-bg) --dc-red2 --dc-amber(-bg) --dc-blue(-bg) --dc-purple(-bg)
```

### Mobil — `--lt-*`
`src/mobile/theme.ts` içinde `DARK_VARS` / `LIGHT_VARS`. Tema değişimi yalnız
`:root` değişken setini değiştirir; **hiçbir bileşen kodu değişmez**.
`var()` hem inline style'da hem SVG `stroke`/`fill` attribute'unda çözülür.

```
--lt-ink --lt-orange --lt-orangeD --lt-bg --lt-surface --lt-surface2 --lt-surface3
--lt-border --lt-border2 --lt-muted --lt-muted2 --lt-muted3
--lt-green(-bg/-border) --lt-blue(-bg) --lt-amber(-bg) --lt-red(-bg/-border) --lt-purple
--lt-overlay --lt-chip-bg --lt-hero-1 --lt-hero-2 --lt-orb1 --lt-orb2 --lt-btn-ink-bg
```

Mobil koyu (ana tema): ink `#F3EDE3`, bg `#120E08`, surface `#1C1710`.
Mobil açık: ink `#1A1208`, bg `#F0EBE1`, surface `#F8F4EE`, orangeD `#E04510`.

### shadcn/Tailwind katmanı — `--primary` vb.
`src/index.css` `@layer base` içinde ayrı bir **mor-indigo** HSL seti var
(`--primary: 252 85% 60%`, `--accent: 172 66% 50%`, `--radius: 0.75rem`).
Bu **eski/legacy** katmandır (LeadFlow ile eşleşiyordu) ve Radix/shadcn bileşenlerinin
varsayılanlarını besler. **Yeni tasarımda kullanılmaz** — yeni ekranlar `--dc-*`
(masaüstü) veya `--lt-*` (mobil) kullanır. Bir ekranda mor görüyorsan yanlıştır.

---

## Tipografi

- **Ana font:** `Hanken Grotesk` (300–900), fallback `Inter`, `system-ui`.
- **Mono:** `'JetBrains Mono', monospace` — `MONO` sabiti `src/components/dashboard/kpi.tsx`'te.
  **Kural:** sayı, saat, tutar, trend, rozet ve etiket kodları mono ile yazılır.
  Cümle/başlık asla mono değildir.

### Ölçek bandı (TimeFlow bandı — dışına çıkma)

| Kullanım | Boyut | Ağırlık |
|---|---|---|
| Dashboard kök gövde | 15px | 400–500 |
| İkincil / muted satır | 14px | 400 |
| Kart başlığı | 15–16px | 700–780 |
| Sayfa başlığı | 20–24px | 800 |
| Büyük KPI rakamı | 28–34px | 800, mono |
| Mono rozet / etiket | 11px | 750, letter-spacing hafif |
| Mikro etiket (eksen, alt yazı) | 9.5–10px | 600–700, mono, muted |

Ağırlıklar 3 basamaklı yazılır (`font: 750 11px ...`) — repo deseni budur.

---

## Şekil ve derinlik

- **Köşe yarıçapı:** kart 16–20px · buton/chip 10–12px · pill/rozet 99px · input 12px.
- **Gölge kısayolları** (her dashboard CSS'inde scope'lu tanımlanır):
  ```css
  --shadow-sm: 0 1px 2px rgba(14,14,14,.04), 0 5px 14px rgba(14,14,14,.05);
  --shadow-md: 0 2px 4px rgba(14,14,14,.05), 0 12px 30px rgba(14,14,14,.08);
  --shadow-lg: 0 18px 60px rgba(14,14,14,.16);
  /* dark: rgba(0,0,0,.18–.32) bandına geçer */
  ```
- Kart zeminden **gölgeyle** ayrılır, kalın kenarlıkla değil. Kenarlık hep saç inceliğinde.

## Odak (focus) — erişilebilirlik

```css
outline: 3px solid rgba(255, 90, 31, 0.28);
outline-offset: 2px;
```
Tüm `button`, `input`, `select`, `[role="button"]` için `:focus-visible`'da zorunlu.
`button:disabled { cursor: not-allowed; opacity: .42 }`.

## Hareket

Ölçülü ve amaçlı. Kullanılan desenler:

| Ad | İş | Süre / eğri |
|---|---|---|
| `sb-bar-breathe` | Sidebar aktif çubuk turuncu glow nefesi | 2.4s ease-in-out ∞ |
| `sb-ripple-out` | Tıklama dalgası | 480ms `cubic-bezier(.2,.8,.2,1)` |
| `sb-label-pop` | Etiket 4px sağa itilip döner | 300ms aynı eğri |
| `gz-blk-pulse` | İşlemdeki randevu bloğu nabzı | 2.4s, `0 0 0 4px rgba(255,90,31,.28)` |
| `sb-sheet-up` | Mobil bottom-sheet | 280ms `cubic-bezier(.2,.9,.25,1)` |
| `shimmer` | Yükleme iskeleti | 1.5s ∞ |

Standart geçiş: `0.2s`. Yeni animasyon eklerken bu eğrilerden birini kullan, yenisini icat etme.

## Özel bileşen: `.btn-bracket`
Köşe parantezi butonu (yalnız koyu temada): `::before` ile 8 adet `linear-gradient`
parçası köşelere 10px×1.5px çizgiler koyar. Renk `rgba(243,237,227,0.42)`,
hover'da `0.75`. Şeffaf zemin, kenarlıksız.

---

## CSS mimarisi kuralları

1. **Scope zorunlu.** Her sektör dashboard'unun CSS'i tek bir kök sınıf altında
   yaşar: `.kf-ops` (kuaför), `.gz-*` (güzellik), `.hc-*` (sağlık) vb.
   Global seçici yazma — diğer sektörler etkilenmemeli.
2. **Yeni renk tanımlama.** Scope'lu CSS'te yalnız gölge/spacing kısayolu tanımlanır;
   renk daima `var(--dc-*)`'tan okunur.
3. **Koyu tema token ile çözülür**, ayrı bir `.dark .card { background: ... }` bloğu
   yazılmaz. Bileşen tema-bilmez olmalı.
4. Repo hem Tailwind sınıflarını hem inline `style` hem scope'lu CSS kullanır —
   üçü de meşru. Karmaşık ızgara/animasyon → CSS dosyası; tek seferlik ölçü → inline.

## Dil ve mikro-metin

- Arayüz dili **Türkçe**. Sektör sözcükleri `useLabels()` / `t('customer')` ile çözülür —
  ekrana "Müşteri" yazma, `t('customer')` yaz (diş kliniğinde "Hasta" olmalı).
- Tarih: `dd.MM.yyyy`, saat `HH:mm`, ay kısaltmaları `OCA ŞUB MAR NİS MAY HAZ TEM AĞU EYL EKİ KAS ARA`.
- Para: `₺` sonda değil başta değil — repo `1.250 ₺` biçimini kullanır.
- Boş durum asla çıplak bırakılmaz: `EmptyState` bileşeni + tek bir eylem çağrısı.
  Diş şeması gibi ekranlarda boş durum **iş yapan** bir yüzeye çevrilir
  ("bugünkü hastalar" tek-tık kartları).

## Erişilebilirlik ve mobil

- Dokunma hedefi min 44×44px.
- `html, body, #root { overflow-x: hidden }` — yatay taşma global olarak engelli;
  geniş içerik (tablo, ızgara) **kendi** `overflow-x: auto` kabında kayar.
- Mobilde `env(safe-area-inset-*)` hesaba katılır.
- Işık ve koyu tema **eşit vatandaştır** — biri "ikinci sürüm" değildir.
