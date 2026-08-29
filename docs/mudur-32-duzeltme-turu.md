# Müdür 32 · Düzeltme turu — balonun çapalanması ve sol sütunun hizası

Mevcut dosya: `Luera Mobil - Mudur 32 Eylem Ailesi v2.html`
**Sıfırdan çizme — bu dosyayı düzelt.** Kartların ölçüleri, renkleri, eylem
mantığı ve durum sıralaması **doğru ve korunacak**; on yedi karenin yükseklik
iddiasının hepsi ölçüldü, tek sapma yok. İki şey yanlış.

---

## 1 · Balon işaret ettiği düğmeye değmiyor — asıl iş bu

Ölçüm (tarayıcıda, `.balwrap` köküne göre):

| | y | x merkez |
|---|---|---|
| Ok ucunun sivri noktası | **−2** | 287 |
| `Ulaş` düğmesinin üst kenarı | **60** | 298 |

Balon `bottom: calc(100% + 8px)` ile **kartın tepesine** yapışmış. Ama
tetikleyici kartın **sağ altında**. Ok, düğmeden **62 pt yukarıda ve 11 pt
solda** duruyor ve kartın boş bir yerini gösteriyor.

Sonuç: balon düğmeden çıkmış gibi değil, kartın üstünde belirmiş gibi duruyor.
Brief'in §7.1'i tam bunun tersini istiyordu: **"büyüme noktası tetikleyicidir."**

**Balon `Ulaş` düğmesine çapalanacak.** Ok ucu düğmenin kenarına **değecek**.
Balonun kartın bir kısmını örtmesi normaldir ve kabul edilir — hiçbir şeye
değmeyen bir ok kabul edilmez.

Şunları çöz ve çiz:

- **Yön.** Balon düğmenin üstünde mi açılıyor, altında mı? Üstte açılırsa kartın
  gövdesini örtüyor; altta açılırsa akıştaki bir sonraki satırı örtüyor.
  Hangisi ve neden? İkisi de gerekiyorsa **kural** ver (örn. kart ekranın alt
  yarısındaysa yukarı).
- **Hizalama.** Ok ucunun yatay merkezi `Ulaş`ın merkeziyle **çakışacak**.
  Bugün 11 pt kaçık.
- **Kenar durumu.** Balon 208 pt; düğme sağda. Ekranın sağ kenarına taşmaması
  için balon sağdan hizalı kalıyor ama ok kayıyor — okun kayabileceği **sınır**
  nedir, sınıra dayanınca ne oluyor?
- **Akışın ilk ve son satırı.** Listenin en üstündeki kartta yukarı açılamaz,
  en altındakinde aşağı. Her ikisini de çiz.
- **Büyüme noktası.** `transformOrigin` artık gerçekten düğmenin köşesinde
  olacak — balon oradan büyüyecek. Bugünkü konumla bu zaten imkânsızdı.

## 2 · Kart duruyor ama içi 7,5 pt zıplıyor — talimat, soru değil

`.pnl .in{align-items:center}` sol sütunu **dikeyde ortalıyor**. Sol sütun 3
satırken 70 pt, kayıt satırı gelince 85 pt. Ölçülen sonuç:

| Hâl | Etiket y | Rakam y |
|---|---|---|
| A·1 · kayıt yok | 24 | **39** |
| A·3 · "Arandı · 2 dk" | 16,5 | **31,5** |
| A·5 · kayıt bayatladı | 24 | **39** |

Kart 118'de duruyor ama **kahraman rakam 7,5 pt yukarı kayıp geri iniyor** —
bir randevunun ömründe iki kez. Bu bir yerleşim değişimi; animasyonlanamaz,
sert kesme olur. A·5'e yazdığın "kart 118 — tek piksel oynamadı" notu kart için
doğru, **içi için yanlış**.

**Düzeltme:** sol sütun ortalanmayacak, **üste yaslanacak**. Etiket ve rakam
14'te çakılı kalır; kayıt satırı boştaki 20 pt'ye **aşağı doğru** büyür. §2.2'de
"boştaki 20 pt'ye giriyor" derken kastedilen buydu.

Bunu **A, B, C, D, E'nin hepsinde** aynı şekilde uygula — sol sütunun satır
sayısı değişebilen her kartta. Değişmeyenlerde görünür bir fark olmaz, ama
kural tek olur.

## 3 · Üst üste duran iki hap aynı genişlikte olacak

Ölçüm (A · 1, kart köküne göre):

| | genişlik | yükseklik | sağ boşluk |
|---|---|---|---|
| `Geldi` | **76,3** | 44 | 14 |
| `Ulaş` | **85,7** | 44 | 14 |

Yükseklikler doğru. Ama sütun sağa yaslı olduğu için **9,4 pt'lik genişlik
farkı tamamen sol kenara biniyor** ve iki hapın sol kenarları hizasız duruyor.

