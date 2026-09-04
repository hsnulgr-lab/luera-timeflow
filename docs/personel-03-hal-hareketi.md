# Personel 03 · Hâllerin karakteri ve hareketi

**Effort: High.**

Kart bitti. Ölçüsü, dolgusu, tipografisi ve yerleşimi **onaylandı ve
donduruldu**. Bu turun konusu tek şey: **dokuz hâlin birbirinden nasıl
ayrıştığı ve nasıl hareket ettiği.**

Bugün ekranda dokuz hâl var ama sekizi görsel olarak **aynı karta bakıyor**:
aynı dolgu, aynı yerleşim, aynı 6pt nokta, aynı 3pt hat — yalnız rengi ve
kelimesi değişiyor. Renk ve kelime doğru; ama bir hâlin *karakteri* yok.
"Kapıda bekleyen müşteri" ile "üç saat önce tahsil edilmiş iş" ekranda aynı
sıcaklıkta duruyor.

---

## 0 · DOKUNULMAZ — hiçbiri değişmiyor

Aşağıdakiler onaylanmış ölçülerdir. Bir öneri bunlardan birini değiştiriyorsa
o öneri geçersizdir; "biraz daha büyük olsa" yok.

| | değer |
|---|---|
| Kart yüksekliği | iki satır **71 pt** · üç satır **94 pt** |
| Kart dolgusu | koyu `#241E16` · açık `#FFFDFB` — **her hâlde AYNI** |
| Yarıçap | 20 pt |
| İç dolgu | 14 üst / 14 alt / 16 yan |
| Ad | 18 pt · ad 500, soyad 800 · satır 21 |
| Hizmet | 13,5 / 500 · satır 18 · üstten 4 |
| Durum satırı | 11,5 / 700 · CAPS · 0,06em · üstten 7 · yükseklik 16 |
| Durum eki | 12,5 / 500 |
| Süre (sağ üst) | 13 / 600 · Sayaç 15 / 800 |
| Durum noktası | 6 pt daire |
| Sağ kenar hattı | 3 pt · kart yüksekliğince |
| Saat rayı | 44 pt · karta 10 pt · kartlar arası 8 pt |
| Kart genişliği | 303 pt (393 pt ekranda) |

**Kart dolgusu her hâlde aynı kalır.** Hâller dolguyla değil; noktayla,
kelimeyle, sağ hatla ve **hareketle** ayrışır. Liste tek bir malzemeden
yapılmış gibi durmalı — hâller o malzemenin üstünde gezinen ışık gibi.

**Kartın içine yeni bir öğe girmez.** Rozet, ikon, çubuk, ikinci satır, buton,
avatar — yok. Var olan beş öğenin (ad · süre/sayaç · hizmet · durum satırı ·
sağ hat) davranışı tasarlanacak.

---

## 1 · VERİLMİŞ — SÜRÜYOR'un imzası

Süren randevunun kenarında **dönen bir ışık halkası** var: kartın 0,3 pt
dışında, sıcak eksende (`#FF5A1F → #D9A43B → #FF7A45 → #E8430F`), 5 saniyede
bir tur, kesintisiz.

Bu karar verilmiştir ve **değişmez**. Kalan sekiz hâl buna göre tasarlanacak:

- **İkinci bir dönen ışık olmayacak.** Halka SÜRÜYOR'un imzası; başka bir hâl
  aynı dili konuşursa ikisi de anlamını kaybeder.
- Diğer hâllerin hareketi halkadan **daha sessiz** olmalı. Ekranda hiyerarşi
  var: koltuktaki iş en yüksek sesle konuşur.

---

## 2 · Bugünkü hâller — değişmeyecek olan bilgi

Kelimeler ve renkler onaylandı. Tasarlanacak olan bunların **davranışı**.

