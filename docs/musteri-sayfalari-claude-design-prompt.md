# MÜŞTERİ SAYFALARI · Online randevu + Randevu yönetimi — v1 — Claude Design promptu

**Yazıldı:** 2026-10-30. TimeFlow'da **salonun müşterisinin gördüğü yalnız iki
sayfa** var:

1. **Online randevu** — `timeflow.lueratech.com/book/<salon>`. Salon bu
   bağlantıyı Instagram profiline, WhatsApp'a, kendi sitesine koyar. Müşteri
   buradan hizmet, saat seçip randevu alır.
2. **Randevu yönetimi** — `timeflow.lueratech.com/booking/<kod>`. Randevudan
   sonra müşteriye WhatsApp'tan giden onay ve hatırlatma mesajlarındaki
   bağlantı. Müşteri randevusunu görür, yeniden planlar ya da iptal eder.

İkisi **tek ailenin iki sayfası** olacak: müşteri birinden randevu alıp
ötekinden yönetiyor. Bugün biri hep koyu, öbürü hep açık, ayrı yazı tipleri;
iki ayrı ürün gibi duruyorlar.

**Kullanıcının isteği:** "çok vasat ve çok basit". Salon bu bağlantıyı
**gururla paylaşabilmeli.** Premium, sıcak, güven veren; ama hızlı: müşteri
WhatsApp'tan tıklayıp **bir dakikada** randevu almalı.

**Effort: High.** Tek turda bitsin. Aşağıdaki her bilgi koddan doğrulandı.
Uydurma özellik, sayı, yorum, puan ("4.9 ★", "500+ mutlu müşteri"), uzman
fotoğrafı, online ödeme, kapora **ekleme**. Bunların hiçbiri bugün yok.

---

## Ekler — `musteri-sayfalari-ekleri/` klasörü, yalnız bunlar

1. `01 Luera Forms & Surfaces (yalniz bilesen dili).html` — kart, düğme,
   alan, toast ölçüleri. İçindeki İngilizce örnek metinler ürünümüz değil.
2. `02 Luera Motion Guidelines (hareket dili).html` — süre ve eğri dili.
   Hareketler buradan türesin.
3. `03 Luera Masaustu - Giris v2 Isik Alani.html` — Luera'nın "ışık alanı".
   Bu sayfalarda **salon önde**, Luera geride; ışık alanı en fazla çok sakin
   bir zemin yankısı olabilir, zorunlu değil.
4. `04 Online randevu - bugun - hizmet (telefon).jpg` — bugünkü ilk adım.
5. `05 Online randevu - bugun - tarih (telefon).jpg` — bugünkü tarih adımı.
6. `06 Online randevu - bugun (masaustu).png` — bilgisayarda açılınca.
7. `07 Randevu yonetimi - bugun (telefon).webp` — bugünkü yönetim sayfası
   (kullanıcının kendi telefonundan, WhatsApp içinden).

