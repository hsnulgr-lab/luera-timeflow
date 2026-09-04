# Personel 04 · İşlem kumandası

**Effort: High.**

Personel modunun **en çok kullanılan ekranı**. Bir randevunun tamamı burada
yaşıyor: müşteri gelir, işlem başlar, kalemler eklenir, işlem biter, adisyon
kasaya gider. Personel bu ekranı günde onlarca kez açıyor.

**Tek sayfa, üç evre.** Ekran değişmiyor — biçim değiştiriyor. Personel
"neredeydim" diye aramıyor.

---

## 0 · Dokunulmaz olan

Bu ekran yeni; ama içinde bulunduğu ürün onaylanmış durumda.

| | |
|---|---|
| "Bugün" listesi, sıra kartları, gün şeridi, alt sekme çubuğu | **değişmiyor** |
| Turuncu `#FF5A1F` | yalnız **ZAMAN ve EYLEM**. Durum rengi değil |
| Risk / gecikme | koyu `#E07272` · açık `#C94040` |
| Bekleme / dikkat | koyu `#D9A43B` · açık `#B87A00` |
| Tamam / bitti | koyu `#5FBF64` · açık `#2D8F32` |
| Zemin · yüzey | koyu `#120E08` / `#241E16` · açık `#F3ECE0` / `#FFFDFB` |
| Metin | koyu `#F3EDE3` · ikincil `%58` · üçüncül `%36` |

**Cam bu ekranda SERBEST.** Liste kartları düz kalmaya devam ediyor; burası
tek bir işe odaklanan tam sayfa bir kumanda paneli, iki yüzey iki farklı iş
yapıyor. Bir uyarı: elimizdeki cam gerçek bir sistem materyali ve **kapalı
olabilir** — kullanıcı "Saydamlığı Azalt"ı açtığında ya da eski bir cihazda
sessizce düz bir yüzeye dönüşüyor. Camın **arkasındaki** hiçbir şey okunmayı
cama borçlu olmamalı; cam bir katman, taşıyıcı değil.

---

## 1 · Ekranın kullanıcısı

Personel bu ekranı **iş yaparken** kullanıyor, bakarken değil. Dört fiziksel
gerçek tasarımın girdisi:

**Eller dolu.** Islak, boyalı, eldivenli. Hassas hedef ve iki elli jest
çalışmaz.

**Ekran MÜŞTERİNİN GÖZÜ ÖNÜNDE.** Telefon koltuğun yanında duruyor. Fiyat,
malzeme maliyeti, geçmiş not ve müşteri kartı burada **açıkça duramaz** —
ama personelin bir kısmına erişmesi gerekiyor. Bu turun en zor sorusu bu.

**Telefon cebe girip çıkıyor.** İşlem sürerken ekran onlarca kez kapanıp
açılıyor. Her açılışta aynı yerden devam etmeli.

**Bodrum kat, kötü sinyal.** Yazma istekleri düşerse veri kaybolmuyor: yerel
kuyruğa alınıp bağlantı gelince sırayla gönderiliyor. **Arayüz bunu
söylemeli** — bugün söylemiyor.

---

## 2 · Üç evre

| | Evre | Ne var |
|---|---|---|
| **A** | Başlamadan önce | Kim, ne, ne zaman, ne kadar sürecek · **kaydırarak başlat** · müşteriyi ara |
| **B** | İşlem sürüyor | Geçen süre sayacı · kalem ekleme · bekleme sayacı · not · **uzun basarak bitir** |
| **C** | Bitti, adisyon gönderilmedi | Kalemlerin özeti · toplam · **kasaya gönder** |

Evre **veriden** okunuyor, çağıran seçmiyor:
`arrived_at` boş → **A** · dolu ve `service_ended_at` boş → **B** ·
`service_ended_at` dolu → **C**.

---

## 3 · Kaydırarak başlat — turun asıl çıktısı

Referans: iPhone'un **slide to answer** çubuğu (ekli). İkinci referans grubu
aynı jestin cam bir kart içindeki çağdaş yorumu.

Apple'ın kaydırıcı hakkındaki kendi kılavuzları:
- <https://developer.apple.com/design/human-interface-guidelines/sliders>
- <https://developer.apple.com/documentation/swiftui/slider>
- <https://developer.apple.com/documentation/uikit/uislider>

