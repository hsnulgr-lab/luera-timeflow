# Canlı uygulama · 1.0 ekran görüntüleri

**Alındığı gün:** 2026-10-09, App Store sürümünden, Demo Güzellik Salonu
verisiyle. iPhone, açık tema.

**Bunlar bağlayıcı referans.** Aynı klasördeki `.html` tasarım dosyaları
birer tur önceki hâli gösteriyor; çelişki olursa **bu görüntüler geçerli.**

---

## Müdür kabuğu — Akış · Takvim · + · Kasa · Profil

| Dosya | Ekran | Ne gösteriyor |
|---|---|---|
| `mudur-01-akis.webp` | Akış | Gün başlığı, personel şeridi (DT/ED/SK · işlemde/müsait), satır dili: **TAHSİLAT ALINDI**, **İŞLEM BAŞLADI** + koyu sayaç kartı |
| `mudur-02-akis-kaydirilmis.webp` | Akış · aşağı | **UZUN BEKLİYOR** (50 dk · "Personele söyle"), **ADİSYON BEKLİYOR** (₺1.500), **SIRADAKİ RANDEVU**. Gün cetveli yukarıda |
| `mudur-03-takvim.webp` | Takvim | Hafta şeridi, üç personel sütunu, saat rayı 09:00→ |
| `mudur-04-takvim-kaydirilmis.webp` | Takvim · aşağı | Randevu kartları, şimdi çizgisi |
| `mudur-05-randevu-kur.webp` | Randevu (+) | "Kim ve ne" koyu başlık, müşteri arama, SON GELENLER, kapalı CTA |
| `mudur-06-kasa.webp` | Kasa | Bugün/Bu hafta/Bu ay, BUGÜN GİREN, turuncu "1 adisyon tahsil edilmedi" şeridi, HAREKETLER |
| `mudur-07-profil.webp` | Profil | Açılış kartı (09:00–19:00 · kapanışa 3 sa 45 dk) + satırlar |
| `mudur-08-musteriler.webp` | Müşteriler | Arama, bugünküler saatle, geçmiş gün etiketiyle |
| `mudur-09-personel.webp` | Profil → Personel | Telefon bağla kartı, ekip listesi, **altta bilgisayar duvarı cümlesi** |
| `mudur-10-hizmetler.webp` | Profil → Hizmetler | Renk şeridi, süre, fiyat, **başlıkta "+"** (telefonda hizmet eklenebiliyor) |
| `mudur-11-calisma-saatleri.webp` | Profil → Saatler | Yedi gün, bugün işaretli |
| `mudur-12-personel-gunu-islemde.webp` | **Bir personelin günü · işlemde** | Büyük avatar, İŞLEMDE çipi, koyu hâl kartı (SÜRÜYOR · 51:01), SIRADAKİ listesi, altta Randevu ver / Ara |
| `mudur-13-personel-gunu-musait.webp` | **Bir personelin günü · müsait** | Aynı ekran, ŞU AN BOŞ · 34 dk kartı, şimdi çizgisi |

> `mudur-12` ve `mudur-13` tek kişilik modun ana ekranının iskeleti.

## Personel kabuğu — Bugün · Takvim · Müşteriler · Profil

| Dosya | Ekran | Ne gösteriyor |
|---|---|---|
| `personel-01-bugun.webp` | Bugün | Hafta şeridi, randevu kartları, sağda sayaç (63:49) ve **UZADI** rozeti, şimdi çizgisi |
| `personel-02-kumanda-islemde.webp` | Kumanda · işlemde | Komşu iş şeridi, 96 pt geçen süre, plan çizgisi (+13 dk), **Bekleme kur**, adisyon şeridi, **BİTİR · basılı tut** |
| `personel-03-adisyon-acik.webp` | Kumanda · adisyon | Maskeli toplam, kalem listesi, "Adisyonu kasaya gönder" |
| `personel-04-bekleniyor.webp` | Kumanda · bekleniyor | "121 dk BAŞLAMAYA", **Kaydır ve başlat** çubuğu |
| `personel-05-takvim.webp` | Takvim | Müdür takvimiyle aynı bileşen, "2 tanesi sizin" |
| `personel-06-musteriler.webp` | Müşteriler | Liste, sağda gün etiketi |

---

## Bu görüntülerden okunan bağlayıcı kurallar

1. **Sekme çubuğu etiketli.** iOS kendi yüzen kapsülünü çiziyor; biçim
   sistemden geliyor. Etiketler kalıyor.
2. **Müdürde beş, personelde dört sekme.** Sayı değişmiyor.
3. **Koyu eylem kartı** satırın içinde yaşıyor: durum kelimesi + büyük sayı +
   tek düğme. Tek kişilik modun bütün eylemleri bu kartta toplanacak.
4. **Akış'ta özet şeridi yok.** Ciro ve adisyon Kasa'da.
5. **Para maskesi** kumandada ve adisyonda var (üç nokta + kapalı göz),
   Kasa'da yok.
6. **Durum rengi tek başına konuşmuyor**, yanında kelimesi var.

---

## Ek · Gün ekranı için işaret edilen üç kare (2026-10-09)

| Dosya | Ne gösteriyor |
|---|---|
| `personel-07-bugun-koyu.webp` | Personel Bugün, koyu tema — **gün başlığı + hafta şeridi + kart listesi**. Tek kişilik Gün ekranının iskeleti bu |
| `mudur-14-akis-baslik.png` | Müdür Akış başlığı, yakın — "Cum." + "9" + özet satırı + avatar şeridi |
| `personel-08-kart-yakin.png` | Randevu kartının yakını — saat kartın dışında solda, ad, sağda süre, altında hizmet |
