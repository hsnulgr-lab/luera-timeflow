# MASAÜSTÜ KURULUM SİHİRBAZI · timeflow.lueratech.com/kurulum — v2 — Claude Design promptu

**Yazıldı:** 2026-10-19. Apple, Google ya da e-postayla kaydolan **herkes**
girişten hemen sonra bu ekrana düşüyor; yani ürünün ilk izlenimi burası.
Bugünkü sihirbaz Ağustos'tan kalma: 8 ekran, eski logo, eski dil. Girişte
yeni "Işık alanı"ndan gelen kişi bir anda eski bir forma çarpıyor.

**Kullanıcının ana isteği: ÇOK AZ ADIM, AZ VE ÖZ.** Hedef: **3 kısa ekran +
bitiş.** Sorulmasa da olacak her şey sorulmaz; varsayılanla kurulur ve
sonra Ayarlar'dan değişir.

**Effort: High.** Tek turda bitsin. Aşağıdaki her içerik maddesi gerçek ve
koddan doğrulandı; uydurma alan, uydurma sayı ya da uydurma özellik ekleme.

---

## Ekler — `kurulum-ekleri/` klasörü, yalnız bunlar

1. `01 Luera Kurulum Sihirbazi (bugunku, Agustos).html` — bugünkü sihirbazın
   tasarımı; sayfa bunun birebir uygulaması. **Yalnız içerik envanteri
   olarak** bak: düzeni, 8 ekranlık akışı ve görsel dili kopyalanmayacak.
2. `02 Luera Masaustu - Giris v2 Isik Alani.html` — kullanıcının bir saniye
   önce gördüğü ekran: marka (luera + timeflow etiketi), yazı, düğme, odak
   halkası, "eylem opak" kuralı. Kurulum bunun **devamı** gibi hissettirmeli.
   Işık alanının sakin bir yankısı olabilir ama form okunurluğu önce gelir.
3. `03 Luera Masaustu - Ayarlar v1.html` (+ yanındaki `support.js`) —
   uygulamanın içindeki en yeni dil. Kurulumda girilen her şey (hizmet
   satırı, saat satırı, WhatsApp bağlama) daha sonra **burada** düzenleniyor.
   Satırlar iki yerde aynı aileden görünmeli.
4. `04 Luera Forms & Surfaces (yalniz bilesen dili).html` — web form kiti:
   alan, anahtar, kart, toast ölçüleri ve hâlleri. İçindeki İngilizce örnek
   metinler ürünümüz değil.

