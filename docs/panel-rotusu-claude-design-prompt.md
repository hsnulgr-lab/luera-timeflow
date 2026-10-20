# MASAÜSTÜ PANEL RÖTUŞU · timeflow.lueratech.com (Güzellik yüzü) — Claude Design promptu

**Yazıldı:** 2026-10-20. İşletme sahibi uygulamayı açınca ilk bu ekranı görüyor
ve gün boyu açık tutuyor. Telefon uygulaması 30'dan fazla tasarım turundan
geçti; masaüstü panel ise Temmuz–Ağustos'taki parçalardan kurulu kaldı.
İkisi yan yana konunca masaüstü **vasat** görünüyor.

**Kullanıcının isteği: büyük değişiklik DEĞİL, rötuş.** Aynı ekran, aynı
bölgeler, aynı sıra. Yalnızca ufak ama "profesyonel" duran dokunuşlar:
yazı, boşluk, yüzey, hiyerarşi, boş hâller, tutarlılık. Bitince ekrana bakan
kişi "yeniden yapılmış" değil, "toparlanmış, pahalı görünüyor" demeli.

**Effort: High.** Tek turda bitsin. Aşağıdaki her sayı ve sorun koddan ve
canlı ekrandan ölçüldü. Uydurma alan, uydurma veri ya da yeni özellik ekleme.

---

## Ekler — `panel-rotusu-ekleri/` klasörü, yalnız bunlar

1. `01 bugun-bos-gun.webp`: canlı panel, **bugün hiç seans yok**.
2. `02 bugun-sakin-siradaki-var.webp`: canlı panel, salon boş, sıradaki seans
   var. Üstte koyu "Sıradaki" kartı açık.
3. `03 bugun-gun-plani.webp`: aynı gün, aşağı kaydırılmış. Gün planı
   ızgarası ve boş saatin üstündeki "+" görünüyor.
4. `04 Luera Firsat Modulu v2.html`: karşılama kartının ortasındaki **fırsat
   çarkının** asıl tasarımı. Davranış buradan; görünüm rötuşlanabilir.
5. `05 Luera TimeFlow Salon Sakin.html`: "Şu an salonda" panelinin ve koyu
   "Sıradaki" kartının asıl tasarımı.
6. `06 Luera Masaustu - Ayarlar v1.html` (+ yanındaki `support.js`): **masaüstünün
   en yeni dili.** Satır, kart, anahtar, düğme ölçüleri. Panel bu dilin ailesi
   gibi görünmeli.
7. `07 Luera Mobil - Mudur 29 Siradaki Randevu Karti v2.html`: **ulaşılacak
   çıta.** Telefondaki aynı "sıradaki" kavramının işlenişi: yazı boyu, sayıların
   duruşu, sakinlik.
8. `08 · 09 telefon-*.png` (varsa): telefon uygulamasının müdür ekranından iki
   gerçek ekran görüntüsü. Kıyas için.