**Dikkat: bunlar bir DEĞER kaydırıcısı anlatıyor, bir EYLEM kaydırıcısı
değil.** Ödünç alınacak olan görsel dil ve dokunma ölçüleri; davranış değil.
Bizimki bir değer seçmiyor, tek bir eşiği geçiyor.

Tasarlanacaklar:

**Dinginlik.** Çubuk boştayken ne diyor? iPhone'da metnin üstünden geçen bir
parıltı var. Bizde? Personel bu ekranı günde onlarca kez görecek — kırkıncı
seferde hâlâ davet ediyor mu, yoksa gürültü mü oluyor?

**Sürüklerken.** Tutamak parmağı takip ediyor. Arkada kalan yol ne oluyor?
Metin ne oluyor? Yarı yolda bırakıp geri çekilirse?

**Eşik ve varış.** Eşik nerede — %60 mı, %90 mı? Eşiği geçtiği an personel
bunu bırakmadan **önce** anlamalı. Varışta ne oluyor?

**Bırakma.** Eşiğin altında bırakılırsa çubuk başa döner. Bu geri dönüş
"olmadı" mı der, "yanlış bir şey yaptın" mı? İkincisi olmamalı.

**Kaydıramayan kullanıcı.** Ekran okuyucu kullanan biri bu çubuğu
kaydıramaz. Kaydırma **tek yol olamaz** — ikinci yol nedir ve normal
kullanıcıya görünmeden nasıl var olur?

**Ne yazıyor?** "Kaydır ve başlat" mı, müşterinin adını mı söylüyor? Ekranı
müşteri de görüyor.

### Kaydırma bitince ne oluyor

Sunucuya `visit.start` gidiyor. Bu **geri alınamaz** ve üç sonucu var:

| Sonuç | Ne oldu |
|---|---|
| Gitti | İşlem başladı, ekran B evresine geçti |
| **Sinyal yok** | İstek yerel kuyruğa alındı, bağlantı gelince gidecek. İşlem personel için BAŞLADI |
| Sunucu reddetti | Randevu başkası tarafından kapatılmış olabilir |

Ortadaki hâl bu turun **gizli asıl konusu**: kuyruğa alınmış bir başlangıç
ekranda nasıl görünüyor? Personel işine devam edebilmeli ama "gitti" yalanını
da duymamalı. **Sahte onay yok.**

**Ekranda kaç onay var: BİR.** Kaydırmadan sonra "emin misiniz?" penceresi
çıkmaz — kaydırmanın kendisi zaten onaydır.

---

## 4 · Uzun basarak bitir

İşlem sürerken kaydırma çubuğu **küçülüp yuvarlak bir düğmeye dönüşüyor** —
iPhone'un konuşma sırasındaki kırmızı END düğmesi gibi (ekli).

Bitirme **uzun bas**: düğmeye basılı tutulur, çevresinde bir halka dolar, halka
tamamlandığında işlem biter. Bırakılırsa halka geri boşalır ve hiçbir şey
olmaz.

Tasarlanacaklar: halka ne kadar sürede doluyor (**karar senin, gerekçelendir**)
· basılı tutarken düğme ne yapıyor · dolma iptal edilince nasıl geri gidiyor ·
tamamlandığı an nasıl belli oluyor · ekran okuyucu karşılığı ne.

**Çubuk → düğme dönüşümü** ayrıca tasarlanacak: aynı nesne mi küçülüyor, yoksa
biri gidip öteki mi geliyor? Personel bu dönüşümü günde onlarca kez görecek.

---

## 5 · Adisyon — kalem kalem

İşlem sürerken kalem ekleniyor. **Üç cins var ve üçü aynı şey değil:**

| Cins | Ne | Örnek |
|---|---|---|
| `extra` | Sonradan eklenen **hizmet** | "Kaş alma da yapalım" |
| `product` | Müşteriye **satılan ürün** | Şampuan, saç bakım yağı |
| `material` | İşlemde **kullanılan malzeme** | Boya, oksidan, folyo |