Durumlar.html ve Hareket Sözleşmesi bu işin eki DEĞİL.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Masaustu - Kurulum v2.html`. Kareler aşağıdaki
  sırayla, her karenin başında kodu (K1, K1-b … Ş1).
- **Ana kare 1440 × 900.** Ayrıca K1 ve K2 için **1024 × 768** ve
  **768 × 1024**. Masaüstü yüzü 768 px'e kadar açılıyor, daha darı telefonun
  işi; onu çizme.
- **Tema:** açık ve koyu. Tek düğmeyle değişsin, kareyi iki kez çizme. K1, K2
  ve B'yi iki temada göster.
- **Açıklama kısa:** karar başına tek cümle gerekçe; hareket için tek satır
  (özellik · ms · eğri).
- Web'de çalışacak: **CSS + az JS.** Ağır kütüphane, canvas, video yok.
- Renk, yazı ailesi ve ölçüler eklerden (Giriş v2 + Ayarlar v1). **Yeni renk
  icat etme**; tek vurgu turuncu. Emoji yok; sade çizgi ikonlar (Lucide
  ailesi).

---

## Bugünkü sihirbaz — sorunlar (koddan ve canlı denemeden)

1. **Çok uzun:** karşılama + 7 soru ekranı + bitiş. Üstte "Adım 1 / 8".
2. **Kendi sözünü tutmuyor:** karşılama "Üç şeyi soracağız" diyor, sonra 7
   ekran soruyor. "Yaklaşık 6 dakika" yazıyor; uygulamanın üstündeki
   kurulum şeridi aynı adımlar için 10 dakika hesaplıyor.
3. **İşletme adı alanı yanlış dolu açılıyor:**
   - E-postayla kayıt işletme adını sormuyor; sunucu ad yerine **e-posta
     adresini** yazıyor. Sihirbaz bunu "işletme adı" diye önüne koyuyor.
   - Apple ya da Google ile kayıtta alanda **kişinin kendi adı** duruyor.
4. **"Yalnız ben çalışıyorum" yarım:** telefonun tek kişilik ayarını
   yazmıyor. Masaüstünde "yalnız ben" diyen kişi telefonda ekipli müdür
   ekranını görüyor.
5. **Olmayan bir özellik vaat ediliyor:** ekip adımında her ismin altında
   "Davet gönderilmedi" ve "Giriş davetlerini tek tuşla gönderirsiniz"
   yazıyor. Böyle bir davet yok; personel ekip kodu ve kendi şifresiyle
   giriyor.
6. **Online randevu adresi hiç oluşmuyor:** sihirbaz sormuyor, sistem de
   kendiliğinden açmıyor. Bitişteki "Online randevu linkini paylaş" kartı
   adresi boş bir sayfaya götürüyor; müşteri randevu alamıyor.
7. **Ödemeden dönen kişiye hiçbir şey söylenmiyor:** sitede plan seçip
   kaydolan kişi ödemeden sonra doğrudan buraya düşüyor
   (`/kurulum?checkout=success`). Sihirbaz parasının alınıp alınmadığını,
   denemenin ne zaman bittiğini söylemiyor.
8. **Eski logo:** "luera." (noktalı). Yeni marka: **luera + timeflow
   etiketi** (Giriş v2'deki gibi).
9. **İkinci kaynak türü sorulmuyor:** kuaförde Koltuk + Yıkama,
   fizyoterapide Terapi alanı + Cihaz var; kaynak adımı yalnız ilkini
   soruyor. Bu adım her işletmeye ayrı bir ekran olarak geliyor.
10. Hizmet tablosunda **renk sütunu**, saatlerde **randevu aralığı**,
    kimlikte **harita linki ve logo**: ilk 5 dakikada gerekmeyen ama ekranı
    kalabalıklaştıran alanlar.

---

## Ana fikir — üç söz

1. **Az sor.** Yalnız şunlar sorulur: uygulama onlarsız doğru çalışmıyorsa
   ya da müşteriye yanlış bir şey gidiyorsa. Kalan her şey makul bir
   varsayılanla kurulur ve bitişte "sonra eklersiniz" diye anılır.
2. **Hazır getir.** Kullanıcının işi doldurmak değil **onaylamak**:
   sektöre göre hazır hizmet listesi, hazır saat düzeni, addan üretilmiş
   randevu adresi. Boş tablo yok.
3. **Söz tut.** Kaç ekran olduğu baştan belli, ve doğru. Her ekran "Devam"da
   kendini kaydeder; yarıda bırakan hiçbir şeyini kaybetmez. Sunucu
   onaylamadan bir sonraki ekrana geçilmez.

---

## Akış — 3 ekran + bitiş

```
K1  İşletmeniz            ad · ne iş yaptığınız · kaç kişisiniz     (zorunlu)
K2  Hizmetler ve saatler  hazır liste · hazır saat düzeni           (zorunlu)
K3  WhatsApp              QR ile bağlama · AI asistan anahtarı      (atlanabilir)
B   Bitti                 randevu adresi · özet · sıradaki 3 iş
```

- **Karşılama ekranı YOK.** Kişi kayıttan yeni geldi; "hoş geldiniz" K1'in
  başlığında tek satır olur. Örnek: "Hoş geldiniz. Üç kısa soru, sonra
  hazırsınız."
- İlerleme göstergesi **3 parçalı.** Süre yazılacaksa **"yaklaşık 4
  dakika"** (adım başına ölçülü bütçe 1 + 2 + 1); daha azını yazma.
- **Çıkış her an var:** sağ üstte "Sonra tamamlarım". Uygulama açılır, üstte
  şerit kalır (Ş1). Bugün sol menü daraltılmış duruyor. Önerim: kurulum
  **tam ekran odak** sayfası olsun, menü olmasın. Daha iyisini bulursan
  gerekçesini yaz.

**Sihirbazdan çıkarılan ve varsayılanla kurulanlar** (bitişte ya da
Ayarlar'da):

| Ne | Varsayılan | Nerede değişir |
|---|---|---|
| Adres, telefon, harita linki, logo | boş | Ayarlar › İşletme profili (bitişte öneri olarak) |
| Randevu aralığı | 30 dk | Ayarlar › Çalışma saatleri |
| Hizmet rengi | otomatik palet | Ayarlar › Hizmetler |
| {Kaynak} adları | "{Kaynak} 1", "{Kaynak} 2"… | Ayarlar › {Kaynak}lar |
| Ekip rolleri | sektörün ana rolü (Uzman, Hekim, Kuaför…) | Personel |

---

## K1 · İşletmeniz

Üç soru, tek ekran. Her biri tek bakışta anlaşılır, hiçbiri uzun değil.

**1 · İşletme adı** (zorunlu)
- Alttaki tek satır: "Müşterilerinize giden WhatsApp mesajlarında ve
  randevu sayfanızda görünür."
- **Boş açılır**, yer tutucu "Ör. Özmen Güzellik". Kayıttan gelen değer
  e-posta adresi ya da kişinin kendi adıysa alana yazılmaz.
- Hemen altında küçük, sakin bir satır: **"Randevu adresiniz:
  timeflow.lueratech.com/book/ozmen-guzellik"**. Ad yazıldıkça oluşur:
  Türkçe harfler sadeleşir, boşluklar tire olur. Dokununca düzenlenir.
  - Adres başka bir işletmede kullanılıyorsa: "Bu adres alınmış —
    ozmen-guzellik-2 kullanılacak" (Ş4).

**2 · Ne iş yapıyorsunuz?** (zorunlu) — 13 sektör kartı, ikon + ad:

| Sektör | {Hizmet} kelimesi | Hazır liste | {Kaynak} | Ana rol |
|---|---|---|---|---|
| Güzellik / Salon | Hizmet | 10 | Kabin | Uzman |
| Kuaför | Hizmet | 7 | Koltuk, Yıkama | Kuaför |
| Berber | Hizmet | 6 | Koltuk | Berber |
| Estetik Kliniği | Hizmet | 7 | Oda | Uzman |
| Diş Hekimi | Tedavi | 8 | Ünite | Hekim |
| Sağlık / Klinik | Hizmet | 5 | Oda | Hekim |
| Fizyoterapi | Hizmet | 6 | Terapi alanı, Cihaz | Fizyoterapist |
| Tattoo / Piercing Stüdyosu | Hizmet | 6 | Kabin | Artist |
| Avukatlık Bürosu | Danışmanlık | 5 | Toplantı odası | Avukat |
| Danışmanlık / Koçluk | Hizmet | 5 | **yok** | Danışman |
| Gym / PT | Ders | 5 | Salon alanı | Antrenör |
| Gelinlikçi | Model | 5 | Prova odası | Satış danışmanı |
| Restoran / Kafe | Hizmet | 5 | **yok** | Şef garson |

- "Genel" listede YOK.
- Seçim sonradan değişebilir. Müşteri ve randevu girildikten sonra
  değiştirilirse sakin bir amber uyarı çıkar (Ş5). İlk kurulumda uyarı
  yok.
- Kartlar 1440'ta tek bakışta görünmeli. 13 kart ekranın yarısını yemesin:
  kompakt, ikon + tek satır ad.

**3 · Kaç kişi çalışıyor?** (zorunlu) — **iki eşit kart**:
- **Yalnız ben çalışıyorum** — "Bütün randevular size gelir. Telefonda
  tek kişilik sade ekranı görürsünüz."
- **Ekibim var** — "Randevular kişilere dağılır, herkes kendi takvimini
  görür."
- "Yalnız ben" ikinci sınıf bir bağlantı değil, eşit ağırlıkta bir kart.
  Türkiye'deki hedef kitlenin büyük kısmı tek kişilik.
- **"Ekibim var" seçilince** kartın altında açılır (K1-b):
  - **İsimler:** ad yazıp Enter → çip. En az bir isim istenir. Rol ve renk
    sorulmaz. "Davet", "giriş daveti" gibi bir söz YOK.
  - **Yalnız sektörde {Kaynak} varsa:** "Aynı anda kaç {kabin}?" − 2 +
    sayacı. İki türlü sektörde (Kuaför: Koltuk + Yıkama) iki sayaç yan
    yana.
- "Yalnız ben" seçilince {kaynak} sorulmaz; 1 kurulur.

**Alt çubuk:** "Devam". Üç cevap tamamsa etkin, değilse eksik olanı tek
cümleyle söyler ("İşletme adı gerekli").

---

## K2 · Hizmetler ve saatler

Başlık örneği: "Sizin için 10 hizmet hazırladık." Diş hekiminde "8 tedavi",
gym'de "5 ders".

**Hizmetler** (zorunlu, en az bir)
- Satır: **işaret kutusu · ad · süre (dk) · ücret (₺, isteğe bağlı)**.
  Renk sütunu yok, silme ikonu yok: işaretini kaldırmak çıkarmak demek.
- Liste dolu ve işaretli gelir. Kullanıcının işi **yapmadıklarının
  işaretini kaldırmak**: boş tabloya "hizmet ekle" demek kurulumun en büyük
  terk noktası.
- Altta: "+ Kendi hizmetinizi ekleyin" (satır açılır, adı odaklanır).
- Tek satırlık not: "Süre ve ücreti tahmini girin; sonra Ayarlar'dan
  düzeltirsiniz."
- Örnek liste (Güzellik): Cilt Bakımı 60 · Lazer Epilasyon 45 · İğneli
  Epilasyon 30 · Bölgesel İncelme 50 · Kaş Tasarımı 20 · Kirpik Lifting 60
  · Manikür 40 · Pedikür 50 · Ağda 30 · Masaj 60. Hazır listelerde ücret
  yok, süre var.

**Çalışma saatleri** (zorunlu, en az bir açık gün)
- Üç hazır düzen, **ilki seçili gelir**:
  - "Hafta içi 09:00–19:00 · Cmt 10:00–16:00 · Paz kapalı"
  - "Her gün 10:00–20:00"
  - "Hafta içi 08:00–17:00"
- "Gün gün düzenle" açılınca (K2-b) 7 satır: Pazartesi…Pazar · açık/kapalı
  anahtarı · başlangıç–bitiş. Satır Ayarlar › Çalışma saatleri'ndekiyle
  aynı aileden.
- Tek satırlık not: "Müşteriniz yalnız bu saatlerde randevu alabilir.
  Tatil günlerini sonra takvimden kapatırsınız."

**Alt çubuk:** "Geri" · "{n} hizmet seçili" · "Devam".

---

## K3 · WhatsApp (atlanabilir)

Başlık örneği: "WhatsApp numaranızı bağlayın." Alt satır: "Bağlanınca
randevu hatırlatmaları müşterinize kendi numaranızdan gider. Hatırlatma,
gelmeyen müşteriyi azaltan en etkili ayar."

- **QR kare** + yanında 3 adım: "Telefonunuzda WhatsApp'ı açın" ·
  "Ayarlar → Bağlı cihazlar → Cihaz bağla" · "Telefonunuzu bu kareye
  tutun".
- **Kare 60 saniye geçerli** ve süre dolunca kendiliğinden yenilenmez.
  Silikleşir ve "Kareyi yenile" düğmesi çıkar (K3-b). Sessizce yenilenen
  kare, telefonunu tam o anda kaldıran kullanıcıyı ıskalatıyordu.
- **AI randevu asistanı** anahtarı:
  - Varsayılan KAPALI; WhatsApp bağlanana kadar kullanılamaz.
  - Metin: "Açarsanız müşterileriniz WhatsApp'tan yazdığında asistan
    randevu oluşturur, fiyat ve saat sorularını yanıtlar. Kapalıyken
    yalnız hatırlatmalar gider, hiçbir mesaja otomatik cevap verilmez."
  - İki balonluk küçük örnek: "Yarın öğleden sonra müsait misiniz?" →
    "Yarın 14:30 ve 16:00 boş. Hangisini ayırayım?"
- **Alt çubuk:** "Geri" · "Telefonunuz yanınızda değilse sonra
  bağlayabilirsiniz." · **"Sonra bağlarım"** · **"Bitir"** (bağlandıysa
  "Bağlandı, bitir").

---

## B · Bitti

Başlık örneği: "Tamamdır." Alt satır: "Özmen Güzellik randevu almaya
hazır." Kutlama ya da konfeti yok.

1. **Randevu adresi kartı** — sayfanın en değerli öğesi:
   - `timeflow.lueratech.com/book/ozmen-guzellik`
   - **[Kopyala]** · **[Sayfayı aç]**
   - Tek satır: "Instagram profilinize koyun, müşteriniz randevusunu kendi
     alsın."
2. **Kısa özet** (3–4 satır): sektör · "10 hizmet · haftada 6 gün açık" ·
   "Yalnız siz" ya da "3 kişi" · WhatsApp.
   - Atlanan satır sakin bir dille görünür: "WhatsApp bağlanmadı —
     hatırlatmalar gitmiyor · [Şimdi bağla]".
3. **Sıradaki işler** — en çok üç kart:
   - **İlk randevunuzu oluşturun** → Takvim. "Bir saate dokunun, yeterli."
   - **Müşteri listenizi aktarın** → Ayarlar › Verileriniz. "Excel ya da
     CSV yükleyin."
   - **Adres ve telefonunuzu ekleyin** → Ayarlar › İşletme profili. Kart
     yalnız boşlarsa görünür. Metin: "Hatırlatmalarda görünür; WhatsApp
     asistanı 'neredesiniz' sorusunu bununla yanıtlar."
4. **"Uygulamaya git"** (birincil) · altta "Her şey Ayarlar'dan değişir."

---

## Hâller — ayrı kareler

| Kod | Hâl |
|---|---|
| **Ş1** | **Kurulum şeridi** (uygulamanın içinde, panelin üstünde). Yarıda bırakan kişi her sayfada görür: "Kurulum 2 / 3 · Sırada: Hizmetler ve saatler · [Devam et] [×]". × bugün için gizler, ertesi gün yine gelir. **Tek sayaç:** şerit, sihirbazın ilerleme göstergesi ve bitiş aynı hesaptan okur. Panelde ikinci bir kurulum kartı olmayacak (2026-10-19'da iki sayaç çelişti, kaldırıldı). Şerit Ayarlar v1 diliyle; kaldığı ekranı açar, baştan başlatmaz. |
| **Ş2a** | **Ödeme dönüşü, abonelik okundu** — K1'in üstünde ince, sakin bir bant: "Ödemeniz alındı. 7 günlük deneme başladı; ilk tahsilat 26 Ekim'de (₺599/ay)." Kapatılabilir, kurulumu engellemez. |
| **Ş2b** | **Ödeme dönüşü, abonelik henüz okunmadı** (ödeme sağlayıcının bildirimi birkaç saniye gecikebilir): "Ödemeniz alındı. Aboneliğiniz birkaç saniye içinde görünecek." Okununca Ş2a'ya döner. "Ödeme başarısız" yazılmaz: bu adrese yalnız başarılı ödemeden sonra gelinir. |
| **Ş3** | **Kaydedilemedi** — "Devam"da sunucu reddetti: ekran değişmez, alt çubuğun üstünde "Kaydedilemedi, tekrar deneyin." Girilenler kaybolmaz. Cevap hiç gelmezse "Kaydedildiğini doğrulayamadık" yazılır, "kaydedilmedi" değil. |
| **Ş4** | **Randevu adresi alınmış** (K1, ad alanının altı). |
| **Ş5** | **Sektör değiştirme uyarısı** — kurulumu sonradan açan, kaydı olan işletme: "Müşteri ve randevu girdikten sonra sektörü değiştirmek bazı kayıtları yanlış ekranlarda gösterir. Emin değilseniz değiştirmeyin." |
| **Ş6** | **Telefondan kaydolup masaüstüne gelen** — ad ve "Yalnız ben" telefonda cevaplanmış. K1 bu cevaplarla dolu açılır, yalnız sektör eksik. Şerit "Sırada: İşletmeniz" der. |
| **Ş7** | **Yükleniyor / okunamadı** — mevcut veri okunurken ekran iskeletle bekler. Okunamazsa "Bilgileriniz okunamadı — yenileyin". **Okunamadı asla boş gibi çizilmez**; boş bir hizmet listesi önüne konup üstüne yazdırılmaz. |
| **Ş8** | **Bütün hizmetlerin işareti kaldırıldı** — liste durur, satırlar silik. "Devam" kapalı, yerinde "En az bir hizmet gerekli · [Hazır listeyi geri getir]". |
| **Ş9** | **QR alınamadı** (WhatsApp sunucusu cevap vermedi): "Kare şu an getirilemedi. Biraz sonra tekrar deneyin ya da sonra bağlayın." |

**K3-c** (bağlandı): yeşil "Bağlandı. Hatırlatmalar bu numaradan gidecek."
AI asistan anahtarı etkinleşir.

---

## Bozulmayacak sözleşmeler (uygulama için, tasarımda yalnız davranış)

- **Her ekran "Devam"da kaydeder.** Sonda topluca kaydetmek, yarıda
  bırakanın hiçbir şeyini saklamamak demekti.
- **Kaldığı yerden:** şerit hangi ekranı söylüyorsa sihirbaz o ekranda
  açılır (adres `/kurulum?adim=…`).
- **Var olan veri ezilmez:** sihirbazı sonradan açan işletmenin hizmetleri
  varsa hazır liste değil **kendi listesi** gelir.
- **"Yalnız ben" = telefondaki tek kişilik mod.** İkisi aynı bayrak; biri
  değişince öteki de değişir.
- Kurulumdaki her alan Ayarlar'da aynı adla bulunur (Ayarlar araması
  bunları bulur).
- Kurulum bitince "Uygulamaya git" panele gider. Ödeme dönüşü bandı
  kurulumu engellemez.

---

## Kareler — sırayla

| Kod | Kare | Tema |
|---|---|---|
| K1 | İşletmeniz · boş açılış (e-postayla yeni kayıt) | açık + koyu |
| K1-b | "Ekibim var" seçili · 3 isim · kuaför (Koltuk + Yıkama sayaçları) | açık |
| K1-c | Doldurulmuş · Güzellik · "Yalnız ben" · adres satırı görünür | açık |
| K2 | Hizmetler ve saatler · Güzellik, 10 satır, ilk saat düzeni seçili | açık + koyu |
| K2-b | "Gün gün düzenle" açık · Pazar kapalı · Cumartesi 10–16 | açık |
| K3 | WhatsApp · QR görünüyor, kalan süre | açık |
| K3-b | Karenin süresi doldu | açık |
| K3-c | Bağlandı · asistan anahtarı etkin | açık |
| B | Bitti · her şey tamam | açık + koyu |
| B-b | Bitti · WhatsApp atlanmış · adres/telefon boş | açık |
| Ş1 | Uygulama içinde kurulum şeridi (panelin üstünde) | açık + koyu |
| Ş2a · Ş2b | Ödeme dönüşü bandı, iki hâl | açık |
| Ş3 · Ş4 · Ş5 · Ş8 · Ş9 | Satır içi hâller (yalnız ilgili bölge) | açık |
| Ş6 · Ş7 | Telefondan gelen · yükleniyor/okunamadı | açık |
| R | K1 ve K2 · 1024 × 768 ve 768 × 1024 | açık |

---

## Ton

Kısa, sakin, cesaretlendirici ama abartısız: "Harika iş!" değil "Tamamdır."
Kullanıcı teknik değil; salon sahibi, diş hekimi, kuaför, sık sık 40–55
yaş. "Slug", "kayıt", "modül", "kaynak", "entegrasyon" gibi yazılım
kelimeleri yok; {Kaynak} yerine sektörün kelimesi (Kabin, Koltuk, Ünite…).
Her alanın yanında **neye yaradığı** tek cümle: ne işe yaradığını bilmediği
alanı insan boş bırakır. Etiketler normal harf, okunur boyda; büyük harf
yalnız küçük grup başlıklarında.