Durumlar.html ve Hareket Sözleşmesi bu işin eki DEĞİL.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Masaustu - Panel Rotusu.html`. Kareler aşağıdaki
  sırayla, her karenin başında kodu (D1, D2 …).
- **Ana kare 1440 × 900**, sol kenar çubuğu dahil. Ayrıca D3 için
  **1280 × 800** ve **1024 × 768**. Panel 768 px'e kadar masaüstü yüzüyle
  açılıyor, daha darı telefonun işi; onu çizme.
- **Önce / Sonra:** D1, D2 ve D4'ün üstünde tek bir anahtar. "Önce" ekteki
  ekran görüntüsünü, "Sonra" rötuşu gösterir. Kullanıcı farkı bununla görecek.
- **Tema:** açık ve koyu, tek düğmeyle değişsin, kareyi iki kez çizme. D1, D2
  ve D4 iki temada gösterilsin.
- **En sonda bir değişiklik tablosu:** her rötuş için tek satır,
  **bölge · eski değer → yeni değer · tek cümle neden**. Örnek:
  `Karşılama başlığı · 25px/800 → 28px/700 · mobil başlıkla aynı ağırlık`.
  Uygulama bu tablodan yapılacak; tabloda olmayan değişiklik uygulanmaz.
- Değişiklikleri tek tek kalıp olarak değil, **kural olarak** yaz: "eyebrow
  her yerde şu", "kart kabuğu her yerde şu". Panelin 8 başka sektör yüzü daha
  var (kuaför, berber, diş…); onlar sonra aynı kuralları alacak.
- Web'de çalışacak: **CSS + az JS.** Ağır kütüphane, canvas, video yok.
- Emoji yok. İkonlar sade çizgi (Lucide ailesi, bugünkülerle aynı).

---

## Dokunulmaz sözleşmeler

Rötuş bunlardan hiçbirini değiştirmez. Çizimde de bozulmamalı.

- **Bölgeler ve sıraları aynı kalır:** Karşılama kartı → Salon durumu →
  (açıksa) Randevusuz müşteri formu → Operasyon kontrolü (salon içi akış ·
  seçili seans · gün planı).
- **Fırsat çarkı:** dikey çark, ortadaki kayıt seçili, aksiyon düğmesi çarkın
  **dışında sabit** (44 px dokunma hedefi kaymaz). Her kayıtta **tek eylem**.
  WhatsApp'a çıkan eylemler turuncu, ötekiler koyu.
- **Salon durumu üç hâlde açılır** ve kural koddadır:
  - salon boş + sıradaki seans var → tam panel (koyu Sıradaki kartı yıldız)
  - salon boş + seans yok → tek ince satır
  - salonda müşteri var → tam panel, başlık "N müşteri salonda"
- **Salon içi akış: Bekliyor → İşlemde → Kasada.** Kasada sütununda eylem
  **yok**; tahsilat Kasa sayfasında yapılır. Satır eylemi ("Kabine al",
  "Bitir") masaüstünde üstüne gelince görünür.
- **10 dakikayı geçen bekleme** kırmızıyla işaretlenir. Bu, panelin en
  önemli uyarısı.
- **Öngörü satırı (✦ ipucu) yalnız söyleyecek bağlamsal bir şey varken
  çıkar.** Dolgu cümle yok.
- **Gizlilik anahtarı** ortak ekranda soyadı kısaltır ("Ayşe Y."). Yetki
  değil, nezaket.
- **Gün planı:** saat ekseni, geçmiş saatler soluk bant, turuncu "şimdi"
  çizgisi, 2+ saatlik boş blok ince banda katlanır, boş saate
  tıklayınca "+" o saat ve sütunla yeni seans açar, çakışan seanslar sütunu
  paylaşır. Kartta **hizmet rengi sol şeritte, durum rengi kart tonunda.**
- **Kurulum ilerlemesi panelde ayrıca gösterilmez:** tek sayaç uygulamanın
  üstündeki şerit. 2026-10-19'da iki sayaç çelişti ve kaldırıldı, geri koyma.
- **Sektör kelimeleri değişkendir:** güzellikte "seans" ve "ünite", başka
  sektörde "randevu" ve "koltuk/kabin". "Randevusuz müşteri" her sektörde
  aynı kalır.
- **Renk:** yalnız aşağıdaki jetonlar. **Yeni renk yok**, tek vurgu turuncu.
  Kenarlık ya da gölge opaklığı ayarlanabilir; ayarlanırsa tabloya yaz.

### Renk jetonları (bugünkü, `src/index.css` · `.dash-theme`)

| Jeton | Açık | Koyu |
|---|---|---|
| sayfa | `#F3ECE0` | `#120E08` |
| yüzey / yüzey2 / yüzey3 | `#FAF7F3` / `#F0E9DF` / `#E9E1D5` | `#1C1710` / `#252015` / `#30281A` |
| kart | `#FFFDFB` | `#241E16` |
| mürekkep | `#0E0E0E` | `#F3EDE3` |
| koyu kutu (Sıradaki, tarih) | `#0E0E0E` | `#2A2118` |
| soluk / daha soluk | `ink · .48` / `ink · .30` | `ink · .55` / `ink · .30` |
| kenarlık / yumuşak / güçlü | `ink · .09` / `.06` / `.14` | `ink · .10` / `.07` / `.22` |
| turuncu / koyu turuncu | `#FF5A1F` / `#E8430F` | `#FF5A1F` / `#FF7A45` |
| yeşil · kırmızı · amber · mavi · mor | `#2D8F32` · `#C94040` · `#B87A00` · `#3B6FB0` · `#7B4FA0` | `#7AD3A0` · `#E07070` · `#E0A12E` · `#7AAFE8` · `#C09AE0` |

Yazı: **Hanken Grotesk** (uygulamanın ana yazısı). Telefon uygulaması aynı
paleti kullanıyor; fark renkte değil, **ölçüde ve yazıda**.

---

## Teşhis — masaüstü neden vasat görünüyor

Koddan ölçüldü. Rötuşun hedefi bu listedir.

