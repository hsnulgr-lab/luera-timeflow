# MASAÜSTÜ RANDEVU PENCERESİ · takvimde randevuya tıklayınca — yeniden — Claude Design promptu

**Yazıldı:** 2026-11-08. Takvimde (ve Panel, Masa, Berber panosunda) bir
randevuya tıklayınca açılan pencere, salonun gün içinde en çok baktığı yüzey:
müşteri geldi mi, ne kadar tutacak, kimdi bu müşteri, iptal mi edelim? Bugünkü
pencere çalışıyor ama **sıradan**: 460 px'lik dar bir kutu, üç sekme, her
durumda aynı ağırlıkta gri kutular, iptal onayı pencerenin içinde kırmızı bir
blok. Kullanıcı: "açılan pencere hoşuma gitmedi, yeni tasarım lazım."
Hedef: **bir bakışta ne durumda olduğu ve sıradaki adım belli, müşteriyi
tanıyan, premium** bir randevu penceresi.

**Effort: High.** Tek turda bitsin. Aşağıdaki her içerik maddesi gerçek ve
koddan doğrulandı (`src/components/reservations/AdisyonModal.tsx`,
`src/lib/appointmentFlow.ts`). Uydurma alan, uydurma sayı, uydurma özellik
ekleme. Yeni bir veri gerekiyorsa "yeni veri" diye işaretle; çizebilirsin ama
ayrı tut.

---

## Ekler — `randevu-penceresi-ekleri/` klasörü, yalnız bunlar

1. Bugünkü pencere — **içerik envanteri olarak** bak; düzen, sekme çubuğu ve
   kutu dili kopyalanmayacak:
   `01 bugun-ozet-onaylandi.png` · `01b bugun-ozet-notlu.png` (randevu notu
   "WhatsApp asistanı" kutusu) · `02 bugun-iptal-onayi.png` ·
   `03 bugun-adisyon.png` · `04 bugun-musteri.png` ·
   `06 bugun-musteri-geldi.png` (Müşteri geldi · bekliyor → "Adisyona git").
   Gelmedi durumunun görüntüsü yok; içeriği aşağıdaki tabloda ve "Gelmedi
   durumu iyi kurulmuş" maddesinde.
2. `07 takvim-gun-gorunumu.png` — pencerenin üstüne açıldığı takvim
   (kabin/personel sütunları; üstteki "Randevu iptal edildi · Geri Al"
   bildirimi bugünkü alt bildirim). Pencere bu ekranın üstünde yaşar.
3. `08 Luera Masaustu - Panel Rotusu.dc.html` (+ `support.js`, aynı klasörde
   durmalı) — masaüstünün son uygulanan dili; içinde "Yeni seans" penceresi
   de var. Yazı, düğme, hap, odak halkası ve koyu tema bu seviyede olmalı.
4. `09 Luera Forms & Surfaces (yalniz bilesen dili).html` — alan, açılır
   liste, kart, modal, toast ölçüleri ve hâlleri. **Yalnız bileşen dili
   için**; içindeki İngilizce örnek metinler ürünümüz değil.
5. `10 Luera Mobil - Mudur 25 Randevu Karti.html` — telefondaki müdürün
   randevu kartı. Aynı ailedendir: **durum adları, eylem sözcükleri ve
   renkler aynı** olacak (Onay Bekliyor · Onaylandı · Hizmette · Tamamlandı ·
   İptal · Gelmedi; "Müşteri Geldi", "Geç Geldi", "Tamamla & Tahsilat").
   Görsel kopyası değil; masaüstü kendi ölçüsünde.

