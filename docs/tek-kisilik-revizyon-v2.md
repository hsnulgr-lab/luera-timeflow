# Revizyon · v2 → v3 — yalnız Gün ekranı

**Kime:** Claude Design
**Tarih:** 2026-10-09
**Üstünde çalışılacak dosya:** `Luera Mobil - Tek Kisilik v2.html` (+ `tek2-*.js`)

v2'nin geri kalanı **onaylandı.** İşlem, İşletme, Kasa, Randevu kurma,
Takvim, boş hâller ve kurulum olduğu gibi kalıyor. Aşağıdaki dört madde
yalnız **Gün** ekranını ve onun randevu satırlarını ilgilendiriyor.

---

## Sorun

Gün ekranı Müdür 24'ün **kişi başlığını** almış: halka + "Derya Toprak" +
"Güzellik uzmanı". Sonuç:

- **Tarih hiçbir yerde yazmıyor.** Hangi güne bakıldığı bilinmiyor.
- **Hafta şeridi yok.** Gün değiştirmenin yolu yok.
- Randevular **düz liste satırı**; canlı uygulamada kart.

Tek kişilik modda kullanıcı kendi adını ve mesleğini okumaya ihtiyaç duymuyor;
**hangi gün olduğunu** okumaya duyuyor.

---

## R1 · Gün başlığı — kişi başlığının yerine

**Çıkar:** `heroH()` — `ring` + `Derya Toprak` + `Güzellik uzmanı`

**Girer:** canlı uygulamanın gün başlığı (`canli-1.0/mudur-01-akis.webp` ve
`personel-01-bugun.webp`, ikisinde de aynı):

- solda büyük gün kısaltması + turuncu nokta: **Cum.**
- sağda gün numarası, soluk: **9**
- altında özet satırı

**Özet satırının metni:** personel Bugün'ün dili önerilir —
*"9 Ekim · 2 iş bitti, 3 kaldı"*. Gerekçe: bu modda bakan kişi işi **yapan**
kişi; "6 randevu · 3 personel" onun sorusu değil. Tarih bu satırda açıkça
yazıyor.

Kit'te karşılığı var: `.chd / .ctl .d / .ctl .nn / .csub` (bugün Takvim
ekranında kullanılıyor). Ölçü canlı görüntülerden alınsın — Akış başlığı
Takvim'inkinden büyük.

## R2 · Hafta şeridi Gün ekranına girsin

`personel-01-bugun.webp`'teki şerit: yedi gün, seçili gün yuvarlak çerçevede,
altında gün kısaltmaları (SAL ÇAR PER **CUM** CMT PAZ PZT) ve doluluk
noktaları.

Kit'te **zaten var**: `week(days, sel)` — bugün yalnız Takvim'de kullanılıyor.
Aynısı Gün'ün başlığının altına gelsin. Gün değiştirme buradan yapılıyor;
başka bir gün seçiciye gerek yok.

## R3 · Randevu satırları kart olsun

**Çıkar:** `row()` / `.row2` — ince ayraçlı düz liste satırı.

**Girer:** canlı personel Bugün kartı (`personel-01-bugun.webp`; yakın çekimi
kullanıcının 4. görseli):

- saat kartın **dışında**, solda, hizalı
- kart yuvarlak köşeli, zemini yüzey rengi
- içeride: ad (ince ad + **kalın soyad**), sağ üstte süre — *45 dk*
- altında hizmet adı
- tamamlanmış işte altta yeşil **● TAHSİL EDİLDİ** satırı ve kartın sağ
  kenarında ince yeşil şerit
- süresi aşan işte **● UZADI · 13 dk aştı** ve sağda sayaç

**Şimdi çizgisi** kartların arasında kalıyor: turuncu hap içinde saat +
yatay çizgi (`nowl`, v2'de zaten doğru).

Bu değişiklik Gün'ün bütün hâllerini etkiliyor: "BUGÜN · 5 RANDEVU" listesi de,
işlemdeki ekranın "SIRADAKİ · 2 RANDEVU" listesi de kart olacak.

## R4 · Kendi avatarın — tek açık nokta

Kullanıcı referans olarak müdür Akış başlığını da gösterdi; orada gün
başlığının altında **avatar şeridi** duruyor (halka + ad + durum kelimesi).

Tek kişide bu şerit tek halkaya iniyor. İki yol var, **birincisi öneriliyor:**

1. **Şerit hiç çizilmez.** Durum zaten hemen altındaki hâl kartında yazıyor
   (*ŞU AN BOŞ · 19 dk* / *SÜRÜYOR · 74:12*); tek kişi kendi adını ve
   mesleğini okumuyor. Ekranın üst üçte biri randevulara kalıyor.
2. **Tek halka çizilir**, Akış şeridi biçiminde: halka + altında durum
   kelimesi, ad yok. Durum iki yerde görünür.

Hangisi seçilirse seçilsin **ad ve meslek satırı geri gelmiyor.**

---

## Değişmeyen

- Hâl kartı (`.pnl`) ve içindeki eylem düğmesi — **Başlat**, **Kumandayı aç**,
  **Tahsil et**. v2'deki hâliyle doğru.
- Sekme seti ve etiketleri.
- Jetonlar, tipografi, ikon seti.
- Diğer altı bölümün ekranları.

## Kaynak görüntüler

- Gün başlığı + avatar şeridi: `canli-1.0/mudur-01-akis.webp`
- Gün başlığı + hafta şeridi + kartlar: `canli-1.0/personel-01-bugun.webp`
