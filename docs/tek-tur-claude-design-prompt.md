# TEK TUR · Paket sat + Canlı değişim + Gizlilik/Destek — Claude Design promptu

Üç ayrı brifin (4, 1, 3) tek tura sıkıştırılmış hâli. Brif 2 (App Store
görselleri) bu turda YOK: son ekranların demo salonla çekilmiş görüntüsünü
istiyor, ekranlar bitmeden yapılırsa iki kez yapılır.

**Ekler — yalnız bunlar (başka dosya ekleme):**
1. `Luera Mobil - Mudur 23 Musteri Karti v2.html` — müşteri kartının onaylı hâli (İş A).
2. `Luera Mobil - Mudur 34 Eylem Hapi v2.html` — Akış'ın onaylı hâli (İş B).
3. `Luera Landing.html` + `Luera Landing Light.html` — Luera'nın web dili (İş C).
4. **Ekran görüntüleri (telefondan, bugünkü kodla):**
   - masaüstünde Müşteri kartı → **"Paket Sat"** çekmecesinin **2. adımı
     (Paket)** ve **4. adımı (Onay)** — karttan açılınca müşteri hazır seçili,
     çekmece 2. adımdan başlar (İş A)
   - telefonda müdürün **Randevu oluştur** ekranı (İş A — "bir şey oluşturma" dili)
   - müdürün **Akış** ekranı (İş B)
   - personelin **Bugün** ekranı (İş B)

**Effort: High.**

---

## Çıktı kuralı — önce bunu oku

- **Üç ayrı HTML dosyası**, bu sırayla: `A-paket-sat.html`,
  `B-canli-degisim.html`, `C-gizlilik-destek.html`. Biri bitmeden diğerine
  geçme. Tur yarıda kesilirse "devam" dendiğinde kaldığın dosyadan sürdür.
- **Tema: her dosyada tek bir koyu/açık düğmesi.** Aynı kareyi iki temada ayrı
  ayrı çizme. (İş C'de sayfa ayrıca **sistem tercihini** izler — bkz. İş C.)
- **Telefon ölçüsü: kareler 393 × 852.** 375 × 667'de değişen bir şey varsa
  karenin altına bir cümleyle yaz; ayrı kare çizme. **İstisna:** A2 ve A4
  375 × 667'de de çizilir (kısa ekranda birincil düğmenin ve kabuk çubuğunun
  sığması asıl soru).
- **Açıklama kısa:** her karar için tek cümle gerekçe, her hareket için tek
  satır zaman çizelgesi (özellik · ms · eğri). Uzun anlatı yok.

## Ortak kısıtlar (üç iş için de geçerli)

- **Renk envanteri — yeni renk icat etme:** turuncu `#FF5A1F` yalnız **zaman ve
  eylem** · kırmızı `#E07272`/`#C94040` risk · amber `#D9A43B`/`#B87A00`
  uyarı/borç · yeşil `#5FBF64`/`#2D8F32` olumlu.
- **Yazı tipi:** Hanken Grotesk.
- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş, ayakta, tek elle.
- **Hareket sözlüğü:** ekran ileri 240 · geri 200 · alt sayfa giriş 260 /
  çıkış 180 · durum 140 ms · yay: sönüm 20, sertlik 320–340, kütle 0.5. Yeni bir
  değer öneriyorsan gerekçesini yaz.
- **Araç:** reanimated 4.5.1; yalnız opacity / translate / scale. **Yok:**
  gesture-handler, `LayoutAnimation`, Skia, Lottie.
