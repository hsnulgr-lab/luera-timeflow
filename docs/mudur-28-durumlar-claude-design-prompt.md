# Müdür 28 · Yükleniyor · Hata · Çevrimdışı — Claude Design promptu

Ekler: `docs/design-reference/Luera Mobil - Durumlar.html` (personel modunun durum dili —
**kopyalanacak değil, ayrışacak referans**), `Luera Mobil - Mudur Modu.html`,
`Luera Mobil - Mudur 22 Bos Gun.html`, `Luera Mobil - Mudur 19 Gun Cetveli.html`.

---

**Müdür 28 · Müdür modunun üç zor hâli: yükleniyor, okunamadı, çevrimdışı**

Luera TimeFlow'un müdür mobil uygulamasında dört ekran var ve üçü de veriyi sunucudan
okuyor. Verinin **gelmediği**, **geç geldiği** ve **hiç gelemeyeceği** hâller hiç
tasarlanmadı. Bugün bu üç hâl de aynı şeyi çiziyor: boş bir gün. Bu bir tasarım eksiği
değil, **yalan** — tasarlanması gereken şey bu.

## Bağlam — kim, nerede, neyi kaçırıyor

Kullanıcı salonun müdürü. 40–55 yaş. Telefonu tek eliyle, çoğu zaman ayakta, salonun
gürültüsünde, arada bir kuaför koltuğuyla kasa arasında yürürken kullanıyor. Uygulamayı
günde otuz kez, her seferinde beş saniyeliğine açıyor ve tek soru soruyor: **"şu an ne
oluyor?"**

Salonun wifi'si kararsız. Bodrum kattaki yıkama bölümünde çekmiyor. Müdür bunu bilir ama
uygulamanın sustuğunu bilmez.

**Kaçırdığı şey şu:** sunucuya ulaşılamadığında ekran "bugün boş" diyor. Müdür buna
inanıyor. Salonun dolu olduğu bir öğleden sonra, telefonunda salonun boş olduğunu okuyor.

## Mevcut hâlin teşhisi — tasarımın çözmesi gerekenler

1. **Hata sessizce yutuluyor.** Takvim ekranında gün sayıları okunamazsa hiçbir şey
   değişmiyor: şeritteki bütün günler **sıfır randevu** görünüyor. Okunamamış bir gün ile
   gerçekten boş bir gün ekranda birbirinin aynı.
2. **Yükleniyor hâli, boş hâl olarak çiziliyor.** Müdür 22'nin sakin "bugün boş" plakası
   ve gradyanı, veri gelmeden önce de devreye giriyor. (Personel günü ekranında bunu
   yakalayıp bir iskelet ekledik; ana ekranda ve takvimde hâlâ yok.)
3. **Çevrimdışı diye bir kavram yok.** Müdür modunda ağ durumunu okuyan tek satır yok.
   Wifi düşer, müdür randevu oluşturur, kayıt gitmez, müdür bunu **hiç öğrenmez**.
4. **Aşağı-çekip-yenileme sahte.** Çark görünür görünmez kayboluyor; bekleme yok. Gerçek
   uca bağlandığında müdür çeker, çark bir kare parlar, hiçbir şey olmaz.

## Neden personel modunun durumları buraya olduğu gibi taşınamıyor

`Durumlar.html` yedi hâl tanımlıyor ve **altısı personel kumandasının** ekranları: dar,
tek sütun, tek eylem, ekranın üstü boş. Müdür modunun üstü boş değil — ekranın tepesinde
sırayla **gün cetveli**, **gün plakası** ve **personel şeridi** duruyor, üçü birden.
Personelin ince amber bandı oraya olduğu gibi girerse hepsini aşağı iter.

Personel bandının kendisi (26 pt yükseklik, amber zemin `#D9A43B` / `#B87A00`, üstten
`translateY` ile inen, `accessibilityLiveRegion="polite"`) **kodda çalışır hâlde** ve
yeniden kullanılabilir. Soru bandın nasıl göründüğü değil, müdür modunda **nereye
girdiği**.

## Tasarlanacak ekranlar

### A · Yükleniyor — üç iskelet

Müdürün üç ekranı üç farklı şekle sahip; tek bir gri dikdörtgen üçünde de yanlış durur.

- **A1 · Akış ekranı** — üstte personel şeridi (52 pt halkalar, 58 pt genişlik), altında
  olay listesi (satır 16 pt dikey boşluk, saat sütunu 42 pt, isim 19 pt).
- **A2 · Takvim** — dikey saat ızgarası + personel sütunları.
- **A3 · Randevu kartı** — tek kart, üstte isim, altında rozetler ve satırlar.

Her biri için tanımla: iskelet **kaç satır** çiziyor, **ne kadar sonra** beliriyor
(anında beliren iskelet, hızlı ağda titreme yaratır), nabız var mı yok mu — ve varsa
`opacity` dışında hiçbir şey animasyonlanamayacağını hesaba kat.

**Bu ekranların hiçbirinde "Yükleniyor…" kelimesi yazmasını istemiyorum; ama yanılıyor
olabilirim. Kelime gerekiyorsa gerekçelendir.**

### B · Okunamadı — hata hâli

Veri isteği başarısız oldu. Ekranda ne var?

Cevaplaman gerekenler:

- **Nerede duruyor?** Ekranın tamamını kaplayan bir hâl mi (o zaman cetvel ve şerit de
  gider mi?), yoksa içeriğin yerine geçen bir blok mu, yoksa üstten inen bir bant mı?
  **Üç ekran için cevap aynı olmayabilir** — takvimde şeridi kaybetmek, akışta kaybetmekle
  aynı şey değil.
