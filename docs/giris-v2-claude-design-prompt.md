# Giriş v2 · Karşılama ve dönüş girişi — Claude Design promptu

Ekler: 2 ekran görüntüsü (mevcut hâl — karşılama, dönüş girişi) +
`docs/design-reference/Luera Mobil - Giris.html` (akışın tamamı; **yapı doğru,
değişmeyecek**) + `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`
(**hareketin sınırları; pazarlığa kapalı**).

---

**Giriş v2 — uygulamanın ilk iki karesi**

Luera TimeFlow'un mobil uygulamasında kullanıcının gördüğü **ilk iki ekranı**
yeniden tasarla: **karşılama** (kim olduğunu soran çatallanma) ve **dönüş
girişi** (Face ID ile geri gelen kullanıcı). Ekteki iki görüntü mevcut hâl —
düzeltilecek olan bu.

Bu iki ekran **çalışıyor** ve akışı doğru. İstenen şey yeni bir akış değil:
**aynı akışın hak ettiği ağırlıkta çizilmesi.** Bugün ikisi de dürüst ama
sessiz; uygulamanın geri kalanı (kahraman levhalar, cam çubuklar, gün cetveli)
çok daha iddialı. İlk izlenim en zayıf kare olmamalı.

## Bağlam — kim, ne zaman, kaç saniye

- **Karşılama** ömürde **bir kez** görülür. Salon sahibi ya da çalışanı,
  telefonu ilk kez kuruyor. Tek soru: "sen hangisisin?"
- **Dönüş girişi** ise **her gün, günde birçok kez** görülür. Müdür telefonu
  açıyor, yüzüne bakıyor, içeri giriyor. Burada geçen süre yarım saniye.

**Bu ikisi aynı ağırlıkta olamaz.** Birincisi bir kapı, bir karşılama, bir
markadır — orada gösterişe yer var. İkincisi bir kilit ekranıdır ve her gün
tekrar tekrar izlenecek bir animasyon, üçüncü günde işkenceye döner. Tasarımın
bu farkı **bilerek** kurması gerekiyor; ikisine aynı gösteriyi koymak en kolay
ve en yanlış cevap.

## Mevcut hâlin teşhisi

### Karşılama
1. **Ekranın ortası boş.** Marka üstte, iki seçim altta; arada 600 pt hiçbir
   şey yok. Boşluk bir karar gibi değil, bir eksiklik gibi duruyor.
2. **İki seçim birbirinin aynı.** "İşletmemi yönetiyorum" ve "Burada
   çalışıyorum" aynı yükseklikte, aynı renkte, aynı kenarlıkta iki dikdörtgen.
   Oysa bunlar iki farklı dünyaya açılan iki farklı kapı — biri tam yetki,
   öteki dar bir kumanda.
3. **Marka bir logo olarak duruyor, bir karşılama olarak değil.** "luera."
   yazısı ekrana giriyor ve orada kalıyor; hiçbir şey olmuyor.
4. **Gradyan var ama iş yapmıyor.** Üstte turuncu bir parıltı var, ekranın geri
   kalanı düz. Işık nereden geliyor, neyi aydınlatıyor belli değil.

### Dönüş girişi
5. **İki daire, ikisi de sessiz.** Baş harfler için bir daire, Face ID için bir
   daire; ikisi de aynı gri, aynı ağırlık. Hangisi bilgi, hangisi düğme
   ayrılmıyor.
6. **"Girmek için bakın" bir cümle, bir davet değil.** Ekran kullanıcıyı
   bekliyor ama beklediğini göstermiyor — nabız yok, hazır olma hâli yok.
7. **Face ID başarısı hiç kutlanmıyor.** Doğrulama olduğu anda ekran değişiyor.
   Arada geçen o an, uygulamanın kullanıcıyı tanıdığı andır; bugün hiç
   çizilmiyor.

## Tasarlanacak

### A · Karşılama

Taşıması gerekenler (hepsi zorunlu, kelimeler **değişebilir**):

- **Marka**: `luera` + turuncu nokta. Nokta markanın parçası, süs değil.
- **Tek cümlelik vaat**: bugün "Salonunuzun randevuları, kasası ve ekibi tek
  yerde."
- **İki kapı**: "İşletmemi yönetiyorum · E-posta ve şifrenizle girin" /
  "Burada çalışıyorum · İşletmeden aldığınız kodla girin". Her ikisinin de
  başlığı ve alt açıklaması var.
- **"Sonradan değiştirebilirsiniz."** — bu cümle kalmalı; seçimin geri
  dönülemez olmadığını söyleyen tek şey o.
- **"Yeni işletme oluştur"** bağlantısı en altta, sessiz.

Cevaplamanı istediklerim:

- **Ekranın ortası ne yapıyor?** Boş kalabilir ama o zaman boşluğun kendisi
  tasarlanmış olmalı. Işık, doku, hareket, bir zemin öğesi — ne olursa olsun
  **anlamı** olsun.
- **İki kapı nasıl ayrışıyor?** Aynı görünmemeliler. Ama "müdür kapısı
  parlak, personel kapısı sönük" de olmaz — personel bu ürünün ikinci sınıf
  kullanıcısı değil.
- **Giriş hareketi.** Ekran ilk açıldığında ne oluyor? Sırayla mı geliyor,
  hep birden mi? Kaç adım, hangi süreler?

### B · Dönüş girişi

Taşıması gerekenler:

