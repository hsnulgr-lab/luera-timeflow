# Personel 11 · Kasaya gönderme anı

**Effort: Medium.** Tek an, tek ekran — ama geri dönüşü olmayan bir an.

---

## 0 · Bu tur hareket kısıtının DIŞINDA

Önceki on turda geçerli olan cümleyi bu turda **unut**:

> ~~Yalnız `opacity`, `translateX/Y`, `scale`. Yükseklik, genişlik, renk,
> yarıçap ve gölge animasyonlanamaz.~~

O kısıt bir üslup tercihi değildi, kurulu paket listesiydi. **`react-native-reanimated` bu tur için projeye kuruldu** (4.5.1, Expo Go içinde hazır geliyor). Artık şunlar açık ve hepsi native sürücüde:

- yükseklik, genişlik, yarıçap, renk, gölge
- `withSpring`, `withSequence`, `withDelay`, `withRepeat`
- düzen geçişleri (`Layout`, `entering`, `exiting`)
- kaydırılan değere bağlı türetilmiş hareket

**Hâlâ olmayan:** `react-native-gesture-handler` (jest kütüphanesi ayrı bir karar), Lottie, Skia. Elde `react-native-svg`, `expo-blur`, `expo-linear-gradient`, `expo-glass-effect`, `expo-haptics` var.

**Yazılmış ekranlar taşınmıyor.** Çalışan bir animasyonu yeniden yazmanın kazancı yok, riski var. Yeni paket YALNIZ bu anın ihtiyacı kadar kullanılacak.

---

## 1 · Anın kendisi

Personel işi bitirdi, adisyonu topladı, kasaya gönderiyor. Vardiyanın en çok tekrarlanan ve en çok anlam taşıyan anı bu: **iş bitti, para yola çıktı, elini çekiyor.**

Bugün ne oluyor: 64 pt'lik düğme turuncudan yeşile **tek karede** atlıyor, ikon `cash`ten `check`e değişiyor, yazı "Adisyonu kasaya gönder"den "Kasaya gönderildi"ye dönüyor. Hepsi aynı anda, geçiş yok. Ekran görüntüsünde gördüğün yeşil düğme bu.

Kaybolan şey bir süs değil, bir **onay hissi**. Personel bastı mı basmadı mı, gitti mi gitmedi mi — cevabı yalnız rengin değişmiş olması.

---

## 2 · Turun ikinci yarısı: GERİ ALMA

Kapsam kararı buydu ve turun asıl değeri burada.

Bugün adisyon gönderildikten sonra **kumanda kilitleniyor**: kalem eklenemez, çıkarılamaz, formül yazılamaz. Geri dönüş yolu **hiç çizilmemiş**. Ama salonda olan şu:

> "Kaş almayı yanlışlıkla ekledim" · "müşteri ürünü almaktan vazgeçti" ·
> "yanlış randevuda gönderdim"

Bunlar müşteri hâlâ karşındayken, gönderdikten saniyeler sonra fark ediliyor.

**Tasarlanacak olan:** geri dönüşü olmayan bir eylemin öncesi ve sonrası.

- Gönderme anında bir **geri alma penceresi** var mı? Varsa kaç saniye, ve süre nasıl görünüyor?
- Pencere kapandıktan sonra ne oluyor? Personel hiçbir şey yapamıyor mu, yoksa "müdüre düzeltme isteği" gibi bir yol mu var? *(Not: böyle bir uç YOK — çizersen bedelini etiketle.)*
- Geri alınca ne oluyor: adisyon açık hâline mi dönüyor, yoksa "geri alındı" diye ayrı bir hâl mi?
- Geri alma bir **düğme** mi, yoksa gönderilen düğmenin kendi içinde bir kapı mı?

> Kasa tarafında adisyon iptali müdürün işi ve masaüstünde var. Buradaki soru personelin kendi eliyle, kendi telefonunda, saniyeler içinde düzeltebileceği bir pencere olup olmadığı.

---

## 3 · Çevrimdışı — "gönderildi" bir yalan olabilir

Salon bodrum katta, sinyal kötü. `src/api/staff.ts` yazma isteklerini kuyruğa alıyor ve `{ queued: true }` dönüyor; arayüz karşılığı **hiç yok**.

Yani bugün ağ yokken de düğme yeşile dönüp "Kasaya gönderildi" diyor. **Gitmedi.** Kuyrukta bekliyor.

Üç hâl birbirinden ayrılmalı ve üçü de aynı düğmenin üstünde yaşıyor:

| Hâl | Gerçek |
|---|---|
| gönderiliyor | istek yolda, cevap gelmedi |
| gönderildi | sunucu aldı |
| **sıraya alındı** | ağ yok, kuyrukta; bağlanınca gidecek |

Üçüncüsü ikincisinin kısık bir hâli DEĞİL — başka bir şey söylüyor. Sunucu hatası (403/409) da ayrı: o kuyruğa girmiyor, tekrar denemeyle düzelmiyor.

---

## 4 · Tasarlanacaklar

### A · Basma anı

Parmak düğmeye değdiği an ile isteğin gittiği an arasında ne oluyor? Bugün yalnız `opacity: 0.9`. Haptik var (`feedback.medium()`).

### B · Geçiş

Turuncu → yeşil. Artık renk animasyonlanabiliyor, ama **animasyonlanmalı mı?** İkon `cash` → `check` nasıl değişiyor: takas mı, çizim mi (`react-native-svg` var, `stroke-dashoffset` artık native sürücüde animasyonlanabilir)?

Yazı iki farklı uzunlukta — düğme genişliği/yüksekliği tepki veriyor mu?

### C · Adisyon şeridi ve kalem satırları

