# MASAÜSTÜ ABONELİK EKRANI · timeflow.lueratech.com/abonelik — v2 — Claude Design promptu

**Yazıldı:** 2026-10-28. Panelden kaydolan her yeni işletme Kurulum'u
bitirince **"7 gün ücretsiz başlat"** düğmesiyle bu ekrana geliyor. Burası
ürünün **para istediği ilk an**. Kişi buraya kadar emek verdi: işletmesini,
hizmetlerini, saatlerini girdi. Ekran o emeği ödemeye çevirmeli: **hızlı,
güven veren, aklında soru işareti bırakmayan.**

**Kullanıcının ana isteği:** profesyonel, canlı (animasyonlu), çekici. İlk
izlenim burada oluşuyor. Para ödeyecek kişi ne aldığını, ne ödeyeceğini ve ne
zaman ödeyeceğini tek bakışta anlamalı; tereddüt etmeden ödemeli. **Yön
önerisi (kullanıcının fikri, kesin kural değil): Apple'ın satın alma
sayfaları:** sakin, cömert boşluk, büyük ve net tipografi, az ama anlamlı
hareket, tek bir belirgin eylem. Apple'ı kopyalama; o hissi Luera'nın kendi
diliyle (Kurulum v2 + ışık alanı) kur. Daha iyi bir yön görürsen gerekçesiyle öner.