4–7 **yalnız içerik ve durum envanteri.** Görsel dili, düzeni ve ikonları
kopyalanmayacak.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Musteri Sayfalari v1.html`. Kareler aşağıdaki
  sırayla, her karenin başında kodu (R1, R1-b … Y7).
- **Ana kare 375 × 812** (iPhone, WhatsApp'ın içindeki tarayıcı). R1, R3 ve
  Y1'i ayrıca **430 × 932**'de göster. R8 masaüstü **1280 × 800**.
- **Tema:** açık ve koyu; önerimiz telefonun ayarını izlemesi. Kareyi tek
  düğmeyle çevir; R1, R3, R6, Y1 ve Y2'yi iki temada göster. Sabit tek tema
  daha doğruysa (bugün online randevu hep koyu) gerekçesiyle öner.
- **Fotoğraflar:** salonun kapak ve galerisi için sakin yer tutucu görseller
  kullan (gerçek kişi ya da marka içeren stok fotoğraf değil); gerçekte
  salonun kendi fotoğrafları gelecek.
- **Hareketler çalışır hâlde olsun** (karede oynasın, dokununca tetiklensin).
  Her hareket için tek satır: **özellik · ms · eğri**. `prefers-reduced-motion`
  açıkken ne olduğu da yazsın.
- Web'de çalışacak: **CSS + az JS.** Ağır kütüphane, canvas, video, Lottie yok.
  Görsel olarak yalnız salonun kendi kapak/logo/galeri fotoğrafları yüklenir.
- Yazı **Hanken Grotesk** (panelin yazısı). **Daktilo (mono) yazı yok.** Tek
  vurgu rengi turuncu (#FF5A1F); yeni renk icat etme. Emoji yok; sade çizgi
  ikonlar (Lucide ailesi).
- Açıklama kısa: karar başına tek cümle gerekçe.

---

## Bugünkü sayfalar — sorunlar

**Online randevu** (ekler 4–6):

1. **Ekranın üst %40'ı Luera'ya ait boş bir turuncu bulut** ("luera ·
   TIMEFLOW"). Salonun **kapak fotoğrafı, galerisi, tanıtım yazısı, adresi,
   telefonu, Instagram'ı ve harita bağlantısı veride var ama sayfada hiçbiri
   görünmüyor.** Müşteri hangi salonda olduğunu ancak küçük bir isimden anlıyor.
2. Logo yoksa daktilo yazılı harf kutusu ("DG"); sağ altta soluk daktilo
   "TIMEFLOW". Salonun değil, yazılımın yüzü.
3. **Her zaman koyu**, yönetim sayfası **her zaman açık**: iki ayrı ürün gibi.
4. **Tarih adımı ay takvimi:** ayın sonunda 29 gün soluk, yalnız 2 gün
   seçilebiliyor; sonraki ay için ok gerekiyor. Saatler gün seçilmeden hiç
   görünmüyor ("Önce tarih seçin").
5. Uzman seçimi 1. adımda hizmetlerin altında kalıyor; "Devam et" düğmesi
   uzun listede ekranın dışına düşüyor.
6. **Hitap karışık:** "Adın" / "Adınızı girin", "eklendin" /
   "bilgilendirileceksiniz". Bundan sonra hep **"siz"**.
7. Onay ekranı çıkmaz sokak: takvime ekle, yol tarifi, "randevumu yönet"
   yok; yalnız "Yeni Randevu Al".
8. **Masaüstünde** (ek 6) sayfa ekranın ortasında telefon boyunda bir sütun;
   ekranın üçte ikisi boş karanlık. Instagram bağlantısını bilgisayarda açan
   müşteri salonu hiç görmüyor.

**Randevu yönetimi** (ek 7):

1. Sayfa **yalnız salonun adını** biliyor: logo, adres, telefon yok. İptalden
   sonra "işletmeyle iletişime geçebilirsiniz" yazıyor ama **arama ya da
   WhatsApp düğmesi yok**.
2. Hatalar **tarayıcının uyarı kutusuyla** (alert) çıkıyor; iptal onayı
   genel bir pencere.
3. Hizmet ve Personel satırında **aynı insan simgesi**; yazı sistem yazısı.
4. **"Onay bekliyor" da yeşil** görünüyor (renk yalnız "iptal mi değil mi"ye
   bakıyor). Bekleyen randevu onaylanmış sanılıyor.
5. Yeniden planlarken eski saat ile yeni saat yan yana görünmüyor
   ("Cuma 14:00 → Cumartesi 16:30" gibi bir karşılaştırma yok).
6. Başarı ekranları çıkmaz sokak: iptalden sonra "yeni randevu al", yeniden
   planlamadan sonra "takvime ekle" yok.

---

## Ana fikir — üç söz

1. **Salonun vitrini.** Müşteri ilk bakışta salonu tanır: kapak fotoğrafı,
   logo, ad, "Şu an açık · 19:00'a kadar", adres ve yol tarifi, Instagram.
   Luera yalnız en altta küçük bir satır: "Luera TimeFlow ile".
2. **Bir dakikada randevu.** Hizmet → saat → bilgiler. Uzman isteğe bağlı
   ("Fark etmez" hazır seçili). Altta hep görünen bir çubuk: seçilen hizmet,
   süre, toplam fiyat ve tek bir ilerleme düğmesi.
3. **Randevudan sonra da aynı el.** Yönetim sayfası aynı ailenin "randevu
   kartı": ne, ne zaman, nerede, kiminle; dört net eylem (yeniden planla,
   iptal et, takvime ekle, salona ulaş). İptal sakin ama net; geri alınamaz
   olduğu söylenir.

---

## Gerçek bilgiler — yalnız bunlar yazılır

**Salon (online randevu sayfasının verisi, bugün gelen alanlar):**
- `name` (her zaman var).
- `logoUrl`, `coverUrl`, `galleryUrls[]`, `bio`, `address`, `phone`,
  `instagramUrl`, `mapsUrl` (Google Haritalar bağlantısı), `kvkkUrl`
  (salonun aydınlatma metni). **Hepsi isteğe bağlı; çoğu yeni salonda boş.**
  Tasarım **hepsi doluyken (R1)** ve **yalnız ad varken (R1-b)** iki hâlde
  güzel görünmeli.
- Çalışma saatleri: haftanın her günü için açılış–kapanış ya da kapalı. "Şu
  an açık / kapalı · yarın 09:00'da açılır" buradan hesaplanabilir.
- **Salona özel renk yok.** Kimlik kapak + logo + addan gelir.

**Hizmetler:** ad, süre (dk), renk (küçük nokta), fiyat (₺, **boş olabilir**:
fiyatsız hizmette "fiyat salonda" gibi bir şey değil, hiç yazma). Kategori
yok; düz liste. Hizmet sayısı salona göre değişir; uzun listeyi de düşün
(arama ya da gruplama gerekebilir).

**Uzmanlar:** ad, uzmanlık ("Cilt bakımı & Lazer"), renk. **Fotoğraf yok**
(baş harfli rozet). Uzman seçilmezse "Fark etmez · ilk müsait".

**Saatler:** sunucu, seçilen hizmet + uzman + gün için **boş başlangıç
saatlerini** verir (ör. 09:00, 09:30 … 18:00). Gün kapalıysa ya da dolu ise
liste boş gelir → **bekleme listesi**: ad + telefon, "Yer açılınca WhatsApp'tan
haber veririz". Katıldıktan sonra onay satırı.

**Birden çok hizmet:** müşteri sepete ikinci hizmet ekleyebilir ("+ Başka
hizmet ekle"); her hizmetin kendi saati olur; altta toplam fiyat.

**Bilgiler adımı:** Ad soyad (zorunlu), Telefon (zorunlu, 05XX XXX XX XX),
E-posta (isteğe bağlı), Not (isteğe bağlı, "Özel bir isteğiniz var mı?").
Bilgi: "Onay ve hatırlatma WhatsApp üzerinden gönderilecek."

**KVKK onayı — kutu işaretlenmeden gönderilemez, metin aynen:**
"Ad, telefon ve randevu bilgilerimin randevu yönetimi ve hatırlatma amacıyla
**<Salon adı>** tarafından işlenmesini kabul ediyorum." Salon aydınlatma
metni adresi girdiyse sonunda "Aydınlatma metni" bağlantısı. Kutu önceden
işaretli **olamaz**.

**Randevu sonucu iki türlü** (salonun ayarı):
- **Onaylandı** — "WhatsApp üzerinden onay mesajı gönderildi."
- **Talep alındı** — "<Salon> talebinizi onaylayınca WhatsApp'tan
  bilgilendirileceksiniz." (Bu hâlde randevu "Onay bekliyor"dur.)

**Randevu yönetimi bugün yalnız şunları biliyor:** salon adı; hizmet, tarih,
başlangıç–bitiş, uzman adı (boş olabilir), durum (`Onay bekliyor` ·
`Onaylandı` · `Tamamlandı` · `İptal edildi`).
- **Değiştirilebilir mi:** durum "onay bekliyor" ya da "onaylandı" **ve**
  tarih bugün ya da sonrası. Değilse eylemler yok, nedeni yazılır.
- **Yeniden planla:** bugünden itibaren **21 gün**; gün seçilince o günün boş
  saatleri; seçip onaylar. "Seçtiğiniz saat az önce doldu, lütfen başka bir
  saat seçin" hâli var.
- **Salonun aboneliği kapalıysa:** yalnız yeniden planlama kapanır ("Bu
  işletme şu anda çevrim içi değişiklik almıyor. Lütfen işletmeyi arayın.");
  **iptal her zaman açık** (müşteri cezalandırılmaz).
- **İptal:** geri alınamaz. Salona panelde bildirim düşer; salonun WhatsApp'ı
  bağlıysa müşteriye onay mesajı gider; o güne bekleme listesinde olanlara
  "yer açıldı" haberi gider.

**Yönetim sayfasına eklenecekler (küçük bir sunucu eklemesi, uygulamada
yapılacak — tasarım bunları kullanabilir ama her biri boş olabilir):** salon
logosu, adresi, telefonu, harita bağlantısı, online randevu bağlantısı
("Yeni randevu al" için), hizmetin süresi ve fiyatı.

**Takvime ekle:** her iki sayfada telefonun takvimine eklenecek dosya
(.ics) uygulamada üretilir; tasarım yalnız düğmeyi ve geri bildirimi çizer.

**Gömülü kullanım:** salon online randevuyu kendi sitesine çerçeve olarak
koyabiliyor (`?embed=1`): vitrin (kapak, salon başlığı) gizlenir, yalnız
adımlar kalır. R8'de bunu da göster.

---

## Kareler

### Online randevu — R

- **R1 · Vitrin + hizmet seçimi** (salon bilgileri dolu): kapak fotoğrafı,
  logo, ad, açık/kapalı durumu, adres + yol tarifi, telefon, Instagram,
  tanıtımın ilk iki satırı (devamı açılır), galeri (yatay kaydırma, varsa).
  Altında hizmet listesi: ad, süre, fiyat. Bir hizmet seçili; alt çubuk görünür.
- **R1-b · Yalnız salon adı var** (kapak, logo, adres yok). Boş görünmemeli.
- **R1-c · 30+ hizmetli salon** — uzun listeyi nasıl kolaylaştırdığını göster.
- **R2 · Uzman** — "Fark etmez · ilk müsait" seçili; uzmanlar baş harfli
  rozet + uzmanlıkla. Ayrı adım mı, hizmet ya da saat adımının içinde mi?
  Hızı gerekçe göstererek sen seç.
- **R3 · Gün ve saat** — ay takvimi yerine **yatay gün şeridi** öner (bugün,
  yarın, … 3 hafta; kapalı günler soluk); saatler aynı ekranda, Sabah / Öğle /
  Akşam diye gruplu. Alt çubukta "Cilt bakımı · Cuma 14:30 · ₺1.200 · Devam".
- **R3-b · Boş saat yok** → bekleme listesi formu; **R3-c** katıldıktan sonra.
- **R4 · Sepette iki hizmet** — her birinin saati, toplam süre ve fiyat; bir
  hizmeti çıkarma.
- **R5 · Bilgiler + KVKK** — klavye açıkken (iPhone) düğme görünür kalsın;
  zorunlu alan uyarısı; KVKK kutusu işaretsiz → düğme kapalı ve neden.
- **R6 · Randevu onaylandı** ve **R6-b · Talep alındı (onay bekliyor)** —
  özet kart; Takvime ekle, Yol tarifi, Randevumu yönet (WhatsApp'a gelen
  bağlantı), Yeni randevu al. Kutlama abartısız.
- **R7 · Hatalar** — salon bulunamadı (yanlış bağlantı) · "Seçtiğiniz saat az
  önce doldu" · bağlantı koptu. Tarayıcı uyarı kutusu yok, sayfa içinde.
- **R8 · Masaüstü 1280** (Instagram bağlantısı bilgisayarda açılınca; vitrin
  solda, adımlar sağda gibi) ve **R8-b · gömülü** (`?embed=1`, vitrinsiz).

### Randevu yönetimi — Y

- **Y1 · Randevu kartı · Onaylandı** — salon (logo, ad), hizmet, uzman,
  gün, saat aralığı, süre, fiyat, adres + yol tarifi; durum; dört eylem:
  Yeniden planla · İptal et · Takvime ekle · Salona ulaş (ara / WhatsApp).
  Hizmet ve uzman için ayrı ikonlar.
- **Y1-b · Onay bekliyor** — yeşil değil; bekleyen hâlin kendi rengi ve
  cümlesi ("Salon onaylayınca WhatsApp'tan haber verilecek").
- **Y2 · Yeniden planla** — eski saat üstte soluk, yeni seçim altta: "Cuma
  14:00 → Cumartesi 16:30"; 21 günlük şerit, saatler, onay. **Y2-b** boş gün,
  **Y2-c** "saat az önce doldu", **Y2-d** salon çevrim içi değişiklik almıyor
  (yalnız yeniden planlama kapalı, iptal ve "Salonu ara" açık).
- **Y3 · İptal onayı** — sayfanın içinde (alttan açılan sayfa ya da kart
  dönüşümü), tarayıcı kutusu değil. "Geri alınamaz" açıkça.
- **Y4 · İptal edildi** — Yeni randevu al (online randevu bağlantısı) ve
  Salona ulaş. **Y4-b · Güncellendi** — yeni saat, Takvime ekle.
- **Y5 · Değiştirilemez** — geçmiş, tamamlanmış ya da zaten iptal edilmiş
  randevu: kart görünür, eylemler yok, nedeni tek cümle.
- **Y6 · Bağlantı geçersiz** — "Randevu bulunamadı"; salon bilinmediği için
  yalnız Luera'nın sade hâli.
- **Y7 · Yükleniyor** — iskelet (dönen çember değil).

---

## Kısıtlar — gerçek kullanım

- Açılış çoğunlukla **WhatsApp ya da Instagram'ın içindeki tarayıcıda**:
  üstte ve altta tarayıcı çubukları, çentik, alt güvenli alan. Hover yok;
  dokunma alanları en az 44 px. Asıl düğme başparmak bölgesinde.
- Yavaş mobil bağlantı: ilk ekran salon fotoğrafı gelmeden de okunmalı
  (fotoğrafın yerinde sakin bir zemin, sonra yumuşak geçiş).
- Türkçe tarih: "Cuma 31 Ekim", saat "14:30–15:30", fiyat "₺1.200".
  Hitap **"siz"**.
- Teknik kelime yok ("token", "slot", "hata 409" gibi).
- Erişilebilirlik: metin kontrastı iki temada da yeterli; renk tek başına
  anlam taşımaz (durumlar yazıyla da söylenir).
