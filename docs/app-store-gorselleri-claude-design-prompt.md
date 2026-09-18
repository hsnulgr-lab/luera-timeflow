# App Store Görselleri · Mağaza kareleri — Claude Design promptu

**Ekler:**
1. **Ekran görüntüleri (telefondan, demo salonla):** müdürün **Akış**,
   **Takvim**, **Kasa**, **Randevu oluştur**, **Müşteri kartı** ekranları ·
   personelin **Bugün** ve **Kumanda** ekranları · **Karşılama**.
2. `Luera Mobil - Giris v3 Isik Alani.html` — markanın ve ışık alanının kaynağı.
3. `Luera Mobil - Mudur 34 Eylem Hapi v2.html` — Akış'ın onaylı son hâli.

**Effort: High.**

---

## 0 · Bu tur neden var

Uygulama App Store'a çıkıyor. Apple mağaza sayfası için **ekran görüntüsü
kareleri** istiyor ve bu kareler, uygulamayı hiç görmemiş bir salon sahibinin
ilk gördüğü şey. Bugün elimizde tek bir kare yok.

Bu tur **pazarlama karesi** tasarlıyor: gerçek bir ekran görüntüsü + üstünde
kısa bir başlık. Uygulamanın kendisine dokunulmuyor.

---

## 1 · Apple'ın kuralları — değişmez

- **Ölçü:** 1320 × 2868 px (6,9"). Alternatif: 1284 × 2778 px (6,5").
  **Saydamlık (alpha) yok**, RGB, PNG ya da JPEG.
- **Adet:** en az 3, en çok 10. İlk 3 kare arama sonucunda görünüyor —
  asıl iş onlarda.
- **Kareler uygulamanın GERÇEK hâlini göstermeli** (Yönerge 2.3.3). Olmayan
  bir özellik, olmayan bir ekran ya da uygulamada bulunmayan bir veri
  gösterilemez.
- **Fiyat, plan, "ücretsiz dene", indirim YOK.** Uygulama ücretsiz bir
  tamamlayıcı (3.1.3(f)); satın alma uygulamanın dışında. Karede para
  çağrısı olursa inceleme reddeder.
- **Uydurma yorum, yıldız, "10.000 salon kullanıyor" gibi iddia YOK.** Böyle
  bir sayımız yok.
- Başka markaların logoları, Apple donanımının fotoğrafı ya da "iPhone"
  sözcüğü **kullanılmıyor**.

---

## 2 · Ürün ve kitle

**Luera TimeFlow** — Türkiye'deki küçük randevulu işletmeler (kuaför, güzellik
salonu, klinik, diş hekimi, dövme stüdyosu…) için randevu ve işletme yönetimi.
Telefon uygulamasının iki yüzü var:

- **Müdür:** salonun tamamı cebinde — günün akışı, takvim, kasa, müşteriler.
- **Personel:** kendi günü ve işlem kumandası — başlat, bitir, kasaya gönder.

Kitle: **40–55 yaş salon sahibi**, telefonu tek elle, ayakta kullanıyor.
Başlıklar okunaklı ve kısa olmalı; jargon yok.

---

## 3 · Kareler — önerilen sıra (değiştirilebilir, gerekçesini yaz)

| # | Ekran | Söylenecek tek şey |
|---|---|---|
| 1 | Müdür · Akış | Salonun bugünü tek bakışta |
| 2 | Müdür · Takvim | Kim, ne zaman, hangi koltukta |
| 3 | Personel · Kumanda | Personel işini telefondan yürütür |
| 4 | Müdür · Kasa | Günün tahsilatı cebinde |
| 5 | Müdür · Randevu oluştur | Randevu birkaç dokunuşta |
| 6 | Müdür · Müşteri kartı | Müşterinin geçmişi elinin altında |
| 7 | Karşılama | (isteğe bağlı kapanış karesi) |

Başlık metinleri önerilerdir — daha iyisini yaz, ama **her başlık
uygulamanın gerçekten yaptığı bir şeyi** söylemeli.

**Doğru olan iddialar (kullanılabilir):** masaüstündeki değişiklik telefona
anında düşer · personel kendi telefonundan ekip koduyla girer · Face ID ile
açılır · koyu ve açık tema.

**Kullanılamayacak iddialar:** çevrimdışı tam çalışma, yapay zekâ, otomatik
muhasebe, online ödeme — uygulamada yok.

---

## 4 · Veri

Kareler **demo salonun** gerçek ekran görüntüsünden yapılacak. Tasarımda
kullanılan ad, saat ve tutarlar demo salonda da aynen bulunmalı — tasarımın
uydurduğu bir müşteri adı ya da tutar, ekran görüntüsüyle tutmaz.
Gerçek müşteri adı ya da telefon numarası **görünmemeli** (KVKK).

---

## 5 · Görsel dil

- Markanın kendi dili: **Giriş v3 ışık alanı** (kor, mürekkep, erik, teal,
  sis kütleleri) zemin olarak kullanılabilir. Marka: `luera` + turuncu hap
  içinde `timeflow`.
- Renk envanteri: turuncu `#FF5A1F` yalnız **zaman ve eylem**. Yeni renk
  icat etme.
- Yazı tipi: **Hanken Grotesk** (başlık 800–900).
- Telefon çerçevesi çizilecekse sade ve markasız — iPhone fotoğrafı değil.
- **Koyu ve açık** iki set mi, tek set mi? Karar ver ve gerekçesini yaz.

---

## 6 · Çıktı

1. Seçilen sırayla **kareler** (1320 × 2868), her biri başlık + ekran.
2. Her karenin **başlık metni** ve **bir cümlelik gerekçe**.
3. 6,5" (1284 × 2778) için yerleşimin nasıl uyarlandığına bir not.
4. Hangi karede hangi **demo verinin** göründüğü listesi (ad, saat, tutar)
   — demo salona girilebilsin diye.

---

## Kutuya yazılacak cümle

> Luera TimeFlow App Store'a çıkıyor; mağaza sayfası için **ekran görüntüsü
> kareleri** tasarla (1320 × 2868, alpha yok, 3–10 kare). Uygulama Türk
> salon sahipleri için randevu ve işletme yönetimi: müdür salonun tamamını,
> personel kendi gününü telefondan yönetiyor. Kareler uygulamanın **gerçek
> ekranlarını** gösterir — olmayan özellik, uydurma yorum ya da sayı yok;
> **fiyat, plan, ödeme hiç geçmez** (ücretsiz tamamlayıcı uygulama). Kitle
> 40–55 yaş: kısa, okunaklı başlıklar. Marka dili Giriş v3 ışık alanı,
> turuncu yalnız zaman ve eylem, Hanken Grotesk.

**Effort: High.**