- **`reduceMotion`:** hareket durur, **bilgi durmaz.**
- Büyük harf metin katmanında yazılır (`textTransform` Türkçe İ'yi bozuyor).
- **Tutar kırpılmaz** (üç nokta yok; sığmıyorsa satır kırılır).
- **Bedel etiketi:** her hareketin yanına **A** reanimated ile bugün yazılır ·
  **B** Skia ister (uygulanamaz — A karşılığını da çiz) · **C** mümkün değil.
- **Uydurma veri yok:** olmayan özellik, sayı, iddia, iletişim bilgisi çizilmez.

---

# İŞ A · Müdür 35 · Paket sat + kartta "Randevu ver"

Müdür 23 v2 müşteri kartında iki kapı eksik, çünkü ekranları yoktu. **Kart
yeniden tasarlanmıyor**; yalnız iki kapı ekleniyor. Kartın dili sabit: opak
yüzeyler, cam yok, kırmızı yalnız risk, amber borç. Sayfa geçişleri ekteki v2
kartının hareket tablosundaki değerlerle.

### Paket satışının gerçeği — masaüstünde bugün böyle çalışıyor
Telefon masaüstüyle **aynı kaydı** yazacak (`treatment_plans`, tür paket).
Masaüstünün çekmecesi dört adım: Müşteri · Paket · Ödeme · Onay.

- **Paket seçimi iki yoldan:**
  - Salonun **paket şablonu** varsa şablondan seçilir: ad, seans sayısı,
    fiyat, renk. **Seans sayısı şablondan gelir, değiştirilemez.**
  - Şablon **yoksa** bir **hizmet** seçilir ve seans sayısı elle girilir
    (1–50). Yani şablonsuz salon da paket satabilir.
- **Fiyat** şablondan (ya da hizmet fiyatı × seans) önerilir ama **elle
  değiştirilebilir.** Yanında "seans başı ~₺X" gösterilir.
- **Kapalı paket satılamaz.** Müşterinin açık risk bayrağı (ör. hamilelik)
  seçilen işlemi kapatıyorsa seçenek **basılamaz** durur ve sebebini söyler —
  kartın ve randevu ekranının "KAPALI" satırının aynısı.
- **Çift paket uyarısı:** müşterinin aynı hizmette **aktif paketi** varsa bu
  söylenir (engel değil, uyarı).
- **Geçerlilik süresi kaydedilmiyor** (masaüstünde "Yakında", kapalı). Bitiş
  tarihi GÖSTERME.
- **Satan personel kaydedilmiyor.** Personel seçimi ÇİZME.
- Satış olunca kartın **Hesap** bölümünde yeni satır belirir ("Lazer · 10 seans
  · 0/10"). Onay mesajı değil, satırın kendisi onay.

### Telefonda para — KARAR
Masaüstü satış anında **peşinat** alabiliyor ve **taksit planı** (2–12, aylık
/ haftalık) kurabiliyor. Telefonun Kasa'sı ise bugün **salt okunur**: telefon
hiç para yazmıyor. Bu yüzden telefonda:
- Satış müşteriye **hak** (N seans) ve **alacak** (paket bedeli) yazar.
  **Peşinat alanı, ödeme yöntemi, taksit YOK.**
- Onay ekranı bunu açıkça söyler: tutar müşterinin hesabına **borç olarak**
  yazılır; **peşinat ve taksit masaüstünden** alınır. Müdür "ödendi"
  sanmamalı.
- Telefonda şablon oluşturma / düzenleme yok (masaüstünün işi).

### Kareler
- **A1 Paket seç** — şablonlu salon (normal · kapalı seçenek içeren · çift
  paket uyarılı) · şablonsuz salon (hizmet listesi + seans sayısı seçici).
- **A2 Onay** — kime, ne (paket, seans), bedel (değiştirilebilir alan,
  seans başı tutar). Açık cümle: bedel müşterinin hesabına yazılıyor,
  peşinat/taksit masaüstünden. Birincil fiil: **"Sat" para alındığını
  düşündürüyor mu?** Karar ver.
- **A3 Sonuç** — karta dönüş, yeni satırın belirişi · başarısızlık hâli (satır
  belirmez, sebep yazılır).
- **A4 "Randevu ver" nerede?** — v2'nin kabuk çubuğunda iki hap var (Ara ·
  WhatsApp), 375'te üçüncüye yer yok. Seçenekler: yaklaşan randevunun altında
  bölüm eylemi (bugünkü hâl) · kartın altında sabit çubuk (v1) · başka öneri.
  **Birini seç ve reddedilenleri de küçük kareyle göster**; en sık iş, ikinci
  plana düşmemeli.

---

# İŞ B · Canlı değişimin dili

Ekranlar artık **canlı**: masaüstünde bir randevu eklenince telefon saniyesinde
görüyor. Ama kart **pat diye** beliriyor ve kullanıcı ekrana **bakarken**
geldiği için iki sorun var:
1. **Parmağın altındaki kart kayıyor.** Müdür "Geldi"ye basmak üzereyken üste
   bir randevu eklenir, kart kayar, **yanlış karta** basar.
2. **Neyin değiştiği fark edilmiyor.**

İşin görevi süslü belirme değil: **"yeni bir şey geldi, işte burada"** demek,
parmağı şaşırtmadan.

### Değişmez
- **Akış'ın tasarımı DOKUNULMAZ:** artan kronolojik sıra · şimdi-çizgisine
  açılma, alt üçte bir · satır anatomisi (saat rayı · nokta + etiket · ad ·
  detay · kart) · kart yükseklikleri **94 · 96 · 118** · tek kart tek eylem ·
  krom yok (araç çubuğu, filtre, sekme yasak). Yalnız **hareket** ekleniyor.
- **Hareket yalnız CANLI değişiklikte.** Ekran açılırken liste dökülmez.
- Telefon yalnız "değişti" haberini alır, listeyi baştan çeker ve eskisiyle
  karşılaştırır: **hangi satır yeni, gitti, değişti** bilinir; kim/neden
  bilinmez.
- Art arda gelenler 300 ms içinde **tek tazelemeye** iner — birkaç değişiklik
  aynı anda gelebilir.
- **Gelmeyen müşteri:** randevu saatinden 30 dk sonra müşteri gelmediyse
  randevu kendiliğinden düşer ve **soluk satır** olur (kart yok). Bu da bir
  "değişti" olayıdır.
- Belirme **200–300 ms**. Premium his ölçülülükten gelir — zıplayan, abartılı
  dil ucuz durur.

### Kareler
- **B1 Akış · yeni randevu** — belirme · "yeni" vurgusu · sönmesi (kaç saniye,
  hangi mevcut renk). ← ana kare
- **B2 Akış · basmak üzereyken üste ekleme** — konum nasıl korunuyor (kaydırma
  sabitleme mi, ekleme erteleme mi). ← ana kare
- **B3 Akış · değişen kart** (personel "Geldi" dedi · tahsil edildi · saat
  değişti · personel değişti) ve **saati değişip yer değiştiren kart** — kayma
  izlenebilir bir hareket mi, sessiz yeniden diziliş mi?
- **B4 Akış · giden kart** (iptal) — iz bırakmalı mı? · **30 dk kuralıyla
  soluk satıra inen kart.**
- **B5 Personel Bugün** — aynı olaylar, satır dilinde. Müdürden daha sakin mi?
- **B6 `reduceMotion`** (B1 + B5): "yeni geldi" bilgisi hareketsiz nasıl?
  (Kayma yerine anlık yerleşme, belirme yerine renk vurgusu gibi.)
- Ekranın **dışında** bir değişiklik olduysa kullanıcı öğrenmeli mi, nasıl?
  Birkaç değişiklik aynı anda gelirse sırayla mı, aralık kaç ms?
- İkincil ekranlar (Takvim, Kasa, müşteri defteri): **birer cümle**, kare yok.

---

# İŞ C · Gizlilik ve Destek sayfaları (web)

App Store iki **herkese açık web adresi** istiyor: gizlilik politikası ve
destek. İkisi de yok, yayını bekletiyor. Tasarım düzeni ve okunuşu belirler;
hukuki metin ayrıca yazılacak.

### Değişmez
- **Fiyat, plan, satın alma bağlantısı YOK** (uygulama ücretsiz tamamlayıcı,
  App Store 3.1.3(f)).
- İletişim bilgisi, şirket unvanı ve kanıtlanmamış iddialar ("uçtan uca
  şifreli", "verileriniz Türkiye'de") **`[ … ]` yer tutucusu.**
- Tek dil Türkçe. Tek dosya HTML, dış bağımlılık yalnız Google Fonts —
  statik olarak barındırılabilsin.
- **Tema sistem tercihini izler** (`prefers-color-scheme`); önizleme için
  koyu/açık düğmesi de olabilir.
- SSS cevapları **uygulamanın gerçek davranışına göre** yazılacak; bilmediğin
  adımı uydurma, `[ … ]` bırak.
- **Işık alanı** (uygulamanın açılış ve giriş zemini): koyu zeminde `#120E08`,
  açıkta `#F3ECE0` üstünde bulanık, iri radyal renk kütleleri — kor (turuncu),
  mürekkep, erik, teal, sis — ince bir örtüyle yumuşatılmış. Ekteki Landing'de
  yok; bu tarif esas.
- Web dili: ışık alanı yalnız başlık bölgesinde, gövde düz ve okunaklı · marka
  `luera` + turuncu hapta `timeflow` · turuncu yalnız bağlantı ve eylemde ·
  gövde ≥ 17 px, satır ~70 karakter · 375 px'te yatay kaydırma yok.

### Sayfalar
- **C1 Gizlilik** — içindekiler (telefonda da çalışır). Bölümler: 1) Kim sorumlu
  — **veri sorumlusu her salonun kendisi, Luera veri işleyen** (en başta, açık)
  · 2) Hangi veriler · 3) Ne için · 4) Kiminle paylaşılır · 5) Ne kadar
  saklanır — **hesap silme uygulamanın içinden; silme hemen başlar, yedeklerdeki
  kopyalar 30 gün içinde döngüden çıkar** · 6) Haklarınız (KVKK md. 11) ve
  başvuru · 7) Değişiklikler, son güncelleme. Kısa kutu: **"Hesabınızı nasıl
  silersiniz: Profil → Hesap → Hesabımı sil."**