1. **Tek aralıklı (mono) yazı her yerde.** Panelde 32 ayrı yer JetBrains Mono
   kullanıyor: üst etiketler, tarih kutusu, "ağda · Furkan Ülger" hizmet
   satırı, ünite hapındaki saat, sayaç rozetleri, saat ekseni. **Telefon
   uygulamasında tek bir mono yazı yok.** Orada sayılar ana yazıda, sabit
   genişlikli rakamla (`tabular-nums`) duruyor. Mono'nun bu yoğunluğu ekranı
   "geliştirici aracı" gibi gösteriyor.
2. **Yazılar çok küçük.** Fırsat rozeti 9 px, tarih kutusunda gün adı
   9,5 px, karşılama üst satırı 10 px, ünite ve kart alt satırları 10,5 px,
   düğmeler ve alt metinler 12,5 px. Telefonda gövde 13,5–16,5 px. Kullanıcı
   kitlesi sık sık 40–55 yaş.
3. **Üst etiketler (eyebrow) tutarsız.** "OPERASYON KONTROLÜ" büyük harf;
   "Şu an salonda", "Üniteler", "Sıradaki" küçük harf ama mono ve geniş harf
   aralıklı. Türkçe küçük harf bu aralıkla "Ş u  a n  s a l o n d a" gibi
   dağılıyor.
4. **Birincil düğme belli değil.** Karşılama kartında yan yana **iki siyah
   dolu düğme** var ("Seans planla" + "Yeni Seans"), yanında bir de çerçeveli
   "Takvimi Aç". Boş günde ekranda **dört** "yeni" düğmesi oluyor: Seans
   planla · Yeni Seans · Randevusuz müşteri al · Yeni seans.
5. **Aynı şey birkaç kez söyleniyor.**
   - Boş günde "seans yok" üç kez: karşılama başlığı, "Salon boş · başka
     seans yok" satırı ve "Bugün için seans yok" kartı.
   - Randevulu günde koyu Sıradaki kartı ile aşağıdaki seçili seans çubuğu
     aynı kişiyi ve aynı eylemi gösteriyor ("Geldi olarak işaretle" / "Geldi").
6. **Boş hâller bitmemiş görünüyor.** Salon içi akışta üç sütun "0" rozeti ve
   "—" çizgisiyle boş bir tablo gibi duruyor. Koyu Sıradaki kartının içeriği
   üste yaslı, altında büyük bir boşluk var (kart sol panelin boyuna uzuyor).
   Boş günde 9 saatlik boş ızgara ekranın yarısını kaplıyor.
7. **Kesik metin.** Fırsat çarkında "8 seans h…", arkadaki kayıt %30
   opaklıkta ve okunmuyor; yalnız "1/5" sayacı kalıyor.
8. **Parıltı ve gölge ağır.** Turuncu düğmelerde `0 6px 18px` %32 turuncu
   gölge. Kenar çubuğundaki etkin çubuk sürekli "nefes alan" turuncu
   parıltıyla yanıp sönüyor. Köşeler 9, 11, 12, 14, 16 ve 20 px olarak karışık.
9. **Ünite hapları:** yedi kesik çizgili hap yan yana. "Boş = kesik çizgi"
   bilerek seçilmiş bir anlam, ama yedisi birden gürültü yapıyor ve
   sonuncusu ("Kabin 3") ikinci satırda yalnız kalıyor.
10. **Düğme metinleri tutarsız:** "Takvimi Aç", "Yeni Seans" büyük harfle;
    "Yeni seans", "Müşteri kartı" cümle düzeninde. Türkçede cümle düzeni doğru.
11. **Emoji:** başlıkta "✨", boş Sıradaki kartında "✨", uyarıda "⚠".
    Telefon uygulaması emoji kullanmıyor.
12. **Kabuk:** üstte tam genişlik pembe-kırmızı WhatsApp uyarı şeridi
    bağırıyor. Kenar çubuğunda ikon ve yazılar iri, satırlar seyrek.

---

## Rötuşun üç sözü

1. **Her bölgede tek birincil.** Bir bakışta "şimdi neye basacağım" belli
   olur. Öteki eylemler ikincil ya da sessiz.
2. **Telefonun ölçüsüne yaklaş.** Daha az ve daha büyük yazı, mono yerine
   ana yazıda sabit genişlikli rakam, tutarlı köşe ve gölge.
3. **Bir kez söyle.** Aynı bilgi ekranda bir yerde yaşar. Boş hâl sakin ve
   **bitmiş** görünür, yarım tablo gibi değil.

---

## Bölge bölge — ne rötuşlanır

### A · Karşılama kartı

- **Tarih kutusu kalır** (markanın imzası). Ağırlığı hafifleyebilir; gün adı
  ve ay okunur boya çıkar. Mono olmak zorunda değil.