Katalog ucu hazır: hizmetler (ad, süre, fiyat, renk) ve ürünler (ad, fiyat,
birim, `retail`/`consumable`, stok takibi var mı) tek turda geliyor.

**Malzeme stoktan düşüyor** — `visit.finish` çalıştığında. Yani "boya ekle"
sadece bir adisyon satırı değil, bir stok hareketi.

**Cevaplanacak soru:** malzeme kaleminin fiyatı müşteriye görünmeli mi?
Malzeme çoğu salonda maliyettir, faturaya yazılmaz — ama bazı salonlar yazar.
Ekranı müşteri görüyor. Üç cins aynı listede mi duruyor, ayrı mı?

**Adet.** Kalemlerin `qty` alanı var. İki şampuan nasıl ekleniyor — iki kez mi
dokunuluyor, yoksa adet mi seçiliyor?

**Silme.** Yanlış eklenen kalem nasıl kaldırılıyor? Eller ıslakken kaydırarak
silmek tehlikeli.

**Kalem eklemek nerede yaşıyor:** sayfada mı, alt sayfada mı? Katalog uzun
olabilir — arama gerekiyor mu?

---

## 6 · Bekleme sayacı

Kuaförün gerçek işi bu: boya sürülür, **30–35 dakika işler**, sonra yıkanır.
Personel o sürede başka bir şey yapar ve zamanı kaçırmamalıdır.

Bu, işlem sayacından **ayrı ve ters yönde** bir sayaç: biri geçen süreyi
sayıyor, öteki kalan süreyi. İkisi aynı ekranda ve **karışmamalı**.

Tasarlanacaklar: süre nasıl kuruluyor (hazır süreler mi, serbest mi) · sayarken
nerede duruyor · bitince ne oluyor (ekran kapalıysa?) · birden fazla olabilir
mi · durdurulabilir mi.

**Bu sayaç sunucuya hiç gitmiyor** — telefonda yaşıyor. Yani uygulama
kapanırsa kaybolur. Bu bir tasarım kısıtı, personele söylenmeli mi?

---

## 7 · Not

Personel işlem sırasında not bırakıyor: *"7.3 kumral, kökte yarım ton koyu."*
Bir sonraki ziyarette bu notun değeri çok yüksek.

> **SUNUCU BORCU:** bugün not yazacak bir uç YOK. `visit.items` yalnız kalem
> yazıyor. Bu tasarım uygulanmadan önce `visit.note` yazılacak. Tasarımda
> çizilebilir; ölü kontrol olarak DEĞİL, bekleyen bir iş olarak.

Not **müşterinin göremeyeceği** tek içerik. Nerede yazılıyor, nasıl
gizleniyor?

---

## 8 · Müşteriyi ara

`customer_phone` geliyor. Yalnız **A evresinde** anlamlı: müşteri gecikmişse
tek dokunuşla aranır. İşlem başladıktan sonra müşteri zaten koltukta.

Numara **ekranda yazmaz** — müşteri görüyor.

---

## 9 · Önce / sonra fotoğrafı

Güzellik salonlarında yaygın ve satış değeri yüksek.

> **BÜYÜK BORÇ:** depolama, KVKK rızası ve ayrı bir yükleme ucu gerekiyor.
> Hiçbiri yok. Tasarımda **yeri** ayrılsın ve nasıl çalışacağı çizilsin; ama
> bunun bu ekranın ilk sürümüne yetişmeyeceğini bilerek tasarla — kalan her
> şey onsuz da tam çalışmalı.

Rıza nasıl alınıyor, fotoğraf nerede duruyor, müşteri görebiliyor mu?

---

## 10 · Ekranın taşıyabileceği veri

Bu liste **tam**. Burada olmayan hiçbir alanı ekrana koyma.

| Alan | Not |
|---|---|
| `customer_name` | |
| `customer_phone` | yalnız varlığı; numara yazılmaz |
| `service` · `service_color` | serbest metin, uzun olabilir |
| `start_time` · `end_time` | planlanan süre buradan |
| `status` | `pending` · `confirmed` · `cancelled` · `completed` |
| `customer_arrived_at` | müşteri kapıda |
| `arrived_at` | **işlem başladı** — adı yanıltıcı, geliş değil başlangıç |
| `service_ended_at` | işlem bitti |
| `adisyon_items[]` | `{ name, price, kind, qty }` |
| `is_paid` | kasada tahsil edildi |
| `notes` | randevunun mevcut notu |
| katalog | hizmetler + ürünler |
| müşteri kartı | geçmiş ziyaret, paket, kural — **ayrı uç, yetki ister** |