- **C2 Destek** — tek iletişim yolu `[destek e-postası]`, dönüş süresi `[ … ]`.
  SSS (4–6): personelimi nasıl bağlarım (ekip kodu) · personel şifresini
  unuttu · telefonumu kaybettim/değiştirdim · hesabımı nasıl silerim ·
  masaüstündeki değişiklik telefonda görünmüyor. Gizlilik sayfasına bağlantı.
- Masaüstü 1280 + telefon 375 aynı dosyada (duyarlı). Sonunda **doldurulacak
  yer tutucuların listesi.**

---

## Kutuya yazılacak cümle

> Luera TimeFlow için tek turda üç iş, **üç ayrı HTML dosyası**, bu sırayla:
> **A)** Müdür 23 v2 müşteri kartına **Paket sat** akışı (şablondan ya da
> hizmetten seç → onay → karta dönüş; telefonda satış hak ve alacak yazar,
> peşinat/taksit masaüstünde; risk bayrağının kapattığı paket basılamaz) ve
> kartta **"Randevu ver"in yeri**. **B)** Canlı gelen
> değişikliğin hareket dili: yeni/değişen/giden kart Akış ve personel Bugün'de
> nasıl görünür — Akış'ın tasarımı dokunulmaz, **basılmak üzere olan kart
> yerinden oynamaz**, 200–300 ms, ölçülü. **C)** App Store için **Gizlilik** ve
> **Destek** web sayfaları (veri sorumlusu salon, Luera işleyen; fiyat yok;
> iletişim bilgisi yer tutucu). Her dosyada tek koyu/açık düğmesi, telefon
> kareleri 393 pt (375 farkı tek cümle), gerekçeler tek cümle. Ayrıntılar
> ekteki metinde.

**Effort: High.**