Durumlar.html ve Hareket Sözleşmesi bu işin eki DEĞİL.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Masaustu - Randevu Penceresi v1.html`. Kareler
  aşağıdaki sırayla, her karenin başında kodu (R0, R1 … R9).
- **Ana kare 1440 × 900**: takvim gün görünümü arkada (karartılmış), pencere
  önde. Ayrıca **1024 × 768** ve **768 × 1024** (masaüstü yüzü 768 px'e kadar
  açılıyor; daha darı telefon yüzü, onu çizme).
- **Biçim serbest:** ortada modal, sağdan çekmece ya da randevu kartının
  yanında açılan panel — hangisi daha iyiyse. Kararını tek cümleyle gerekçelendir.
  Kısıt: takvimin hangi gününde olduğunu ve randevunun takvimdeki yerini
  kullanıcı kaybetmemeli.
- **Tema:** açık ve koyu, tek düğmeyle. R1, R4 ve R7'yi iki temada göster.
- **Açıklama kısa:** karar başına tek cümle; hareket için tek satır
  (özellik · ms · eğri).
- Web'de çalışacak: **CSS + az JS.** Ağır kütüphane, canvas, video yok.

---

## Bugünkü pencere — sorunlar

1. **Durum ile eylem ayrı yerlerde.** "Onaylandı · 17 saat sonra" bir kutuda,
   "Müşteri Geldi" altta ayrı dev bir düğmede. Durum ve sıradaki adım tek
   bir bütün olmalı.
2. **Üç sekme fazla.** Özet / Adisyon / Müşteri: en çok sorulan iki şey
   ("ne kadar?" ve "kim bu?") sekme arkasında. Müşteri sekmesi yalnız toplam
   harcama, randevu sayısı, telefon ve geçmiş listesi.
3. **İptal onayı kaba.** Pencerenin ortasında kırmızı bir blok, iki eşit
   düğme. İptal geri alınabilir bir işlem (8 sn "Geri Al"), dramatik olmamalı
   ama yanlışlıkla da yapılmamalı.
4. **Kimlik zayıf.** Başlıkta yalnız ad, hizmet ve uzman. Müşterinin paketi,
   borcu, son ziyareti, "WhatsApp'tan mı geldi?" gibi bilgiler yok ya da
   sekme arkasında.
5. **Adisyon form gibi.** Açılır liste ile ürün ekleme, düz bir indirim
   kutusu, dört eşit ödeme yöntemi düğmesi; tutar en altta.
6. **Küçük ama göze batan:** geçmişte tarih "2026-11-11" biçiminde (insan
   diliyle olmalı: "11 Kasım Çarşamba"); geçmişteki ve gelecekteki randevu
   aynı "Onaylı" etiketini taşıyor; randevu notu ("WhatsApp asistanı") boş
   bir giriş kutusu gibi görünüyor.
7. **Gelmedi durumu iyi kurulmuş** (üç seçenek: Gelmedi olarak kapat · Geldi,
   geç kaldı · Başka güne al). Bu mantık korunacak, görünüşü yenilenecek.

---

## İçerik envanteri (hepsi gerçek)

### Başlık / kimlik
- Müşteri adı (diş sektöründe "Hasta"), baş harfli avatar.
- Hizmet(ler) ve uzman. **Çoklu hizmetli seans**: aynı müşterinin art arda
  birden çok hizmeti tek grup; her kalem: hizmet · saat aralığı · uzman.
- Tarih, başlangıç–bitiş, süre (ör. "8 Kasım Pazar · 17:00–18:30 · 90 dk").
- Kabin/ünite adı (varsa), randevu notu (varsa).
- **Kaynak** (kayıtta var): manuel · online randevu · WhatsApp · LeadFlow.
  WhatsApp asistanının aldığı randevu fark edilsin.
- **Hatırlatma cevabı** (veritabanında var, panelde henüz okunmuyor → "yeni
  gösterim"): müşteri 24 saat hatırlatmasına "Evet" ya da "Hayır" dediyse
  görünsün ("Gelirim dedi").

### Durum + sıradaki adım (appointmentFlow.ts — tek kaynak)
| Durum | Ne zaman | Açıklama satırı | Birincil eylem |
|---|---|---|---|
| Onay Bekliyor | status=pending | Randevu henüz onaylanmadı. | **Randevuyu Onayla** |
| Onaylandı | gelecekte | "17 saat sonra" / "şimdi"; müşteri gelince bas | **Müşteri Geldi** |
| Müşteri geldi · bekliyor | geldi işaretli, başlamadı | "Kemal haberdar edildi." | (hesabı aç) |
| Hizmette | başladı | Seans sürüyor; bitince tamamla ve tahsil et | **Tamamla & Tahsilat** |
| Gelmedi | saat + 30 dk geçti, geldi yok (ya da elle damgalandı) | "Randevu saati 45 dk önce geçti" | üç seçenek: **Gelmedi olarak kapat** · **Geldi, geç kaldı** · **Başka güne al** |
| Tamamlandı · tahsilat bekliyor | bitti, ödenmedi | Hesap Kasa'da kapanınca seans biter | **Tahsil et** |
| Tamamlandı · ödendi | bitti + ödendi | Seans kapandı | — |
| İptal edildi | status=cancelled | Takvimde yer tutmuyor | — |

Diş sektöründe ayrıca **"Hasta Ziyaretini Aç"** (ziyaret ekranına gider).

### Hesap (bugünkü Adisyon sekmesi)
- Satırlar: her hizmet (uzman adıyla, hizmet fiyatı), personelin seans
  sırasında eklediği kalemler (Ürün · Malzeme · Ekstra), masada eklenen ürün
  (silinebilir).
- Ürün ekle (stoktaki satış ürünlerinden, fiyatıyla).
- İndirim (₺).
- Ödeme yöntemi: Nakit · Kart · Havale · Diğer.
- Toplam (büyük). Düğme hâlleri: **"1.250 ₺ Tahsil Et"** · toplam 0 ve hizmet
  varsa **"Ücretsiz Tamamla"** · Kasa modülü kapalıysa **"Randevuyu
  Tamamla"** (para tutulmaz) · hiçbir şey yoksa pasif "Tutar yok".
- Ödendiyse: tahsilat satırları (açıklama · uzman · yöntem · tutar),
  "Tahsil edilen" toplamı, **"Ödemeyi geri al"**.

### Müşteri (bugünkü Müşteri sekmesi + asistanın zaten bildikleri)
- Yaşam boyu değer (₺), toplam randevu.
- Telefon, "… tarihinden beri müşteri".
- Paketler: ad · "4/10 kaldı".
- Randevu geçmişi (son 8): hizmet · tarih saat · durum.
- Müşteri notu.
- **Bakiye** (borç / alacak) ve **tercih** ("en sık: cilt bakımı · Nisanur
  Hanım ile · genelde Cuma 14:00"): sistemde hesaplanıyor (WhatsApp
  asistanının müşteri kartı), pencerede gösterilmesi yeni; bunu "yeni
  gösterim" diye işaretle.
- "Müşteri kartını aç" bağlantısı (müşteriler sayfasındaki tam kart).

### Alt eylemler
- **Düzenle** (yeni seans penceresi düzenleme hâlinde açılır).
- **Randevuyu iptal et** → onay. Onayda:
  - açıklama: "Saat boşa çıkar." + paket seansıysa "Paket hakkı kullanılmamış
    sayılır." + ödendiyse "Alınan ödeme Kasa'da kalır."
  - **"Müşteriye WhatsApp'tan haber ver"**: **varsayılan işaretli**
    (kullanıcı kararı 2026-11-08). WhatsApp bağlı değilse pasif ve yanında
    "WhatsApp bağlı değil". Müşterinin telefonu yoksa hiç çıkmaz.
  - İptal sonrası alt bildirim: "Randevu iptal edildi · Geri Al"; haber
    işaretliyse "Müşteriye birkaç saniye içinde WhatsApp'tan haber
    verilecek." Mesaj 8 sn sonra gider; Geri Al'a basılırsa gitmez.
- Gelmedi ve iptal için de alt bildirimde "Geri Al".

---

## Kareler

- **R0** · Tasarım kararı: biçim (modal / çekmece / panel), ölçü, bölge
  yerleşimi tek şemada.
- **R1** · Onaylandı, yarın 17:00, tek hizmet, paketli tanıdık müşteri
  (WhatsApp'tan gelmiş, hatırlatmaya "Evet" demiş). Birincil: Müşteri Geldi.
- **R2** · Onay Bekliyor (online randevudan, yeni müşteri, geçmişi yok).
- **R3** · Müşteri geldi · bekliyor → Hizmette.
- **R4** · Hizmette, çoklu hizmet (3 kalem, iki uzman), hesap açık: ürün
  eklenmiş, %10 indirim, Kart seçili, "1.350 ₺ Tahsil Et".
- **R5** · Gelmedi: üç seçenek.
- **R6** · Tamamlandı · tahsilat bekliyor ve Tamamlandı · ödendi (geri al ile).
- **R7** · İptal onayı (haber kutusu işaretli) + iptal sonrası alt bildirim.
- **R8** · Müşteri bölümü dolu hâli: borçlu, iki paketli, uzun geçmişli müşteri.
- **R9** · Kenar hâller: Kasa modülü kapalı · WhatsApp bağlı değil ·
  telefonsuz müşteri · diş sektörü ("Hasta", "Hasta Ziyaretini Aç") · çok uzun ad
  ve hizmet adı.

---

## Kurallar

- **Dil:** Türkçe, "siz". Sektör sözcüğü cümle içinde (seans / randevu /
  tedavi); diş sektöründe "Hasta".
- **Para:** "1.250 ₺" biçimi; kuruş yok.
- **Renk anlamı sabit:** onay bekliyor = amber, hizmette / tahsilat = turuncu,
  tamamlandı = yeşil, gelmedi / iptal = kırmızı, iptal edildi = sönük.
- **Tek birincil eylem:** her durumda bir tane belirgin düğme; diğerleri ikincil.
- **Klavye:** Esc kapatır, Enter birincil eylemi yapmaz (yanlışlıkla tahsilat
  olmasın), sekme sırası mantıklı, odak halkası görünür.
- **Hareket:** açılış/kapanış ve durum geçişi için tek satır şartname; 200 ms'yi
  geçmesin, "prefers-reduced-motion"da kapansın.
- Pencere ekranın %90'ını aşmasın; uzun geçmiş kendi içinde kaysın, birincil
  eylem her zaman görünür kalsın.