| # | Hâl | Kelime | Renk | Ek | Sönüklük |
|---|---|---|---|---|---|
| 01 | Gelecek randevu | — | — | — | tam |
| 02 | Kapıda | `KAPIDA` | amber | `10 dk bekliyor` | tam |
| 03 | Sürüyor | `SÜRÜYOR` | nötr | `120 dk planlandı` | tam · **halka** |
| 04 | Uzadı | `UZADI` | kırmızı | `7 dk aştı` | tam |
| 05 | Gecikti | `GECİKTİ` | kırmızı | `12 dk` | tam |
| 06 | Adisyon gönderilmedi | `ADİSYON GÖNDERİLMEDİ` | amber | — | tam |
| 07 | Kasada | `KASADA` | yeşil | — | 1. kademe |
| 08 | Tahsil edildi | `TAHSİL EDİLDİ` | yeşil | — | 2. kademe |
| 09 | İptal | `İPTAL` | kırmızı | — | 2. kademe · ad üstü çizgi |

**Bilinen bir kusur, bu turda çözülecek:** sönükleşme merdiveni dolguya ve
metne uygulanıyor ama **vurgu rengine uygulanmıyor**. Ekran görüntüsünde
tahsil edilmiş işin yeşili, kapıda bekleyen müşterinin amberi kadar parlak.
Kapanmış işin işareti de sönmeli — yoksa göz taradığında "bitmiş iş" ile
"yapılacak iş" eşit güçte bağırıyor.

---

## 3 · Turun asıl sorusu: hangi hâl hareket eder, hangisi durur?

Bu bir "her şeye animasyon ekle" turu **değil**. Asıl karar hangi hâllerin
hareketi **hak ettiği**.

Üç hareket cinsi var, üçü farklı şey söyler:

**Sürekli hareket** — durmadan devam eder. "Bu şu anda oluyor" der. SÜRÜYOR'un
halkası bu. Ekranda kaç tane olabilir? Bir mi, iki mi?

**Nabız / birikme** — yavaş, tekrarlayan, ama sürekli değil. "Bu bekliyor ve
beklemesi uzuyor" diyebilir. KAPIDA'nın 10 dakikası 40 dakikaya çıkarken kart
bunu söylemeli mi, yoksa sayı yeter mi?

**Tek seferlik** — hâl değiştiğinde bir kez olur ve biter. "Az önce bir şey
oldu" der. Müşteri kapıya geldiğinde, işlem başladığında, adisyon
gönderildiğinde.

**Karar senin ve gerekçesini yaz.** Özellikle şu ikisi:

1. **Boş kartlar (01) hiç hareket etmeli mi?** Günün çoğu kart bu hâlde. Hiç
   hareket etmemek de bir tasarım kararıdır ve savunulabilir.
2. **GECİKTİ ve UZADI kötüleşen hâller.** 12 dakikalık gecikme ile 90
   dakikalık gecikme aynı mı görünmeli? Sayı büyüyor — kart başka bir şey
   yapmalı mı, yoksa sayının büyümesi yeterli mi?

---

## 4 · Tasarlanacak anlar

Hâllerin kendisi kadar **aralarındaki geçişler** de bu turun konusu.

**Hâl değişimi.** Kart yerinde duruyor, içeriği değişiyor:
`gelecek → kapıda` · `kapıda → sürüyor` · `sürüyor → uzadı` ·
`sürüyor → adisyon gönderilmedi` · `adisyon → kasada → tahsil edildi`.
Her geçişte üç şey ayrı ayrı söylenmeli: **ne çıkıyor, ne giriyor, ne yerinde
kalıyor.** Kart yüksekliği iki satırdan üç satıra çıkabiliyor — bu nasıl
kotarılır?

**Canlı sayaçlar.** SÜRÜYOR'un `70:20`'si her saniye, KAPIDA'nın `10 dk`'sı
her dakika değişiyor. Rakam değişimi göze çarpmalı mı, yoksa fark
edilmemeli mi? Saniye ile dakika farklı davranmalı mı?