**Effort: High.** Tek turda bitsin. Aşağıdaki her içerik maddesi gerçek ve
koddan doğrulandı. Uydurma özellik, uydurma sayı, uydurma güvence ("7/24
destek", "%99,9", "binlerce işletme", müşteri yorumu, logo duvarı) **ekleme**.

---

## Ekler — `abonelik-ekleri/` klasörü, yalnız bunlar

1. `01 Luera Masaustu - Kurulum v2.html` — kişinin **bir saniye önce**
   gördüğü ekran. Abonelik ekranı bunun **devamı** gibi hissettirmeli: aynı
   marka satırı (luera + timeflow etiketi), aynı yazı, aynı düğme, aynı tam
   ekran odak düzeni (sol menü yok). En önemli ek bu.
2. `02 Luera Fiyatlandirma (bugunku duvar).html` — bugünkü ekranın tasarımı.
   Sayfanın tüm durumları (deneme bitti, ödeme alınamadı, ödeme sonrası fiş)
   bundan uygulandı. **İçerik ve durum envanteri olarak bak.** Görsel dili,
   ikonları ve düzeni kopyalanmayacak.
3. `03 Luera Masaustu - Giris v2 Isik Alani.html` — markanın "ışık alanı".
   Sakin bir yankısı arka planda kullanılabilir. Fiyat okunurluğu her zaman
   önce gelir.
4. `04 Luera Forms & Surfaces (yalniz bilesen dili).html` — kart, düğme,
   anahtar, toast ölçüleri. İçindeki İngilizce örnek metinler ürünümüz değil.
5. `05 Luera Motion Guidelines (hareket dili).html` — süre ve eğri dili.
   Hareketler buradan türesin.
6. `06 Bugunku abonelik ekrani (canli, 2026-10-28).webp` — bugünkü canlı
   ekranın görüntüsü. Sorunlar aşağıda.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Masaustu - Abonelik v2.html`. Kareler
  aşağıdaki sırayla, her karenin başında kodu (A1, A1-b … A6).
- **Ana kare 1440 × 900.** A1 için ayrıca **1280 × 720** (küçük dizüstü:
  asıl düğme yine kaydırmadan görünmeli), **1024 × 768** ve **768 × 1024**.
  Daha darı telefonun işi; onu çizme.
- **Tema:** açık ve koyu, tek düğmeyle değişsin. A1, A2 ve A4'ü iki temada
  göster.
- **Hareketler çalışır hâlde olsun** (kareyi açınca oynasın, düğmeye
  basınca tetiklensin). Her hareket için tek satır: **özellik · ms · eğri**.
  `prefers-reduced-motion` açıkken ne olduğu da yazsın (hareket yerine
  anında geçiş).
- Web'de çalışacak: **CSS + az JS.** Ağır kütüphane, canvas, video, Lottie
  yok.
- Renk, yazı ve ölçüler eklerden (Kurulum v2 + Giriş v2). **Yeni renk icat
  etme**; tek vurgu turuncu. Emoji yok; sade çizgi ikonlar (Lucide ailesi).
- Açıklama kısa: karar başına tek cümle gerekçe.

---

## Bugünkü ekran — sorunlar (canlıda görüldü, 2026-10-28)

1. **Yanlış ikon:** başlığın üstünde **duraklat (⏸)** ikonu var. "Deneme
   bitti" ekranından kalma; yeni gelen biri bunu "hesabınız durduruldu" diye
   okuyor. Hoş geldiniz anında ceza dili.
2. **Asıl düğme görünmüyor:** 1440 × 900'de "7 gün ücretsiz dene"
   düğmeleri ekranın altında, yazıları kesik. Karar vermek için kaydırmak
   gerekiyor.
3. **Kartlar dengesiz:** Tek kişilik 8 satır, Ekip 4, İşletme 3. Ekip ve
   İşletme kartlarında büyük boşluk var. "Tek kişilikteki her şey" ve
   "Ekip'teki her şey" satırları karşılaştırmayı okura bırakıyor.
4. **Aylık / Yıllık seçici** kartlara yapışık ve sola kaymış. Ortada,
   kartların üstünde ve kendi nefesiyle durmalı.
5. **Kart içinde kart:** logo ve Çıkış ayrı bir çerçevenin içinde duruyor;
   kurulumdaki tam ekran düzenle tutmuyor. Logo eski ("luera." noktalı);
   yeni marka **luera + timeflow etiketi**.
6. **Kurulumla bağ yok:** kişi az önce 3 ekran doldurdu ama ekran bunu
   hiç anmıyor. "Son adım" hissi yok, kuruluma geri dönme yolu da yok.
7. **Para bilgisi kararın yanında değil:** "8. günde tahsilat, deneme içinde
   iptal edersen ücret yok" cümlesi başlığın altında, gri, küçük. Düğmeye
   basacağı an göz önünde olmalı.
8. **Güven sorularının cevabı yok:** kart bilgisi nereye gidiyor, fatura
   gelecek mi, KDV dahil mi, nasıl iptal edilir? Hepsinin gerçek cevabı var
   (aşağıda), ekranda hiçbiri yok.
9. **Hareket yok:** sayfa statik. Aylık ↔ yıllık geçişinde fiyatlar
   aniden değişiyor, düğmeye basınca ödeme sayfasına geçilene kadar hiçbir
   geri bildirim yok.

---

## Ana fikir — üç söz

1. **Tek bakışta karar.** Kişi üç şeyi kaydırmadan görür: hangi plan ona
   uygun, bugün ne öder (₺0), ilk ödeme ne zaman ve ne kadar. Asıl düğme
   1280 × 720'de bile ekranın içinde.
2. **Önerilen plan hazır gelir.** Kurulumda "Yalnız ben çalışıyorum" diyene
   **Tek kişilik**, "Ekibim var" diyene **Ekip** önerili gelir (bu veri
   bizde var). Kişinin işi seçmek değil **onaylamak**. Öbür planlar yanında
   durur, gizlenmez.
3. **Soru işareti bırakma.** Her güven sorusunun cevabı düğmenin hemen
   yanında, kısa ve gerçek. Küçük yazı yok, gizli şart yok.

---

## Gerçek bilgiler — yalnız bunlar yazılır

**Planlar** (`src/lib/plans.ts`, tek kaynak; fiyatlar KDV dahil, TL):

| Plan | Kime | Aylık | Yıllık (tek ödeme) | Yıllıkta aya düşen |
|---|---|---|---|---|
| Tek kişilik | Tek başına çalışanlar için | ₺799 | ₺7.990 | ₺666 |
| **Ekip** (en çok seçilen) | Ekibiyle çalışan işletmeler | ₺1.299 | ₺12.990 | ₺1.083 |
| İşletme | Yoğun işletmeler, birebir destek | ₺1.999 | ₺19.990 | ₺1.666 |

- Yıllık = 10 × aylık → **"2 ay bedava"**.
- **Tek kişilik = yalnız işletme sahibi** (1 çalışan, sahip dahil). Ekibi
  olan işletmeye Tek kişilik **satılamaz**: o kartta düğme kapalı ve
  "Sizinle birlikte N kişi" yazar (bugün de böyle; korunacak).
- **Özellikler** (bugün uygulamada OLANLAR; "yakında" satılmaz):
  - Tek kişilik: 1 çalışan · Randevu & takvim · Online randevu sayfası ·
    WhatsApp hatırlatma · Kasa & tahsilat · Müşteri paketleri · Raporlar ·
    E-posta destek
  - Ekip: Tek kişiliktekilerin hepsi + Sınırsız personel · Personel
    uygulaması · Personel raporları
  - İşletme: Ekip'tekilerin hepsi + Öncelikli destek · Birebir kurulum
    desteği
  - Karşılaştırmayı kolaylaştırmak için düzeni değiştirebilirsin (ör.
    kartlarda yalnız **farkı** yazan 3–4 satır + altta tek bir "Tüm
    planlarda" şeridi). Satır ekleme ya da çıkarma yok; yalnız yerleşim.

**Deneme ve ödeme:**
- **7 gün ücretsiz.** Kart bugün alınır, **bugün çekilen ₺0**.
- İlk tahsilat **8. gün**, aynı karttan, seçilen planın tutarı (aylıkta
  aylık tutar, yıllıkta yıllık toplam). Tarih gerçek takvim günüyle
  yazılabilir (ör. "4 Kasım'da ₺1.299"); uygulama hesaplar. Yıllık seçiliyse 8. gün
  çekilen tutar yıllık toplamdır (₺12.990); güven şeridi bunu açıkça yazar.
- **Deneme içinde iptal edilirse hiçbir ücret alınmaz.** İptal: uygulamada
  **Ayarlar › Abonelik**, tek düğme.
- Düğmeye basınca kişi **Dodo Payments'ın güvenli ödeme sayfasına** gider
  (ayrı sayfa, bizim tasarımımız değil). **Kart bilgisi Luera'ya gelmez.**
  Bugün kabul edilen yöntem: **kart**. Apple Pay / Google Pay henüz YOK,
  ikonlarını koyma.
- Fatura her tahsilatta **e-postayla** gelir.
- **YAZILMAYACAKLAR (bizde yok):** "deneme bitmeden hatırlatırız" (kartlı
  denemede hatırlatma e-postamız yok), "istediğin an para iadesi", "taahhüt
  yok" dışında bir sözleşme iddiası, SSL/rozet/sertifika logoları, müşteri
  sayısı, yorum.

**Kişiye özel (uygulamada hazır, kullanılabilir):**
- İşletme adı (ör. "Özmen Güzellik"), kurulumda seçilen sektör, ekipte kaç
  kişi olduğu, randevu adresi (`timeflow.lueratech.com/book/ozmen-guzellik`),
  kurulumda girilen hizmet sayısı.
- Örnek kullanım: "Özmen Güzellik hazır. Randevu almaya başlamak için son
  adım." Ya da küçük bir özet şeridi: "5 hizmet · haftada 6 gün ·
  /book/ozmen-guzellik". **Abartma:** tek satır yeter, ekranın yıldızı
  fiyat ve düğme.

---

## Kareler

### A1 · Kurulumdan yeni gelen (ana kare — en çok emek buraya)

Panelden kaydolmuş, kurulumu az önce bitirmiş, hiç aboneliği olmamış kişi.
Bugünkü metin "Planınızı seçin."

- **Üstte:** kurulumla aynı marka satırı. Sağda işletme adı ve "Çıkış".
  İsteğe bağlı: solda küçük "← Kuruluma dön".
- **Başlık bölgesi:** kurulumun bittiğini anan, sıcak ama kısa bir başlık +
  tek satır alt metin. Ceza dili yok, duraklat ikonu yok. Bir ikon
  kullanacaksan "tamamlandı / hazır" anlamında olsun ya da hiç olmasın.
- **Aylık / Yıllık seçici:** ortada; "Yıllık · 2 ay bedava" etiketi.
- **Üç plan kartı**, önerilen plan vurgulu (kurulum cevabına göre). Her
  kartta: ad, tek satır kime, **büyük fiyat**, "/ay", yıllıkta "yılda tek
  ödeme ₺12.990" satırı, 3–4 fark satırı, düğme.
- **Asıl eylem:** önerilen kartın düğmesi tek belirgin turuncu düğme
  ("7 gün ücretsiz başlat"). Öbür kartların düğmesi ikincil.
- **Güven şeridi** (düğmenin hemen altında ya da kartların altında, tek
  satır ya da 3 küçük madde): bugün ₺0 · ilk ödeme {tarih} · deneme içinde
  iptal ederseniz ücret yok · kart bilgisi güvenli ödeme sayfasında
  (Dodo Payments), Luera'ya gelmez · fatura e-postayla · fiyatlar KDV dahil.
  Hepsini sığdırmak zorunda değilsin; en önemli üçü görünür, kalanı A1-c'de.
- **Kaydırmadan:** 1440 × 900 ve 1280 × 720'de başlık + seçici + kartların
  fiyatı + asıl düğme + güven şeridinin ilk satırı ekranın içinde.

**A1-b · Yıllık seçili** — aynı kare. Fiyatlar aya düşen tutara döner,
altında yıllık toplam; "2 ay bedava" kazancı görünür.

**A1-c · "Nasıl çalışır?"** — güven sorularının açılır hâli (ekran içi küçük
bir katman ya da sayfanın altında sakin bir bölüm): **Bugün** ₺0, kart
kaydedilir → **7 gün** her şey açık → **8. gün** ilk tahsilat (tutar +
tarih) → istediğin an Ayarlar › Abonelik'ten iptal. Apple'ın "deneme nasıl
işler" zaman çizgisi gibi: üç nokta, tek çizgi.

**A1-d · Ekibi olan kişi** — Tek kişilik kartında düğme kapalı, yerine
"Sizinle birlikte 3 kişi" yazar; Ekip önerili. Kapalı kart soluk ama
okunur kalır (neden kapalı olduğu belli).

**A1-e · Düğmeye basıldı** — ödeme sayfası açılırken 0,5–2 saniye geçer.
Düğme yükleniyor hâline geçer, metin "Güvenli ödeme sayfası açılıyor…"
olur. Öbür düğmeler pasifleşir, iki kez basılamaz. Bu bir an, ama güvenin
kurulduğu an.

**A1-f · Ödeme sayfası açılamadı** — sunucu hata verdi. Bugün sağ altta
kırmızı bir bildirim çıkıyor; yerine düğmenin yanında amber, sakin bir
satır: "Ödeme sayfası açılamadı, tekrar deneyin." Düğme yeniden basılabilir.

**A1-g · Kurulumu bitirmeden gelen** — kurulumda "Sonra tamamlarım"a basan
kişi de uygulamaya girmeye çalışınca bu ekrana düşer (aboneliği yok,
kapı onu buraya gönderir). Ona "hazırsınız" **denmez**. Başlık ve özet
şeridi buna göre değişir; "← Kuruluma dön" yerine "Kurulumu tamamla"
bağlantısı öne çıkar. Plan kartları ve düğme A1 ile aynı (deneme
kurulum bitmeden de başlatılabilir).

### A2 · Ödemeden dönüş — işleniyor

Kişi Dodo'da kartını girdi, geri geldi; sistem onayı bekliyor (genelde
birkaç saniye). Bugünkü metin: "Ödemeniz işleniyor. Bankanızdan onay
bekliyoruz, genelde birkaç saniye sürer. Bu sayfayı kapatmayın." + "Uzun
sürerse sayfayı yenileyebilirsiniz; ödemeniz kaybolmaz." Onay gelince
kendiliğinden kuruluma ya da ana sayfaya geçer (kısa bir "Denemeniz
başladı" bildirimiyle). **Sakin bir bekleme hareketi** çiz; döner çark
yerine daha zarif bir şey olabilir.

### A3 · Deneme bitti / abonelik sona erdi

Kartsız denemesi biten (telefondan açılan işletme) ya da aboneliği biten
kişi. **Bugünkü üç kural korunacak:**
1. **Kırmızı yok.** Kişi suçlanmaz.
2. **İlk cümle verinin durduğunu söyler:** "Verileriniz duruyor. Bir plan
   seçtiğiniz anda kaldığınız yerden devam edersiniz."
3. Gerçek sayılar: "Hesabınızda duran veriler — Müşteri kaydı 248 · Geçmiş
   randevu 1.120 · İleri tarihli randevu 37 · Silinmedi."

Başlık: "Deneme süreniz doldu." ya da "Aboneliğiniz sona erdi." Tek düğme:
ekibe uyan en küçük plan ("Ekip planını seç · ₺1.299/ay") + "Diğer
planlara bak". Altta: "Bugün başlarsanız ilk tahsilat bugün yapılır" (bu
kişide deneme YOK). En altta: dışa aktarım için destek@lueratech.com'a
yazmak yeterli, abonelik gerekmez.

### A4 · Ödemeniz alınamadı (ek süre)

Bugünkü metin: "Ödemeniz alınamadı. Bankanız işlemi geçirmedi. Bu genelde
limit ya da kart doğrulamasıyla ilgilidir. Kartınızı güncelleyin, işlemi
hemen tekrar deneyelim." Kalan süre sayacı ("2 gün 14 saat boyunca
uygulama açık kalmaya devam eder"). Düğme: **Kartı güncelle**; ikincil:
"Başka bir plana geç". Not: "Süre dolarsa uygulama salt okunur olur:
randevularınızı görürsünüz, yenisini oluşturamazsınız. Veriler silinmez."
**Amber, kırmızı değil. Sebep tahmin edilmez** (limit mi, banka mı
demiyoruz).

**A4-b · Kart sayfasından dönüş** — "Kart sayfasından döndünüz. Yeni kartla
ödemenin sonucu birkaç dakika içinde burada görünür." "Ödendi" DENMEZ.

### A5 · Kartsız deneme sürüyor (telefondan açılan işletme)

Telefondan kaydolan işletme kartsız 7 gün alır; erken paket seçebilir.
Başlık "Denemeniz sürüyor." · "4 gün kaldı · 1 Kasım 2026. Şimdi bir plan
seçerseniz ilk tahsilat denemeniz bittiğinde yapılır; o güne kadar ücret
alınmaz." Kartlar A1'deki gibi, düğme "Bu planı seç". Altta "Şimdilik
uygulamaya dön".

### A6 · E-postadan gelen, aboneliği sürüyor

Abonelik e-postasındaki bağlantıyla gelen ama aboneliği zaten süren kişi:
"Aboneliğiniz sürüyor. Ekip planı. Dönem sonu: 4 Kasım 2026." Kartı
güncelle düğmesi (yalnız kartla ödeyende). Uygulamaya düğme YOK; yerine
"Bu sayfayı kapatıp TimeFlow'u kullanmaya devam edebilirsiniz." (kişi
çoğunlukla telefondan gelir).

---

## Hareket — "canlı ama sakin"

İstek: canlı ve çekici, ama Apple gibi: hareket bir şeyi **anlatır**, süs
olsun diye oynamaz. Önerilen set (daha iyisini bulursan gerekçesiyle):

1. **Giriş:** başlık → seçici → kartlar → güven şeridi, kısa aralıklarla
   (ör. 40–60 ms) yukarı süzülüp belirir. Toplam < 600 ms; kişi beklemez.
2. **Aylık ↔ yıllık:** fiyat rakamları yuvarlanarak (rakam rakam) yeni
   değere geçer; seçicideki hap kayar. Kart yükseklikleri zıplamaz.
3. **Önerilen kart:** bir kez, belirdiği an hafif bir ışık süzülmesi ya da
   kenarında yumuşak bir parıltı (ışık alanının yankısı). Sürekli yanıp
   sönen bir şey **yok**.
4. **Kartın üstüne gelince:** hafif kalkma + gölge; düğme belirginleşir.
5. **Düğmeye basınca (A1-e):** düğme içinde ilerleme / dönüşüm, metin
   yumuşak geçişle değişir; sonra sayfa ödeme sayfasına geçer.
6. **A2 bekleme** ve **ödeme sonrası "Denemeniz başladı"**: tik çizilerek
   belirir (bugünkü fişte var, korunabilir).
7. `prefers-reduced-motion`: hepsi anında geçiş, rakam yuvarlanması yok.

Sınırlar: yalnız `transform` ve `opacity` (ve gerekirse `filter`); düzen
kaydırmayan hareket. 60 fps, ağır gölge animasyonu yok.

---

## Erişilebilirlik ve ayrıntı

- Düğme ve seçici en az 44 px yükseklik; klavyeyle gezilir, odak halkası
  Giriş v2'deki gibi.
- Fiyatlar `tabular-nums`; ₺ işareti rakamın önünde ("₺1.299").
- Karşıtlık: açık ve koyu temada metin en az AA.
- Önerilen plan yalnız renkle değil, etiketle de belli. Ekranda **tek
  etiket** olsun: Tek kişilik önerildiğinde Ekip'in "En çok seçilen"
  etiketi ile "Size uygun" yan yana iki vurgu yaratmasın. Nasıl çözdüğünü
  gerekçesiyle yaz.

---

## Teslimden önce kendine sor

- 1280 × 720'de asıl düğme ve "bugün ₺0" kaydırmadan görünüyor mu?
- Ekranda tek bir belirgin turuncu düğme mi var?
- Yazdığın her güvence yukarıdaki "Gerçek bilgiler" listesinde var mı?
- Kurulum v2'den bu ekrana geçen kişi aynı üründe olduğunu hissediyor mu?
- A1-g'de kurulumu bitirmemiş kişiye "hazırsınız" yazmadın, değil mi?
- A3 ve A4'te kırmızı, suçlama ya da sebep tahmini kalmadı mı?
