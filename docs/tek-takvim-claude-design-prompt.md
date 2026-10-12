# TEK · T2 · Takvim — Claude Design promptu

Tek kişilik işletmenin **Takvim** sekmesi (v4 · T1) telefonda birebir
uygulandı ve ürün sahibi bakıp şunu dedi: **"çok basit, çok rüküş bir takvim
tasarımı."** Haklı: T1, müdürün çok sütunlu takviminin tek sütuna indirilmiş
hâli. Geniş bir sütunda aynı koyu kutular, köşede üç satır yazı, aralarında
saatlerce boş ızgara. Gün ekranının (G1–G5) sıcaklığı ve dili burada yok.

Bu tur takvimin **gövdesini** (ızgara + randevu blokları + boş zaman) yeniden
tasarlıyor. Başlık ("Sal." · 13 · alt satır) ve hafta şeridi Gün'le ortak ve
onaylı; küçük bir öneri getirebilirsin ama asıl iş gövde.

**Ekler — yalnız bunlar (başka dosya ekleme):**
1. `Luera Mobil - Tek Kisilik v4.html` + `tek4-kit.js` + `tek4-ekranlar.js` +
   `tek4-belge.js` — **dördü birlikte** (HTML ötekileri yüklüyor). T1 bugünkü
   takvim; G1–G4 Gün'ün hâl dili (BEKLİYOR · GECİKTİ · SÜRÜYOR · BEKLEMEDE ·
   ADİSYON AÇIK), tokenlar ve sekme çubuğu.
2. `Luera Mobil - Tek Kisilik G5 Secici.html` — en son onaylanan tasarım;
   ürün sahibi "tam istediğim gibi" dedi. **Beklenen işçilik düzeyi bu.**
3. **Ekran görüntüleri:**
   - Takvim, 01:08 — T1'den önceki uygulama (müdürün ölçüleri)
   - Takvim, 01:20 — T1 birebir uygulanmış hâli. **"Rüküş" denen kare bu.**

**Effort: High.**

---

## Çıktı kuralı — önce bunu oku

- **Tek HTML dosyası:** `T2-takvim.html`. Tur yarıda kesilirse "devam"
  dendiğinde kaldığın kareden sürdür.
- **Önce iki yön, sonra seçilen.** T2·1'i iki farklı yönle çiz (ör. "sakin /
  editoryal" ve "yoğun / bilgi dolu"), her birine iki cümle gerekçe. Ardından
  önerdiğin yönle bütün kareler. Ürün sahibi seçer; iki yön yan yana durmalı.
- **Tema: tek bir koyu/açık düğmesi.** Aynı kareyi iki temada ayrı çizme.
- **Telefon ölçüsü: kareler 393 × 852.** T2·1 ayrıca 375 × 667'de çizilir.
- **Sürükleme prototipte denenebilsin** (T2·6): blok fareyle tutulup
  taşınabilsin, 15 dakikaya otursun.
- **Açıklama kısa:** her karar için tek cümle gerekçe.

## Ortak kısıtlar

- **Renk envanteri — yeni renk icat etme.** Tokenlar v4 HTML'in `body` ve
  `body.dk` satırlarında (`--bg --surf --surf2 --card --tx --tx2 --tx3 --bd
  --bd2 --or --or2 --gr --am --rd`). Turuncu `#FF5A1F` yalnız **zaman ve
  eylem** · kırmızı risk/gecikme · amber bekleme · yeşil olumlu. Uygulamanın
  tek gradyanı başlıktaki turuncu parıltı.
- **Hizmet rengi var:** her randevunun `service_color`'ı (salonun hizmete
  verdiği renk; boş olabilir). Kullanırsan durum renkleriyle (turuncu, kırmızı,
  amber, yeşil) karışmayacağı bir kanalda kullan ve nedenini yaz.
- **Yazı tipi:** Hanken Grotesk (200–900). Büyük harf metin katmanında
  yazılır (`textTransform` Türkçe İ'yi bozuyor). Rakamlar tabular.
- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş, ayakta, tek elle.
  En kısa randevu (15 dk) da dokunulabilir olmalı.
- **Alt sekme çubuğu** yüzen cam; ekranın alttaki ~118 pt'sini örtüyor.
  Günün son saati çubuğun üstüne kaydırılabiliyor.
- **Araç:** jestler `PanResponder` (**react-native-gesture-handler YOK** ve
  kurulmayacak — iki parmakla yakınlaştırma bu yüzden pahalı). Hareket RN
  `Animated` ya da reanimated 4.5.1. `expo-linear-gradient` ve `expo-blur`
  kurulu (bulanıklık blok başına pahalı — önerirsen bedelini yaz).
  `expo-haptics` kurulu. **Yok:** Skia, Lottie, `LayoutAnimation`.
- **Bedel etiketi:** her öğenin yanına **A** bugün yazılır · **B** yeni bir
  okuma ya da paket ister (bedelini yaz) · **C** mümkün değil.
- **Uydurma veri yok.** Randevu başına elde olan: müşterinin tam adı ve
  telefonu · hizmet ve rengi · başlangıç / bitiş · durum · not · müşteri
  geldi anı · iş başladı / bitti anı · bekleme bitişi · tahsil edildi mi ·
  gelmedi damgası. **Takvim okumasında fiyat, ziyaret sayısı, paket yok** —
  çizersen B etiketi.

---

# İŞ · T2 · Takvimin gövdesi

### Gerçek — bugün kod böyle çalışıyor
- **Günün aralığı salonun o günkü çalışma saatleri** (ör. 08:00–20:00).
  Randevu dışarı taşarsa o tarafa bir saat eklenir. Kapalı gün varsayılan
  09:00–20:00'yi çizer — **kapalı günün bu davranışı değişmeyecek** (ürün
  sahibinin kararı).