- **Başlık** ("Bugün **3 seans** sizi bekliyor.") ekranın en güçlü yazısı.
  Alt satırdaki kırılım (`0 tamamlandı · 1 kaldı · 5 fırsat bekliyor`) okunur
  boyda olur. "Gelmedi" kırmızı kalır.
- **Fırsat çarkı:** kesik metin olmasın. Bağlam satırı ya sığar ya iki
  satıra iner. Rozet (Paket bitti / Seansı planlanmamış …) okunur boyda.
  Arkadaki kayıtlar soluk ama **okunur**. Sayaç ("1/5") çarkın parçası gibi
  dursun.
- **Düğmeler:** çarkın düğmesi çarka aittir. Sağdaki iki düğmeden biri
  birincildir ("Yeni seans"), "Takvimi aç" ikincildir. Yan yana iki siyah
  dolu düğme olmaz. Metinler cümle düzeninde.

### B · Salon durumu

- **İnce satır (boş gün):** "Salon boş · başka seans yok · 7 ünite hazır" +
  "Randevusuz müşteri al". Düğme turuncu kalır ama parıltısız.
- **Tam panel:** üst etiket kuralı her yerde aynı (bkz. teşhis 3). Büyük
  cümle ("Salon şu an sakin. / Sıradaki müşteriye hazırız.") kalır.
- **Ünite hapları:** anlam aynı (boş · dolu "14:30'da boşalıyor" · hazırlanıyor),
  görünüm sakin. 7–10 ünitede de düzgün dizilsin, sonuncusu yetim kalmasın.
  Gerçek adlar uzun olabilir ("Lazer Odası 2").
- **Bekleme odası satırı:** "Bekleme odası boş · Sıradaki seans 09:00 · dwd"
  ve "Randevusuz müşteri" düğmesi. Büyük harfli mono başlık yerine okunur
  bir başlık.
- **Koyu Sıradaki kartı:** büyük saat, "20 dk sonra", ad, hizmet · uzman,
  varsa paket ilerlemesi (5/8), tek turuncu düğme "Geldi olarak işaretle".
  **Kartın altında boşluk kalmasın.** İçerik dikeyde dengelenir ya da kart
  kendi boyunda kalır. Saat ana yazıda, sabit genişlikli rakamla.
  Aynı saatte 2–3 müşteri varsa liste hâli (her satırın kendi "geldi" düğmesi)
  de aynı dilde.
- **Boş Sıradaki** ("Bugün başka seans yok"): emoji yerine sakin bir ikon ya
  da hiç ikon.

### C · Operasyon kontrolü

- **Başlık satırı:** "Bugünün planı" + Üniteler/Uzmanlar seçici + Gizlilik
  anahtarı. Ayarlar v1'deki seçici ve anahtarla aynı aile.
- **Salon içi akış (Bekliyor · İşlemde · Kasada):**
  - Dolu satırda baş harf rozeti, ad, "Ünite 2 · Elif", süre ("12 dk") ve
    üstüne gelince eylem.
  - 10 dk'yı geçen bekleme kırmızı, ama satır bağırmadan.
  - **Üç sütun da boşken** "0 · —" tablosu yerine sakin, tek satırlık bir boş
    hâl. Örnek: "Salonda kimse yok". Bilgi zaten B'de söylendiği için ince
    olsun.
- **Seçili seans çubuğu:** B'deki Sıradaki kartını tekrar etmesin.
  - Hiçbir şey seçilmemişse ve sıradaki zaten yukarıda görünüyorsa bu çubuk
    ya çok sessiz durur ya da hiç görünmez. Tasarım karar versin, gerekçesini
    tek cümleyle yazsın.
  - Boş günde "Bugün için seans yok" kartı ve dördüncü "Yeni seans" düğmesi
    kalkar.
- Eylem düğmeleri (Müşteri kartı · Geldi · Kabine al · İşlemi bitir · Kasayı
  aç · ₺850) aynı aileden.

### D · Gün planı

- Sütun başlıkları: ünite adı + durum noktası + alt satır ("boş",
  "~14:30 boşalıyor", "3 seans", "boş · 2 tamamlandı"). Yedi kez "boş" yazısı
  gürültü yapmasın. Bej dolgu başlık şeridi daha hafif olabilir.
- Çizgiler: saat çizgisi, yarım saat çizgisi, sütun ayrımı ve sıradaki
  sütunların farklı tonu. **Daha az çizgi, daha çok hava.**
- Seans kartı: saat · hizmet / ad / uzman. Ad en güçlü satır. Sol şerit
  hizmet rengi, kart tonu durum.