Bu, ikinci yuva **hayalet metinden kenarlıklı hapa** dönünce doğan yeni bir
sorun: eski `Gelmedi` bir kutu değildi, kenarı yoktu, genişlik farkı
görünmüyordu. `Ulaş` bir kutu — ve üst üste duran iki kutunun kenarları
hizalanmak zorunda.

**Düzeltme:** sütun sağa yaslamak yerine **gerecek** (`align-items:stretch`),
her iki hap sütunun en genişine uyacak, metinler ortalanacak. Denendi: ikisi de
**85,7** oluyor, sol kenarlar 255,3'te çakışıyor, **kart yine 118**. Bedeli yok.

Aynı kural B · 2'de de geçerli (`Ulaş` hap + `Yeniden randevu` hayalet) — orada
ikincisi hayalet olduğu için görünür bir kenar yok, ama kural tek olsun.

## 4 · Balonun satırları kaba — ikon eklenecek, ama sağa

Bugün balon 208 pt geniş, satırlar sola yaslı 15,5 pt metin. `Ara` kısa bir
kelime olduğu için satırın **sağ tarafı tamamen boş** kalıyor ve kutu kaba
duruyor.

**Düzeltme: kelime solda, ikon sağda** — iOS'un kendi menü dili. Satır iki
uçtan da tutulur, boşluk ortada kalır. İkonu sola koymak sağ boşluğu çözmez.

- `Ara` → telefon ikonu · `WhatsApp'tan yaz` → mesaj ikonu.
- **İkon kelimenin yerini ALMAZ.** Ürünün kuralı: "renk tek başına anlam
  taşımaz, kelime her zaman yazılı" — ikon da öyle. Yalnız ikonlu, kelimesiz
  bir satır olmayacak. Hedef kitle 40–55, ayakta, tek elle.
- Balonun **genişliğini içerikten türet**: bugün 208 sabit ve kısa satır
  içinde yüzüyor. En uzun satır ne kadar yer istiyorsa balon o kadar olsun,
  bir alt ve üst sınırla.
- Satır yüksekliği bugün 48/49 — ikon geldikten sonra bu oran hâlâ doğru mu,
  ölçüp söyle.

### Reddedilen iki fikir — tekrar önerme