**Ekran açılışı.** Personel telefonu vardiya boyunca onlarca kez cebinden
çıkarıp koyuyor. Liste her seferinde canlanmalı mı, yoksa **zaten oradaymış
gibi** mi durmalı? İkisinin de savunması var; birini seç.

**Şimdi çizgisinin geçmesi.** Turuncu çizgi gün boyunca aşağı iniyor ve bir
kartın üstünden altına geçiyor. O an bir şey oluyor mu?

**Yeni randevu.** Müdür gün içinde randevu ekleyebiliyor; listeye bir kart
düşüyor. Personel bunu kaçırmamalı ama elindeki işten de kopmamalı.

---

## 5 · İki tasarım ilkesi

**Hareket bilgi taşımaz, bilgiyi hızlandırır.** Hareket kapalıyken kartın
söylediği hiçbir şey kaybolmamalı — kelime, nokta, sayı ve hat her zaman
orada. Hareketi olan bir hâlin hareketsiz hâli de çizilmeli.

**Ekran çoğu zaman DURGUN.** Personel telefonu tezgâhın üstünde duruyor ve
göz ucuyla bakılıyor. Sürekli kıpırdayan bir liste, bakılmayı bırakılan bir
listedir. Az hareket, doğru yerde.

---

## 6 · Çıktı

**Koyu tema birincil.** Her hareket için: ne hareket ediyor, hangi değerden
hangi değere, ne kadar sürede, hangi hızlanma eğrisiyle, tekrarlıyor mu.

1. **Dokuz hâlin durgun hâli** — kartlar yan yana, sönükleşme vurgu rengine de
   uygulanmış hâliyle
2. **Hareketi olan hâller** — her biri kendi başına, hareket zaman çizelgesiyle
3. **Beş geçiş** — kapıda → sürüyor · sürüyor → uzadı · sürüyor → adisyon ·
   adisyon → kasada · gelecek → gecikti. Her birinde çıkan/giren/kalan ayrı
4. **Ekran açılışı** — listenin tamamı, seçtiğin davranışla
5. **Hareketsiz hâl** — 2, 3 ve 4'ün hareket kapalıyken görünüşü
6. **Ana kare** — beş kartlık liste, hareketler işaretlenmiş

Her karar için **bir cümlelik gerekçe**. Hareket etmemeye karar verdiğin
hâller için de gerekçe yaz — o da bir karar.

---

## 7 · Kutuya yazılacak cümle

> Personel "Bugün" kartının **dokuz hâlinin karakterini ve hareketini**
> tasarla. Kartın ölçüsü, dolgusu, tipografisi ve yerleşimi ONAYLANDI ve
> DEĞİŞMEZ — ekteki tabloda. Kart dolgusu her hâlde aynı kalır; hâller nokta,
> kelime, sağ kenar hattı ve HAREKET ile ayrışır. Kartın içine yeni öğe
> girmez. SÜRÜYOR'un dönen turuncu halkası VERİLMİŞTİR ve değişmez; diğer
> sekiz hâl onunla çakışmayacak, ondan daha sessiz olacak. Asıl karar: hangi
> hâl sürekli hareket eder, hangisi tek seferlik, hangisi hiç. Hareket bilgi
> taşımaz — kapalıyken kart hiçbir şey kaybetmemeli. Ekran çoğu zaman durgun.

---

## 8 · Ekler

1. Cihazdan alınmış güncel "Bugün" ekranı — **onaylanmış tasarım**
2. Kart listesinin yakın planı — kartların gerçek ölçüde görünüşü
3. `Luera Mobil - Personel 02 Sira Kartlari.html` — ölçü dökümü ve dokuz hâl
4. `docs/design-reference/Luera Mobil - Durumlar.html` — durum kelimeleri
5. Dönen halkanın videosu ya da tarifi: 0,3 pt, kartın dışında,
   `#FF5A1F → #D9A43B → #FF7A45 → #E8430F`, 5 sn/tur, kesintisiz