- **Hangi renk?** Bu üründe **kırmızı risk demektir** — gelmemiş müşteri, silinen kayıt.
  Bir ağ hatası risk değil. Amber `#D9A43B` (koyu) / `#B87A00` (açık) muhtemel cevap ama
  kararı sen ver ve gerekçelendir. **Turuncu `#FF5A1F` kullanılamaz**: bu üründe turuncu
  yalnız ZAMAN ve EYLEM taşır, hiçbir zaman durum taşımaz.
- **Hangi kelime?** "Bağlanılamadı" mı, "Liste okunamadı" mı, başka bir şey mi? Müdüre
  suç yüklemeyen, teknik olmayan, kısa bir cümle. Tek bir cümle yaz ve ona bağlı kal.
- **Tekrar dene** düğmesi var mı? Varsa basıldığında ne oluyor — düğme mi değişiyor,
  iskelet mi geliyor?
- **Kısmi hata**: takvimde gün sayıları okunamadı ama günün randevuları okundu. Ekranın
  yarısı doğru, yarısı bilinmiyor. **Bilinmeyen sayı sıfır olarak çizilemez.** Sıfır bir
  ölçümdür, bilinmemek bir boşluktur — ikisi ekranda ayrı görünmeli.

### C · Çevrimdışı

Cihazın ağı yok. Hata hâlinden farkı: bu **kalıcı** ve **bilinen** bir hâl, tek bir
isteğin başarısızlığı değil.

- **Bant nereye giriyor?** Gün cetveli, gün plakası ve personel şeridi ekranın tepesinde
  sırayla duruyor. **Bu üçünün yüksekliği değiştirilemez** — ölçüleri sabit ve bu
  ekranlar zaten tasarlandı. Bant onların üstüne mi, arasına mı, altına mı giriyor?
  Güvenli alanla ilişkisi ne?
- **Elindeki veri ne oluyor?** Ağ gitmeden önce okunmuş liste ekranda duruyor. Silinmesi
  saçma, ama artık **eski**. Bu eskiliği ekran nasıl söylüyor? (Bir zaman damgası mı —
  "14:32'den beri güncellenmedi"? Bir soluklaşma mı? Hiçbir şey mi?)
- **Hangi düğmeler çizilmiyor?** Bu ürünün değişmez kuralı: **ölü kontrol yok.** Ağ
  yokken sunucuya yazan her şey — randevu oluştur, tahsilat al, randevu taşı, "Geldi"
  işaretle, saat/personel değiştir — basılırsa sessizce yutulur. Bunlar `disabled` mi
  oluyor, hiç mi çizilmiyor, yoksa basılınca bir şey mi söylüyorlar? **Kararı ver ve
  bütün ekranlarda aynı kararı uygula.**
- **Ağ geri geldiğinde** ne oluyor? Bant nasıl çıkıyor, liste kendiliğinden mi
  yenileniyor, yenilendiğini müdür nereden anlıyor?

### D · Aşağı çekip yenileme

Bugün sahte: çark bir kare parlayıp kayboluyor. Gerçek bekleme hâlini tanımla — çark mı,
üstte bir çizgi mi, iskelete dönüş mü? Yenileme **başarısız olursa** ne oluyor? (Elindeki
liste duruyor ve bir şey söyleniyor, sanırım — ama listeyi silmek kesinlikle yanlış.)

## Değişmez kısıtlar

- **Renk envanteri:** turuncu `#FF5A1F` = yalnız ZAMAN ve EYLEM, asla durum. Kırmızı
  `#E07272`/`#C94040` = risk. Amber `#D9A43B`/`#B87A00` = uyarı. Yeşil `#5FBF64`/`#2D8F32`
  = olumlu. Renk tek başına anlam taşımaz; kelime her zaman yazılı.
- **Hareket sözleşmesi:** yalnız `opacity`, `translateX/Y`, `scale`. Yükseklik, genişlik,
  renk, yarıçap, gölge **animasyonlanamaz** — renk değişimi ancak iki yüzeyin çapraz
  solmasıyla olur. `reduceMotion` açıkken hareket yok, sonuç anında.
- **Üst kabuğun ölçüleri sabit.** Cetvel, plaka ve personel şeridi yeniden
  boyutlandırılamaz.
- **Yükleniyor hâli boş hâl değildir.** Müdür 22'nin boş gün dili yalnız gerçekten boş
  bir güne aittir.
- **Sıfır bir ölçümdür, bilinmemek bir boşluktur.** İkisi asla aynı çizilmez.
- **Sahte onay yok.** Gerçekleşmemiş bir şey gerçekleşmiş gibi gösterilemez.
- Abonelik / plan / fiyat / fatura **hiç çizilmez** (App Store 3.1.1). `Durumlar.html`'in
  05a "kilitli · müdür" ekranı bu tasarımın dışındadır.
- Açık temada iki yüzey neredeyse aynı (`#FAF7F3` üzerine `#F0E9DF`) — basılabilir her
  yüzeyin kılcal kenarlığı olmalı.

## Çıktı

Her hâl için: koyu ve açık tema, ölçüler, kelimeler, hareketin süresi ve eğrisi, hangi
kontrolün çizilmediği. Ve her karar için **bir cümlelik gerekçe** — özellikle bandın
yerini seçerken ve ölü kontrol sorusunu cevaplarken.