**Yazma uçları:** `visit.start` · `visit.items` · `visit.finish`. Üçü de
geri alınamaz, üçü de sinyal yoksa kuyruğa düşer, üçü de idempotent.

---

## 11 · Ekrana GİRMEYECEKLER

- **İkinci onay penceresi.** Kaydırma ve uzun bas zaten onaydır
- **Sahte onay.** Kuyruğa düşen bir istek "gönderildi" demez
- **Ölü kontrol.** Arkasında uç olmayan hiçbir düğme çizilmez (not ve
  fotoğraf ayrı işaretlendi)
- Müşterinin okumaması gereken hiçbir şey: bakiye, alerji, geçmiş gelmeme,
  salon notu
- Telefon numarası
- Turuncuyu durum rengi olarak kullanmak
- Krom: araç çubuğu, filtre satırı, sekme grubu

---

## 12 · Çıktı

**Koyu tema birincil, açık tema ikincil.** Her ölçü ve süre yazılı.

1. **A evresi** — başlamadan önce, kaydırma çubuğu dingin hâlde
2. **Kaydırmanın dört anı** — dingin · sürüklenirken · eşik geçildi · varış
3. **B evresi** — işlem sürüyor, sayaç, kalemler eklenmiş, bitir düğmesi
4. **Uzun basmanın üç anı** — dingin · halka dolarken · tamamlandı
5. **Çubuk → düğme dönüşümü**
6. **Kalem ekleme** — katalogdan seçme, üç cins, adet, silme
7. **Bekleme sayacı** — kurma · sayarken · bitti
8. **C evresi** — adisyon özeti ve kasaya gönderme
9. **Kuyruğa alınmış hâl** — sinyal yokken A ve B
10. Not · ara · fotoğraf
11. **375 × 667** sıkışması
12. Cam kapalıyken (Saydamlığı Azalt) ekranın hâli

Her karar için **bir cümlelik gerekçe**.

---

## 13 · Kutuya yazılacak cümle

> Personel modunun **işlem kumandası**: bir randevunun tamamı tek sayfada, üç
> evre halinde — başlamadan önce, işlem sürerken, bittikten sonra. Evre
> VERİDEN okunur. Birincil eylem **kaydırarak başlat** (iPhone slide to
> answer), bitirme **uzun basarak** (çubuk küçülüp yuvarlak düğmeye dönüşür,
> çevresinde halka dolar). İşlem sürerken adisyona kalem eklenir: ek hizmet,
> satılan ürün, kullanılan malzeme — üçü aynı şey değil ve malzeme stoktan
> düşer. Ayrıca boya bekleme sayacı, not ve müşteriyi arama var. Ekran
> MÜŞTERİNİN GÖZÜ ÖNÜNDE kullanılıyor ve personelin elleri dolu. Yazma
> istekleri sinyal yokken kuyruğa düşer — arayüz bunu söylemeli, sahte onay
> vermemeli. Ekranda kaç onay var: BİR. Ekli veri listesinde olmayan hiçbir
> alanı koyma.

---

## 14 · Ekler

1. iPhone **slide to answer** çubuğu — birincil referans
2. iPhone konuşma ekranı **END** düğmesi — bitirmenin referansı
3. Cam kart + kaydırıcı referansları (5 görsel)
4. Cihazdan alınmış **"Bugün"** ekranı — bu ekranın açıldığı yer
5. `Luera Mobil - Personel 02 Sira Kartlari.html` — kart ölçüleri ve dokuz hâl
6. `Luera Mobil - Personel 03 Hal Karakteri.html` — hâllerin hareketi
7. `docs/design-reference/Luera Mobil - Kumanda.html` — bugünkü işlem ekranı,
   **değiştirilen tasarım**
8. `docs/design-reference/Luera Mobil - Durumlar.html` — durum kelimeleri