**Basılı tutarak onaylama.** Uzun basış **görünmez bir kontroldür** ("ölü
kontrol yok" kuralının kardeşi): kullanıcı basar, bir şey olmaz, ne kadar
tutacağını bilemez. Çalışması için dolan bir halka gerekir — o da
çizgi/geometri animasyonu, yani hareket sözleşmesinin dışında ve `reanimated`
kurulu değil. **B/C sınıfı bedel.**

Korunması gereken bir şey olduğu doğru (bkz. §5 — `Yaz` artık gerçekten mesaj
gönderiyor), ama çaresi uzun basış değil: bu üründe zaten **5 saniyelik geri
alma penceresi** var ve senin kendi D·3 karende çizili ("mesaj 5 sn sonra
gidecek"). `Yaz` da onu kullanacak. Aynı korumayı yeni bir etkileşim icat
etmeden veriyor.

**Seçenek sayısını artırma.** Elimizde gerçekten iki kanal var: `tel:` ve
`wa.me`. SMS yok, otomatik arama yok. Üçüncü satır uydurmak, briefin ilk
sayfasında yasaklanan şeydir. **Menü zenginlik için şişirilmez.** (Karttan
çıkan `Gelmedi` dürüst bir aday ama `Ulaş` kelimesi onu kapsamıyor — girmiyor.)

## 5 · KANAL DEĞİŞTİ — `Yaz` artık otomasyon, müdür yazmıyor

**Ana brief'in §3'ü bu noktada güncellendi.** `Yaz`, müdürün kendi WhatsApp'ını
açan bir `wa.me` bağlantısı DEĞİL. Mesaj **salonun numarasından**, sunucudaki
tek gönderim kapısından, **hazır metinle** gidiyor. Müdür hiçbir şey yazmıyor
ve uygulamadan çıkmıyor.

Bunun üç sonucu var, üçü de tasarımı değiştiriyor:

**1 · Kart artık "gönderildi" DİYEBİLİR.** Ana brief'te "sahte onay yok, uygulama
dışarı çıkıyor, teslimatı göremeyiz" yazıyordu — o gerekçe bu satır için artık
geçersiz. Sunucu gerçek bir sonuç döndürüyor. Damga `Yazıldı · 1 dk` yerine
gerçekten gönderildiğini söyleyebilir. Kelimeyi sen seç, ama artık **daha
güçlü** bir şey söyleme hakkın var.

**2 · İki satır artık aynı cinsten değil.** `Ara` telefonu açar — uygulamadan
çıkılır, sonucu bilinmez, damga yalnız *müdürün ne yaptığını* söyler. `Yaz`
gönderir — uygulamada kalınır, sonucu bilinir. **Aynı balonda iki farklı
davranış.** Bunu gizleme; satırların ikon ya da mikro-metniyle ayırt edilebilir
olmalı. (Örn. `Ara` satırında dışarı-çıkış işareti.)

**3 · Gönderim başarısız olabilir ve BU HÂLLER ÇİZİLMELİ.** Sunucunun gerçekten
döndürdüğü sonuçlar şunlar — uydurma değil, `sendWA`'nın tanımlı çıktıları:

| Sonuç | Ne demek | Müdür ne yapabilir |
|---|---|---|
| `ok` | Gitti | — |
| `not_connected` | Salonun WhatsApp'ı bağlı değil | Ayarlar → WhatsApp'a gidebilir |
| `opt_out` | Müşteri mesaj istemiyor | Hiçbir şey — `Ara` kalır |
| `invalid_phone` | Numara yazılabilir değil | Müşteri kartından düzeltebilir |
| `failed` / kuyruk | Bağlantı sorunlu, kuyruğa alındı | Bekler |

Kota bu satır için **işlemiyor** (müdürün elle tetiklediği mesajlar kota dışı),
o yüzden kota hâli çizilmeyecek.

Cevapla:

- **Salonun WhatsApp'ı bağlı değilken satır ne oluyor?** "Ölü kontrol yok"
  kuralı düğmeyi silmeyi söyler; ama burada gidilecek gerçek bir yer var
  (Ayarlar → WhatsApp) ve müdürün **sebebi bilmesi** gerekiyor. Silmek mi,
  kalıp açıklamak mı? Gerekçesiyle karar ver.
- **Müşteri opt-out ise?** Bu düzeltilebilir bir şey değil. Satır çizilmeli mi?
- **Başarısız gönderim kartta nasıl görünüyor?** Damga "gönderildi" diyemez;
  ne der, ve tekrar denenebilir mi?
- **5 saniyelik geri alma penceresi** `Yaz` için de geçerli olacak (§4). Kart o
  beş saniyede ne gösteriyor — D·3'teki kalıbın aynısı mı?

Metin **şablondur**, müdür yazmaz: kısa, tek cümle, salon adı ve saat. Metnin
kendisini de öner.

## 6 · Durum çizgisi kartın köşesinden taşıyor

Sol kenardaki durum çizgisi (`.stripe` — amber "süre aşımı", kırmızı "iptal" /
"gecikti") kartın yuvarlak köşesinin **dışına taşıyor**. Üç karede de görünüyor.

Sebep iki hatanın üst üste binmesi:

```css
.pnl{border-radius:18px; position:relative}           /* overflow YOK */
.pnl .stripe{width:4px; border-radius:18px 0 0 18px}  /* 4 px'e 18 px yarıçap */
```

Kart kırpmıyor, çizgi de kendi köşesini kendisi yuvarlamaya çalışıyor. 4 px
genişliğinde bir öğeye 18 px yarıçap verilince tarayıcı onu orantılı olarak
eziyor ve ortaya çıkan yay **kartın kendi yayıyla çakışmıyor** — çizgi kartın
siluetinin dışında kalıyor.

**Düzeltme — uygulama bunu zaten çözmüş, aynısı yapılacak:**

- `.pnl` **kırpacak**: `overflow:hidden`.
- Çizginin **yarıçapı hiç olmayacak**: düz dikdörtgen. Köşeyi kartın kendi
  kırpması üretir.

Uygulamanın kodundaki not birebir bu:

> *Gecikme çizgisi ayrı katmanda, panelin içinde kırpılıyor.
> `borderLeftWidth` + `borderRadius` iOS'ta köşeleri bozuyor.*

Dikkat: `overflow:hidden` balonu da kırpar. Balon **kartın dışında** yaşadığı
için `.balwrap` katmanında kalmalı, `.pnl`'in içinde değil — §1'i çözerken
bunu birlikte düşün.

Ayrıca çizgi varken sol dolgunun 14 → 10'a düşürülmesi (`.pnl.stp .in`) doğru
ve korunacak: çizgi + dolgu toplamı sabit 14 kalıyor, metin yerinden oynamıyor.

## 7 · Değiştirilmeyecekler

- Kart yükseklikleri (94 · 96 · 118) — hepsi doğru.
- Eylem mantığı, durum sıralaması, `Ulaş` kelimesi, balon içeriği.
- Renkler, tipografi, damga davranışı.
- `Ulaş`ın A'da 44, B'de 40/22 olması — ağırlık önceliğe göre değişiyor, doğru.

## 8 · Çıktı

Düzeltilmiş dosya + balonun **yön ve kenar kurallarını** gösteren kareler
(yukarı açılan · aşağı açılan · sağ kenara dayanmış · listenin ilk satırı ·
listenin son satırı), koyu ve açık temada, ölçüleri yazılı.