- **"+" boş saat yakalayıcısı:** üstüne gelince çıkan turuncu kenarlı büyük
  kutu yerine daha ince bir ipucu.
- **Şimdi çizgisi** ve saat etiketi ("14:20") net. Geçmiş bant soluk.
- **Boş gün:** 9 saatlik boş ızgara ekranı doldurmasın. Ya kısa ve sakin bir
  hâl ya da ızgara görünür kalır ama hafifler. Tasarım seçsin, gerekçesini
  tek cümleyle yazsın. "+" ile seans ekleme boş günde de çalışmalı.

### E · Kabuk (kenar çubuğu + uyarı şeridi)

Kabuk **bütün sayfalarda** görünür; burada yapılan rötuş her sayfaya geçer.
Hafif tut.

- **Kenar çubuğu:** satır yoğunluğu, ikon boyu, etkin satır. Sürekli nefes
  alan turuncu parıltı yerine sakin, sabit bir etkin hâl. Alttaki kullanıcı
  bloğu ("furkan · İşletme sahibi" + bildirim zili) aynı aileden.
  **Menü adları bu turda değişmez.**
- **WhatsApp uyarı şeridi:** mesaj aynı ("WhatsApp bağlantısı düştü —
  hatırlatmalar gönderilmiyor. Yeniden bağlan"). Gerçek bir arıza olduğu için
  açıkça görünmeli, ama tam genişlik pembe zemin yerine daha sakin bir uyarı
  dili. "⚠" emojisi yerine çizgi ikon.

---

## Kareler — sırayla

Örnek veri gerçekçi olsun. Hizmetler: Lazer epilasyon, Ağda, Cilt bakımı,
Kaş-kirpik laminasyon, Kalıcı oje. Uzmanlar: Elif, Merve, Seda. Üniteler:
Ünite 1–4, Kabin 1–3. Müşteri adları Türkçe ve gerçekçi; bir tanesi uzun
olsun ("Gülşen Karaağaçlı Yıldırım").

| Kod | Kare | Tema |
|---|---|---|
| **D1** | **Boş gün.** Seans yok, 5 fırsat, salon ince satırda. Ekran 01'in rötuşu. | açık + koyu · Önce/Sonra |
| **D2** | **Sakin sabah.** Saat 08:40, salon boş, 6 seans var, sıradaki 09:00 ("20 dk sonra"), paketli müşteri (5/8). Ekran 02'nin rötuşu. | açık + koyu · Önce/Sonra |
| **D3** | **Yoğun an.** Saat 14:20; 2 bekliyor (biri 14 dk, kırmızı), 3 işlemde, 1 kasada (₺850); ipucu satırı görünür; 3 ünite dolu, 1 hazırlanıyor; çarkta 5 kayıt; bir seans seçili. Ekranlarda hiç görülmemiş hâl; **rötuş en çok burada sınanır.** | açık |
| **D4** | **Gün planı yakın plan:** 7 sütun, şimdi çizgisi, geçmiş bant, katlanmış boş bant (12:00–14:00), çakışan iki seans, "+" üstüne gelinmiş hâl. Ekran 03'ün rötuşu. | açık + koyu · Önce/Sonra |
| **D5** | **Gün bitti.** "Bugünün işi tamamlandı." 8 tamamlandı, 1 gelmedi (kırmızı), salon boş. | açık |
| **D6** | **Aynı saatte 3 müşteri:** Sıradaki kartının liste hâli. | açık |
| **E1** | **Kabuk:** kenar çubuğu + WhatsApp uyarı şeridi, D2'nin üstünde. | açık + koyu |
| **R** | D3 · 1280 × 800 ve 1024 × 768. | açık |

---

## Hareket

Az ve sakin. Her hareket için tek satır yaz: **özellik · ms · eğri**.

- Sürekli dönen ya da nefes alan animasyonları gözden geçir: kenar çubuğu
  parıltısı ve işlemdeki gün planı kartının nabzı. "Canlı" sinyali kalabilir,
  ama gözü yormayacak kadar ince olmalı.
- Durum değişimi (Bekliyor → İşlemde) satırın yer değiştirmesiyle anlaşılsın;
  sert bir sıçrama olmasın.

---

## Ton

Ekrandaki metinler bugünküyle aynı kalır. Rötuş metin yazmıyor, yalnız
düzenliyor. Yeni metin gerekirse (boş hâl): kısa, sakin, teknik kelimesiz.
"Harika!" değil "Tamamdır". Düğmeler cümle düzeninde ("Yeni seans", "Takvimi
aç"). Büyük harf yalnız küçük grup başlıklarında, o da tek kuralla.
