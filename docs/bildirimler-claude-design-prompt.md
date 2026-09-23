> **BU TUR İPTAL EDİLDİ (2026-09-23) — ÇALIŞTIRMAYIN.**
>
> Kullanıcı haklı olarak sordu: "bildirimler zaten standart değil mi?"
> Doğru — bildirimin görünümünü işletim sistemi çiziyor, ayar ekranı zaten
> mevcut bileşenlerle çizili ve ekran dosyası yazılı. Geriye kalan tasarım
> değil KARAR'dı; üç soru sorulup cevaplandı
> (bkz. `docs/devir/01-NE-YAPTIK.md` · Bölüm C).
>
> Dosya silinmedi çünkü neyin neden tasarlanmadığını anlatıyor.

# Bildirimler · Telefona düşen uyarı — Claude Design promptu

**Ekler:**
1. `Luera Mobil - Mudur 10 Profil.html` — profil ekranının onaylı dili
   (grup, satır, anahtar, altyazı). **Bu turda profil yeniden tasarlanmıyor.**
2. `Luera Mobil - Personel 01 Bugun.html` — personelin ana ekranı; izin
   kartının duracağı yer burası.
3. `Luera Mobil - Hareket Sözleşmesi.html` — hareket sözlüğü.
4. **Ekran görüntüsü:** bugünkü müdür profili (Bildirimler satırı gizli).

**Effort: High.**

---

## 0 · Bu tur neden var