- **Saat 69 pt.** Az randevulu günde ekranın çoğu boş ızgara (görüntü 01:20:
  12 saatte 3 randevu).
- **Blok:** saat · yalnız ilk ad · hizmet. Boy süreyi söylüyor; 2 saatlik
  blok, köşesinde üç satır olan büyük boş bir kutu.
- **Çizilen hâller yalnız ikisi:** süren iş (turuncu kenar + sol şerit) ve
  biten iş (yarı soluk). **Bekliyor, gecikti, beklemede, adisyon açık /
  tahsil edildi ve gelmedi takvimde GÖRÜNMÜYOR.** İptal edilen randevu
  sıradan bir blok gibi çiziliyor ve başlıktaki "N randevu" sayısına giriyor
  (bu bir kusur; tasarım nasıl görüneceğini söylesin).
- **Etkileşimler (hepsi kalacak):**
  - boş saate dokun → Randevu sekmesi o saatle açılır
  - bloğa dokun → randevu kartı (detay, iptal, Ara, Mesajla hatırlat)
  - bloğu 250 ms basılı tut → kalkar, sürüklenir, 15 dakikaya oturur; dolu
    saate bırakılmaz, alttaki bant sebebini yazar
  - erişilebilir yol: aynı işler bir menüden
  - aşağı çekip yenileme
- **Şimdi çizgisi** yalnız bugün, dakikada bir ilerliyor.
- Hafta şeridi: gün başına yoğunluk noktası, kapalı gün soluk ve noktasız.

### İstenen
Takvim bir bakışta **günün hikâyesini** anlatsın: ne bitti, ne sürüyor, kim
bekliyor, sırada ne var, nerede boşluk var. Gün ekranındaki dil (etiket,
renk, sayı) takvime taşınsın; takvim Gün'ün kopyası olmasın — Gün "şimdi"yi,
takvim "bütün günü" anlatır.

### Kareler
- **T2·1 Bugün, 14:20, dolu gün:**
  - 09:30 bitti, tahsil edildi
  - 10:30 bitti, adisyon açık
  - 12:00 gelmedi
  - 13:30 sürüyor
  - 14:00 bekliyor
  - 14:10 gecikti
  - 15:00, 16:30, 17:30 sırada
  - bir de iptal

  Ana kare; iki yön burada.
- **T2·2 Bugün, az randevu** — ekran görüntüsündeki gün: 10:00 (1 saat),
  13:00 (2 saat), 16:00. Boş saatler nasıl görünüyor — asıl şikâyet bu kare.
- **T2·3 Geçmiş gün** — hepsi bitti ya da gelmedi; günün özeti.
- **T2·4 Gelecek gün** — şimdi çizgisi yok, hiçbiri başlamamış.
- **T2·5 Kapalı gün** — bugünkü davranış (09–20 ızgara) korunarak.
- **T2·6 Taşıma** — blok havada, hedef vurgusu, alt bant. Denenebilir.
- **T2·7 Bir boşluğa dokunma** — boş zamana dokununca ne olur (bugün:
  Randevu sekmesi o saatle açılır).
- **T2·1 · 375 × 667.**

### Kararlar — her birine tek cümle gerekçeyle cevap ver
1. **Boş saatler.** Saat ölçeği sabit kalsın mı, yoksa uzun boşluklar
   sıkışsın mı ("11:00 – 13:00 · 2 saat boş" gibi tek şerit)? Sıkışırsa
   boş saate dokunup randevu verme ve sürükleyip taşıma nasıl çalışıyor —
   ikisi de kalmak zorunda.
2. **Hâl dili.** Gün'ün kelimeleri (BEKLİYOR, GECİKTİ, SÜRÜYOR, BEKLEMEDE,
   ADİSYON AÇIK) blokta nasıl görünüyor: etiket mi, renk mi, ikon mu? Biten
   iş ile tahsil edilmiş iş ayrışıyor mu?
3. **İptal ve gelmedi** takvimde çizilsin mi? Çizilirse yer kaplıyor mu,
   üstüne yeni randevu konabiliyor mu, "N randevu" sayısına giriyor mu?
4. **Uzun blok.** 2 saatlik blokta ne yazıyor: saat aralığı ve süre, soyad,
   not, telefon? Kısa blokta (15–30 dk) ne kalıyor?
5. **Hizmet rengi** kullanılıyor mu, hangi kanalda?
6. **Başlığın alt satırı.** Bugün "3 randevu"; Gün'ün başlığı "2 iş bitti,
   1 gelmedi, 3 kaldı" diyor. Takvimde ne yazmalı — doluluk da mı?
7. **Şimdi çizgisi** yalnız çizgi mi, saat hapıyla mı? Geçmiş saatler
   geri çekiliyor mu?
8. **İlk açılış konumu.** Bugün açılınca ızgara günün başında; şimdiye ya da
   ilk randevuya mı kaymalı?
