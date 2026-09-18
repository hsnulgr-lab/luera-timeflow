# Müdür 35 · Paket sat + kartta "Randevu ver" — Claude Design promptu

**Ekler:**
1. `Luera Mobil - Mudur 23 Musteri Karti v2.html` — kartın onaylı son hâli.
   **Bu turda kart yeniden tasarlanmıyor**; yalnız iki kapı ekleniyor.
2. `Luera Mobil - Mudur 15 Randevu Olustur.html` — telefonda "bir şey
   oluşturma" akışının dili (sayfa, özet, onay).
3. `Luera Mobil - Hareket Sözleşmesi.html` — hareket sözlüğü.
4. **Ekran görüntüsü:** masaüstündeki paket satış çekmecesi
   (Müşteri kartı → "Paket Sat").

**Effort: High.**

---

## 0 · Bu tur neden var

Müdür 23 v2 müşteri kartında iki kapı uygulanmadı, çünkü ekranları yoktu:

1. **"Paket sat"** — tasarımın eylem listesinde vardı ama açtığı ekran
   çizilmemişti. Olmayan bir ekrana giden düğme ölü kontrol olurdu; koymadık.
2. **"Randevu ver"** — v1'de kartın çalışan tek düğmesiydi, v2'nin eylem
   listesinde yok. Sessizce kaldırmadık; şimdilik yaklaşan randevunun
   altında, bölüm eylemi diliyle duruyor. **Yerinin tasarımla kararlaşması
   gerekiyor.**

---

## 1 · Paket satışının GERÇEĞİ — değişmez

Masaüstünde bu iş zaten çalışıyor; telefon aynı kaydı yazacak. Tasarım bu
gerçeğe uymak zorunda:

- **Satış para ALMAZ.** Paket satmak müşteriye bir **hak** (N seans) ve bir
  **alacak** (paketin fiyatı) tanımlar. Tahsilat sonra, **Kasa'da** yapılır —
  peşin de olsa taksitle de olsa. v2 kartının kuralı da bu: "para tek yerde".
  Bu ekranda ödeme alanı, "tahsil et" düğmesi, ödeme yöntemi seçimi YOK.
- **Satış bir ŞABLONDAN yapılır.** Salonun paket tanımları masaüstünde
  (`Paket tanımları`): ad, seans sayısı, fiyat, geçerlilik süresi (ay, boş
  olabilir), renk. **Şablonda seans sayısı sabittir; satışta artırılamaz.**
  Fiyat şablondan gelir.
- **Kapalı paket satılamaz.** Müşterinin açık bir risk bayrağı (ör. hamilelik)
  pakette kapattığı bir işlemi içeriyorsa paket listede **basılamaz** durur ve
  sebebini söyler — v2 kartındaki ve randevu ekranındaki "KAPALI" satırının
  aynısı. Tek veri, üç yer, aynı kelime.
- **Personel** (paketi kimin sattığı) seçimlik.
- Satış olunca kartın **Hesap** bölümünde yeni paket satırı belirir
  ("Lazer · 10 seans · 0/10"). Onay mesajı değil, satırın kendisi onay.

**Bilinmeyen / olmayan:** telefonda şablon **oluşturma ya da düzenleme**
yok (masaüstünün işi). İndirim, taksit planı, fatura yok.

---

## 2 · Tasarlanacaklar

### P1 · Paket seç
- Salonun aktif şablonları: ad, seans sayısı, fiyat, geçerlilik.
- Kapalı olanlar aynı listede, basılamaz, sebep satırıyla.
- **Şablon yoksa** boş hâl: "Paket tanımları masaüstünde yapılır" — ölü
  düğme yok.

### P2 · Onay
- Kime (müşteri adı), ne (paket, seans), ne kadar (fiyat), ne zamana kadar
  (geçerlilik varsa bitiş tarihi), kim sattı (seçimlik).
- Açık cümle: **bu satış para almıyor**, tutar müşterinin hesabına yazılıyor
  ve tahsilat Kasa'dan yapılıyor. Müdür "ödendi" sanmamalı.
- Birincil eylem: "Paketi tanımla" ya da daha iyi bir fiil — **"Sat"
  kelimesi para aldığını düşündürüyor mu?** Karar ver, gerekçesini yaz.

### P3 · Sonuç
- Karta dönüş ve Hesap bölümünde yeni satır. Nasıl belirir?
- **Başarısızlık:** yazılamadıysa ne olur? (Satır belirmez; sebep yazılır.)

### K1 · Kartta "Randevu ver" nerede?
v2'nin kabuk çubuğu iki hap taşıyor (Ara · WhatsApp) ve 375 pt'de üçüncü
hapa yer yok. Seçenekler:
- yaklaşan randevunun altında bölüm eylemi (bugünkü hâl),
- kartın en altında sabit bir çubuk (v1'in yaptığı),
- başka bir öneri.

**Bir tane seç, gerekçesini yaz.** Randevu vermek müdürün karttaki en sık
işlerinden biri; ikinci plana düşmemeli.

---

## 3 · Değişmez kısıtlar

- v2 kartının dili: opak yüzeyler, cam yok, kırmızı yalnız risk, amber borç,
  **turuncu `#FF5A1F` yalnız zaman ve eylem.** Yeni renk icat etme.
- Dokunma hedefi **≥ 44 pt**. Hedef kitle 40–55 yaş, ayakta, tek elle.
- Hareket: yalnız opacity / translate / scale. **Yok:** gesture-handler,
  `LayoutAnimation`, Skia, Lottie. Sayfa geçişleri v2'nin hareket
  tablosundaki değerlerle.
- `reduceMotion`: hareket durur, bilgi durmaz.
- Tutar kırpılmaz. Büyük harf metin katmanında yazılır (`textTransform`
  Türkçe İ'yi bozuyor).
- **393 × 852 ve 375 × 667**, **koyu ve açık** tema.

---

## 4 · Çıktı

1. **P1** paket seç — normal · kapalı paketli · şablonsuz.
2. **P2** onay.
3. **P3** karta dönüş ve yeni satır · başarısızlık hâli.
4. **K1** kartta "Randevu ver"in yeri — seçilen hâl ve reddedilenler.
5. Her kararın bir cümlelik gerekçesi, her hareketin süresi ve eğrisi.

---

## Kutuya yazılacak cümle

> Luera TimeFlow müdür uygulamasında müşteri kartına (Müdür 23 v2) iki kapı
> ekle. **1) Paket sat:** salonun masaüstünde tanımlı şablonlarından paket
> seçilir (seans sayısı sabit, fiyat şablondan), müşteriye hak ve alacak
> yazılır — **satış para almaz**, tahsilat Kasa'da. Müşterinin risk bayrağının
> kapattığı paket basılamaz ve sebebini söyler. Şablon yoksa boş hâl. Paket
> seç → onay → karta dönüş. **2) Randevu ver:** v2'de yeri yok; kartta nerede
> duracağını kararlaştır. v2 kartının dili değişmez: opak, camsız, turuncu
> yalnız zaman ve eylem. 393 ve 375 pt, koyu + açık, reduceMotion.

**Effort: High.**