Bildirim altyapısı yazılıyor: telefon **kapalıyken de** uyarı düşecek.
Sunucu tarafı yıllardır duruyor ama yanlış kanaldaydı (tarayıcı push'u);
şimdi native kanal ekleniyor.

Kod yazılabilir durumda. Tasarlanmamış olan **yüzey**: izin ne zaman ve nasıl
istenecek, reddedilirse ne yazacak, bildirimin kendisi ne diyecek, ayar
ekranı neye benzeyecek.

Bugün ortada iki **ölü yüzey** var ve ikisi de bu turda gerçeğe bağlanacak:

- **Müdür bildirim ekranı yazılmış ama kapalı** — `MANAGER_NOTIFICATIONS_READY
  = false` ve ekran kendini `Redirect` ile geri atıyor. Arkasında hiçbir şey
  yoktu; olmayan bir şeyin anahtarını göstermek yalan olurdu.
- **Personel profilindeki üç bildirim anahtarı silindi** (2026-09-05) —
  üçü de sahteydi. Yerinde tek cümle duruyor: *"Bildirimler henüz gelmiyor.
  Yeni randevularınızı Bugün sekmesinde görürsünüz."*

Bu turdan sonra o cümle değişecek.

---

## 1 · Bildirimin GERÇEĞİ — değişmez

Tasarım bu listeye uymak zorunda. Burada olmayan bir olay tasarıma girmez.

### Personele giden 5 bildirim (sunucuda ÇALIŞIYOR)

| Ne oldu | Ne zaman | Dokununca gidilecek yer |
|---|---|---|
| Randevu sana atandı | Randevu oluşturulunca ya da personeli değişince | Takvim |
| Müşterin geldi | Müşteri geldi işareti konunca | Bugün |
| Randevu iptal edildi | Durum iptale dönünce | Bugün |
| Randevu saati değişti | Tarih ya da saat değişince | Bugün |
| Sıradaki randevun yaklaşıyor | Başlamasına ~15 dk kala | Bugün |

### Müdüre giden 3 bildirim (bu işle AÇILIYOR)

| Ne oldu | Ne zaman | Dokununca gidilecek yer |
|---|---|---|
| Yeni randevu talebi | Onay bekleyen randevu düşünce (web/WhatsApp) | Takvim |
| Randevu iptal edildi | Durum iptale dönünce | Takvim |
| Adisyon kasada | İşlem bitti, ödeme alınmadı | Kasa |

### Bu turda OLMAYAN — tasarıma konmayacak

- **Gün sonu özeti** — dış zamanlayıcı gerektiriyor, bu işin dışında.
- **"Müşteri gelmedi"** — sunucuda böyle bir olay yok; gelmeme telefonda
  saatten hesaplanıyor, gönderilecek bir an yok.

> Bugünkü müdür ekranında bu ikisinin anahtarı **var** ve ikisi de karşılıksız.
> Bu turda listeden çıkıyorlar. Karşılığı olmayan anahtar çizilmez.

### Değişmeyen kurallar

- **Bildirim veri taşımaz** — telefon haberi alır, veriyi kendi yolundan çeker.
- **Bildirim gelmese de iş olur.** Zil çalmadı diye randevu kaydedilmemezlik
  etmez. Bildirim bir kolaylık, bir güvence değil.
- **Uygulama açıkken ekran zaten kendi kendine tazeleniyor** (canlı zil).
  Bildirim bunun yerine geçmiyor, üstüne geliyor.

---

## 2 · Tasarlanacak 8 durum

### B1 · İzin isteme anı — MÜDÜR

İşletim sistemi izni bir kez sorulur; reddedilirse bir daha sorulamaz, sadece
Ayarlar'dan açılır. Bu yüzden **neden istendiği sorudan ÖNCE** söylenmeli.

- Tetik: Profil → Bildirimler ekranında ilk anahtar açılınca.
- Sistem diyaloğundan önce bir karşılama: ne için, hangi olaylarda.
- Uzun olmayacak. Müdür zaten anahtarı açarak niyetini söylemiş.

**Karar ver:** ayrı bir sayfa mı, alt sayfa (sheet) mı, yoksa ekranın
üstünde duran bir blok mu? Gerekçesini yaz.

### B2 · İzin isteme anı — PERSONEL

Personelin bir ayar ekranı yok; profili dar ve operasyonel. İzin başka türlü
istenmeli.

- Tetik: Bugün ekranında **bir kez** görünen, kapatılabilir bir kart.
- Personel için değer cümlesi müdürünkinden farklı: müdür salonu izler,
  personel **kendi işini kaçırmamak** ister.
- Kapatılırsa bir daha çıkmaz. Kapatan personel sonradan nereden açar?
  **Bu soruyu cevapla** — profilde bir yol olmalı.

### B3 · İzin reddedildi

En kolay yalan söylenecek yer burası: anahtar açık görünür, bildirim gelmez.

- Anahtar tek başına "açık" diyemez. İzin yoksa ekran bunu **söyleyecek**.
- Durum + çıkış yolu ("Ayarları aç" → sistem ayarları).
- Mevcut `AmberNote` bileşeni bu iş için var (etiket + metin + eylem).

**Karar ver:** izin yokken anahtarlar nasıl görünür — kapalı mı, sönük mü,
hiç mi görünmez? Üçünün de bir bedeli var, birini seç ve gerekçelendir.

### B4 · Bildirimin kendi metinleri

Yukarıdaki 8 olayın her biri için başlık + gövde. Kilit ekranında, bildirim
merkezinde ve banner'da okunacak.

- Kısa. Kilit ekranı iki satır gösterir.
- **Saat geçsin mi?** "14:30 randevun" mu, "Yeni randevun var" mı?
- **İsim geçsin mi?** — bu bir KVKK sorusu. Müşterinin adı kilit ekranında,
  telefon masadayken herkese görünür. Salon ortamında bu risk gerçek.
  **Karar ver ve gerekçelendir.** İki seçenekli bir ayar önerme — ayar
  sayısını artırmak çözüm değil.
- Aynı randevunun ikinci bildirimi birincinin üstüne yığılmıyor (sunucu
  bunu zaten `tag` ile hallediyor). Metinler buna göre **tek başına anlamlı**
  olmalı; "güncellendi" gibi bir öncekine yaslanan cümle olmaz.

### B5 · Müdür ayar ekranı

Mevcut ekran yeniden düzenleniyor: **3 anahtar** (Yeni randevu talebi ·
Randevu iptali · Adisyon kasada) + izin durumu + açıklama.

- Ana anahtar (hepsini kapat) olacak mı? Bugünkü metin "Dördü de kapalıysa
  bildirim gelmez; ayrı bir ana anahtar yok" diyor — bu karar **hâlâ doğru mu**?
- Üç anahtarın da kapalı olduğu hâl ne gösterir?
- Mevcut bileşenler: `Group`, `SwitchRow`, `Foot`, `AmberNote`, `ProfileNav`.

### B6 · Personel ayar satırı

Personelde **tek ana anahtar**: Bildirimler açık / kapalı. Olay başına anahtar
yok — atama, iptal ve saat değişikliği operasyonel bilgi; personelin bunları
seçmeli kapatması onu kendi gününe karşı körleştirir.

- Bu kararı kullanıcıya **bir cümleyle** anlat. Savunma değil, bilgi.
- Nereye konacak? Personel profilinde bugün `SwitchRow` hiç yok — bu ilk
  anahtar olacak. Hangi grubun içinde?

### B7 · Uygulama AÇIKKEN bildirim gelirse

Canlı zil zaten ekranı tazeliyor. O anda bir de banner düşerse aynı haber
iki kez verilmiş olur.

**Karar ver:** banner göster, ses çalma? Hiç gösterme? Yoksa yalnız haberin
ilgili olmadığı ekrandayken mi göster (personel Kumanda'dayken yeni atama
bildirimi gibi)?

Üçüncüsü en doğru görünüyor ama **ekranın neyi gösterdiğini bilmeyi**
gerektiriyor. Maliyeti göze alıp almadığını söyle.

### B8 · Bildirime dokununca

Uygulama açılır ve hedef ekrana gidilir. Uygulama kapalıysa açılış ekranından
sonra gidilir — arada bir boşluk olur.

- Hedef satır **vurgulanacak mı**? (Canlı değişim turunda turuncu "yeni"
  vurgusunu bilinçli olarak ALMAMIŞTIK. Burada da aynı karar mı geçerli?)
- Uygulama kapalıyken açılış → hedef arasındaki boşlukta ne görünür?
- Hedef artık yoksa (randevu silinmiş, iptal olmuş) ne olur? **Yanlış ekrana
  atmaktansa hiç gitmemek** kuralı geçerli — ama kullanıcıya ne denir?

### B9 · Rozet (badge) — kısa soru

Uygulama simgesinde sayı gösterilecek mi?

Doğru bir sayı, hangi bildirimin **okunduğunu** takip etmeyi gerektirir; o
takip bugün yok. Yanlış sayı göstermek yasak.

**Karar ver:** rozet yok mu, yoksa sayı yerine nokta mı, yoksa takip kurmaya
değer mi? Değerse ne takip edilecek?

---

## 3 · Sınırlar — pazarlığa kapalı

- **Mevcut kart tasarımı ve Akış'ın sırası değişmez.** Bu tur bildirim
  yüzeyini tasarlıyor, ekranları yeniden çizmiyor.
- **Hareket:** yalnız `opacity`, `translateY`, `scale`. Yükseklik, renk,
  gölge animasyonu yok. Düzen geçişi yok.
- **Mevcut bileşenler kullanılır**, yenisi icat edilmez: `Group`, `SwitchRow`,
  `ProfileRow`, `Foot`, `AmberNote`, `PrimaryButton`, `GhostButton`,
  `ProfileNav`, `EmptyBlock`.
- **Karşılığı olmayan hiçbir şey çizilmez.** Gün sonu özeti ve "müşteri
  gelmedi" bu turda YOK.
- **Ekran hiçbir koşulda olmamış bir şeyi olmuş gibi göstermez.** İzin yokken
  "açık" yazmaz; bildirim gitmediyse "gönderildi" demez.
- Türkçe. Kısa cümle. Kullanıcıya ne yapacağını söyleyen dil — "hata oluştu"
  değil.

---

## 4 · Çıktı

**Tek HTML dosyası:** `Luera Mobil - Bildirimler.html`

Bölüm sırası: B1 → B9. Her bölümde çizim + kararın **bir cümlelik gerekçesi**.
Tek tema anahtarı (açık/koyu) üstte.

Sonunda üç başlık:

- **ALINMASI ŞART** — bunlar olmadan bildirim yüzeyi eksik
- **OPSİYONEL** — iyi olur ama bu tur olmadan da çıkılır
- **BİLİNÇLİ OLARAK YAPMADIM** — ve nedeni

Varsayım yaptıysan en sona **VARSAYIMLARIM** listesi koy. Brief'te
bulamadığın bir şey varsa **üretmeden önce sor**.