Düğme tek başına mı değişiyor, yoksa gönderilen kalemler de bir şey yapıyor mu? Tasarımda kalemlerin "gitmesi" gerekiyor mu, yoksa listede kalıp kilitleniyorlar mı? (Bugün: kalıyorlar, hiçbir şey olmuyor.)

Kart yukarıda "TOPLAM · 4 KALEM" diyor ve toplam süreyi taşıyor. O blok da anın parçası mı?

### D · Geri alma penceresi

§2'nin görsel karşılığı. Süre görünürse **nasıl** görünüyor — sayı mı, incelen bir çizgi mi, dolan bir halka mı? (Para maskesinin fitili bu üründe zaten var: `Fuse`, incelen amber çizgi.)

### E · Üç ağ hâli

§3'ün görsel karşılığı. "Sıraya alındı" hangi renkte, hangi kelimeyle? Amber `#D9A43B` bu üründe "dikkat, tamamlanmadı" demek.

### F · Kilitli hâlin kendisi

Pencere kapandıktan sonra kumanda tamamen okunur. Bugün bu hiç anlatılmıyor — kalemler duruyor, `···` menüleri hâlâ çizili ama iş yapmıyorlar. Kilit nasıl görünüyor?

### G · reduceMotion

Hareket durur, **BİLGİ DURMAZ**. Geri alma penceresi hâlâ işlemeli ve süresi hâlâ okunmalı.

---

## 5 · Kapalı veri listesi

**Bu listede olmayanı icat etme.**

- `adisyon_items` — kalemler: `{ id, name, kind: 'product'|'material'|'extra', qty, price? }`
- `service_ended_at` — personelin bitirdiği an
- `is_paid` — kasada tahsil edildi mi *(personel bunu görmüyor: para maskeli)*
- Kuyruk durumu — `queueLength()` ve `{ queued: true }`

**Yok ve icat edilmeyecek:**

- "Düzeltme isteği" ucu — sunucuda karşılığı yok
- Gönderme geri alma ucu — **yok**; tasarlanan pencere istemci tarafında, istek gitmeden önce yaşamak zorunda ya da yeni bir uç ister (**B**)
- Personelin gördüğü tutar — para maskeli, 6 saniye sonra gizleniyor

---

## 6 · Cevaplamanı istediğim sorular

1. Geri alma penceresi var mı, kaç saniye, ve süresi nasıl görünüyor?
2. Pencere kapandıktan sonra personelin elinde ne kalıyor?
3. "Sıraya alındı" ile "gönderildi" nasıl ayrışıyor — ve ikincisi birincinin kısık hâli olmadan?
4. Geçiş kaç adım: bastı → gidiyor → gitti mi, yoksa iki hâl mi?
5. Kalem satırları ve toplam bloğu anın parçası mı, seyirci mi?
6. Kilitli kumanda nasıl görünüyor?
7. 375 × 667'de ne oluyor?

Yeni paketle gelen bir imkânı kullanıyorsan **söyle**: hangi hareket hangi API'yi istiyor. Hâlâ mümkün olmayan bir şey önerirsen (jest, Lottie, Skia) bedelini etiketle: **A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 7 · Çıktı

**Koyu ve açık temada**, her ölçü ve **her süre** yazılı:

1. Basma anından gönderildi hâline kadar geçişin kareleri
2. Geri alma penceresi — açık, süresi dolmakta, dolmuş
3. Geri alındı hâli
4. Üç ağ hâli: gönderiliyor · gönderildi · sıraya alındı
5. Sunucu hatası hâli (kuyruğa girmeyen)
6. Kilitli kumandanın tam hâli
7. `reduceMotion` hâli
8. 375 × 667 sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 8 · Ekler ve kutuya yazılacaklar

**Ekler:**
1. `docs/design-reference/Luera Mobil - Personel 06 Islem Kumandasi.html` — bu ekranın kendisi
2. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html` — **artık bağlayıcı değil**, yalnız ürünün hareket dili için bağlam
3. `docs/design-reference/Luera Mobil - Durumlar.html`
4. Cihazdan alınmış "Kasaya gönderildi" ekran görüntüsü

**Kutuya yazılacak cümle:**
> Personelin adisyonu kasaya gönderdiği anı tasarlıyoruz. Bugün düğme tek
> karede turuncudan yeşile atlıyor ve o kadar. **Bu tur hareket kısıtının
> dışında**: `react-native-reanimated` projeye kuruldu, yükseklik, renk,
> spring ve düzen geçişleri artık açık. Turun ikinci yarısı daha önemli:
> **geri alma.** Gönderilen adisyon bugün kumandayı kilitliyor ve geri dönüş
> yolu hiç çizilmemiş, oysa "kaş almayı yanlışlıkla ekledim" müşteri hâlâ
> karşındayken fark ediliyor. Bir de çevrimdışı: ağ yokken de düğme
> "gönderildi" diyor ama istek kuyrukta bekliyor — bu yalan da bu turda
> düzelecek.

**Effort: Medium.**

---

## Doğrulama

Tasarım döndüğünde ölçeceklerim:

- Önerilen her hareketin **kurulu paketlerle** yazılabildiği (reanimated evet, gesture-handler HAYIR)
- Yazılmış ekranların yeniden yazılmasının istenmediği
- Dokunma hedeflerinin 44 pt'nin ALTINA inmediği
- Turuncunun yalnız zaman ve eylemde, yeşilin yalnız tamamlanmışta kullanıldığı
- "Sıraya alındı"nın "gönderildi"nin kısık hâli OLMADIĞI
- Geri alma penceresinin istemci tarafında yaşayabildiği ya da bedelinin etiketlendiği
- `reduceMotion` hâlinde geri alma süresinin durmadığı