- **Marka** (küçük, üstte ortalı).
- **Kim olduğu**: baş harfler, ad soyad, `Studio Ayla · Kadıköy`.
- **Face ID daveti** ve altında tek cümle.
- **"Şifreyle gir"** (müdür) / **"PIN ile gir"** (personel) — ikincil.
- **"Oturumu değiştir"** / **"Bu telefon benim değil"** — en altta, sessiz.

Cevaplamanı istediklerim:

- **Bekleme hâli**: ekran Face ID'yi beklerken nasıl duruyor? Sürekli dönen
  bir animasyon değil — günde otuz kez görülüyor. Ama tamamen ölü de olmamalı.
- **Tanınma anı**: doğrulama başarılı olduğunda ekran nasıl teslim oluyor? Bu
  ürünün tek "kutlama" anı burası olabilir; ama **200 ms'yi geçmemeli**,
  kullanıcı zaten içeri girmek istiyor.
- **Başarısızlık**: Face ID tanımadı. Bugün iki denemeden sonra şifre ekranına
  düşüyor. İlk başarısızlık ekranda nasıl görünüyor? (Kırmızı **kullanılamaz** —
  bkz. renk envanteri.)

## Hareket — okumadan tasarlama

Bu ürün animasyonu seviyor ama **çok dar bir çerçevede**, ve bu çerçeve teknik
bir zorunluluk:

- **Yalnız `opacity`, `translateX/Y`, `scale` animasyonlanabilir.** Hepsi
  `useNativeDriver: true` ile çalışır.
- **Yükseklik, genişlik, renk, yarıçap, gölge, blur ANİMASYONLANAMAZ.** Renk
  değişimi ancak **iki yüzeyin üst üste durup çapraz solmasıyla** olur.
- **`reanimated` ve `gesture-handler` projede YOK ve kurulmayacak.** Yay
  (spring), sarsılma (shake), sıralı giriş — hepsi RN'in kendi `Animated`'i ile
  yazılıyor. Fizik tabanlı sürükleme, morph, path animasyonu, parçacık
  sistemi **yok**.
- **`LayoutAnimation` yok.** Düzenin kendisi animasyonlanmaz.
- **`reduceMotion` açıkken hareket olmaz**, sonuç anında görünür. Her hareketin
  bu hâli de tarif edilmeli.
- Elimizde `expo-linear-gradient`, `expo-blur`, `react-native-svg` ve
  `expo-glass-effect` var. SVG **çizilebilir** ama SVG yolu (path)
  animasyonlanamaz — SVG'yi bir bütün olarak kaydırabilir, ölçekleyebilir,
  soldurabilirsin.

**Bu sınırlar içinde ne kadar iddialı olabiliyorsan ol.** Üst üste binen
katmanlar, gecikmeli sıralı girişler, ölçek + soldurma birleşimleri, kayan
ışık katmanları (bir gradyanı `translateX` ile kaydırmak serbesttir), nefes
alan bir daire (`scale` 1 ↔ 1.04) — hepsi mümkün. İmkânsız bir şey tarif
edersen uygulanamaz ve ekran bugünkü hâlinde kalır.

## Değişmez kısıtlar

- **Renk envanteri:** turuncu `#FF5A1F` = yalnız **zaman** ve **eylem**, asla
  durum. Kırmızı `#E07272`/`#C94040` = risk. Amber `#D9A43B`/`#B87A00` =
  uyarı. Yeşil `#5FBF64`/`#2D8F32` = olumlu. Renk tek başına anlam taşımaz;
  kelime her zaman yazılı.
- **Palet:** koyu `bg #120E08` · `surf #1C1710` · `card #241E16` ·
  `tx #F3EDE3`. Açık `bg #F3ECE0` · `surf #FAF7F3` · `card #FFFDFB` ·
  `tx #0E0E0E`. **Her iki tema da çizilecek.** Açık temada iki yüzey neredeyse
  aynı (`#FAF7F3` üzerine `#F0E9DF`) — basılabilir her yüzeyin kılcal
  kenarlığı olmalı.
- **Yazı ailesi** Hanken Grotesk (400–900).
- **Dokunma hedefi 44 pt'nin altına inmez.** Hedef kitle 40–55 yaş, çoğu zaman
  ayakta ve tek elle.
- **Cam yalnız kabukta** kullanılır (üst bar, sekme çubuğu, yüzen düğme).
  İçerik yüzeyleri opak ve sıcaktır; bulanık zeminde metin kontrastı düşüyor.
- **Sahte hiçbir şey çizilmez.** Olmayan bir veri, gerçekleşmemiş bir onay,
  çalışmayan bir düğme yok.
- Abonelik / plan / fiyat **hiç geçmez** (App Store 3.1.1).

## Mevcut ölçüler (değiştirebilirsin, ama bilerek)

Karşılama: marka 44 (küçük ekranda 34), üstten 44/26, yanlardan 24 · seçim
kutusu 86 (küçük 78), yarıçap 22, aralık 12 · sayfa yanı 18 · alt 30.
Dönüş: avatar 76 · ad 24 · işletme 14.5 · Face ID halkası 118, ikon 52 ·
alt eylemler 52, yandan 18, alttan 44.

## Çıktı

İki ekran, her biri koyu ve açık temada. Her hareket için: neyin
animasyonlandığı (yalnız opacity/translate/scale), süresi, eğrisi, gecikmesi ve
`reduceMotion` hâli. Ve her karar için **bir cümlelik gerekçe** — özellikle
ekranın ortasını, iki kapının ayrımını ve tanınma anını çözerken.
