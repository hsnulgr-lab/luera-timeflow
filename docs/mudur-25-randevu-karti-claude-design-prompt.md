# Müdür 25 · Randevu kartı, düzenleme ve taşıma sonucu — Claude Design promptu

Ekler: 3 ekran görüntüsü (mevcut hâl — randevu detayı bilgisiz, taşıma sonucu, randevu
detayı müşteri kartlı) + `docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi
Kartlari.html` (kart ailesinin dili).

---

**Müdür 25 · Randevu kartı — açılan sayfa, düzenleme ve taşıma sonucu**

Luera TimeFlow'un müdür mobil uygulamasında bir randevuya dokununca açılan sayfayı ve ondan
dallanan üç küçük ekranı yeniden tasarla. Ekteki üç görüntü **mevcut hâl** — düzeltilecek
olan bu; kopyalanacak olan değil.

## Bağlam — bu sayfa ne işe yarıyor

Salon müdürü gün boyunca takvimi, akışı ve personelin gününü tarıyor. Bir randevuya
dokunduğunda tek bir soru soruyor: **"bu randevuya ne olacak?"** Cevap dört şeyden biri:

- müşteri geldi / gelmedi işaretle
- saati, personeli, hizmeti değiştir ya da not düş
- iptal et veya sil
- müşterinin kim olduğuna bak

Yani bu bir "ayrıntı sayfası" değil, bir **karar sayfası**. Bugünkü hâli iOS Ayarlar'a
benziyor: dört tane birbirinin aynı gri satır, altında iki kırmızı metin. Hangi satırın
günde otuz kez, hangisinin ayda bir basıldığı anlaşılmıyor.

## Mevcut hâlin teşhisi — tasarımın çözmesi gerekenler

1. **Randevunun durumu ekranın en küçük şeyi.** "Müşteri geldi." 14.5 punto gri bir cümle
   olarak, başlıkla liste arasında sıkışmış duruyor. Oysa müdürün ilk bakışta okuması
   gereken tam olarak bu: bekliyor mu, işlemde mi, bitti mi, iptal mi.
2. **Dört değiştirme satırı eşit ağırlıkta** ve hepsinin sağında chevron var; hepsi aynı
   sözü veriyor. Gerçekte "saati değiştir" ile "notu düzenle" aynı sıklıkta ve aynı
   sonuçta işler değil.
3. **İki anatomi var, biri tasarlanmamış.** Müşterinin geçmişi biliniyorsa araya krem bir
   kart giriyor (3. görüntü); bilinmiyorsa o kart hiç çizilmiyor ve sayfa boşalıyor
   (1. görüntü). İki hâl de tasarlanmalı; ikincisi "eksik" değil, kendi hâli olmalı.
4. **Gün yazmıyor.** Başlıkta saat ve süre var, tarih yok. Tarih yalnız "Saati değiştir"
   satırının içinde, küçük gri metinde. Müdür başka güne bakarken bunu kaçırıyor.
5. **İptal onaysız, silme onaylı.** Silmenin diyaloğu var; iptalin hiçbir şeyi yok.
   İkisi de sonuçlu iş; ikisi de kendi onayını hak ediyor — ama aynı ağırlıkta değil.
6. **Uyarı metni ekranın en uzun cümlesi.** "Silinen randevu geri gelmez…" iki satır ve
   hiç kimse basmayacağı bir düğmenin altında duruyor.

## Tasarlanacak ekranlar

### A · Randevu kartı — ana hâl (`A1` geçmişli, `A2` geçmişsiz)

Tek sayfa, iki anatomi.

Taşıması gerekenler, önem sırasına göre:

- **Müşterinin adı** — ilk ad ince, soyadı kalın (mevcut kural, korunacak).
- **Randevunun kimliği**: gün + saat + süre + hizmet + personel. Bugün üç rozet hâlinde;
  daha iyi bir düzen öneriyorsan öner ve gerekçelendir. **Gün mutlaka görünmeli.**
- **Randevunun durumu** — beş hâlden biri, ekranda hak ettiği ağırlıkta:
  `Bekliyor` (henüz gelmedi) · `Geldi · bekliyor` · `İşlem sürüyor` · `Tamamlandı` ·
  `İptal edildi`. Renk tek başına anlam taşımaz; kelime her zaman yazılı.
- **Geldi / Gelmedi** — yalnız uygun durumlarda görünen iki büyük buton (bugün 66 pt).
  Gelmiş, bitmiş ya da iptal edilmiş randevuda bu soru sorulmaz.
- **Müşteri kartı** (`A1`): kaçıncı ziyaret ya da paket ilerlemesi, son ziyaret, bakiye,
  maskeli telefon, kartı açan ok. Krem gömülü panel — sayfanın tersi düzlem.
- **`A2`**: müşteri hakkında hiçbir şey bilinmiyor. Krem kartın yerine ne gelir? Boşluk
  bırakmak da bir cevap olabilir ama "yeni müşteri" bir bilgidir; onu göster.
- **Değiştir**: saat · personel · hizmet · not. Dördü de o anki değeri gösteriyor
  (`Cumartesi 09:40`, `Deniz`, `Saç boyama · ₺2.400`, `Not yok`). **Bu dördünün
  eşit ağırlıkta olmaması gerektiğini düşünüyorum; sen nasıl ayırdığını göster.**
- **İptal et** ve **Sil** — en altta, sessiz, birbirinden ayrı.

### B · Hizmeti değiştir

Bugün hiç yok. Küçük bir seçim sheet'i: hizmet listesi, her satırda ad · süre · ücret,
şu anki seçili. Seçince randevunun **süresi de değişir** — 45 dakikalık bakım 90 dakikalık
boyaya dönerse blok uzar ve sonraki randevuyla çakışabilir. **Bu çakışmayı seçim anında,
seçmeden önce göster.** Uygulamada zaten çakışma dili var: `Deniz · 13:00–14:30`.

### C · Notu düzenle

Bugün hiç yok. Tek alanlı bir yazı sheet'i. Not müşteriye değil salona ait
("saç boyası alerjisi", "otoparkta bekliyor"). Klavye açıkken kaydet düğmesi nerede
duruyor, boş nota ne oluyor, karakter sınırı var mı — hepsini tanımla.

### D · İptal onayı

Silmenin onay diyaloğu var, iptalin yok. İptal **geri alınabilir** bir iş: randevu
takvimde kalır, "iptal edildi" diye işaretlenir. Silme geri alınamaz. Bu iki onay
**birbirinin aynısı olmamalı** — biri sakin bir doğrulama, öteki bir duraksatma.

İptal onayının söylemesi gereken doğru cümle şu ve **değiştirilemez**:
*"Randevu takvimde kalır, 'iptal edildi' diye işaretlenir. Müşteriye otomatik haber
gitmez, siz arayın."* — Uygulama gerçekten mesaj atmıyor; bunu yazmamak müdürün müşteriyi
kapıda bırakmasına yol açıyordu.

### E · Taşıma sonucu (2. görüntünün yerine)

Randevu taşındıktan **sonra** alttan gelen sheet. Bugünkü hâlinin iki hatası var:

- Tek düğmesi **"Evet, yaz"** ve ne yazacağı belli değil. Kaldırılıyor: mobilde müşteriye
  otomatik mesaj atacak bir kanal **yok**, dolayısıyla bir mesaj vaadi yalan olur.
- **Geri al yok.** Oysa bu sheet'in açıldığı saniyede en olası ihtiyaç bu: müdür yanlış
  sütuna ya da yanlış saate bıraktı ve hemen anlıyor.

Yeni içerik:

- Olan biteni **hareket olarak** göster: `12:00 · Selin` → `13:30 · Selin`. Bugün yalnız
  yeni saat büyük yazılı, eski saat altında küçük bir rozette; taşıma bir **değişim** ve
  ekranda değişim gibi okunmuyor. Aynı harekette personel de değişmiş olabilir.
- **Geri al** — belirgin, sheet açık kaldığı sürece geçerli.
- **Müşteriyi ara** — telefon zaten kayıtlı; telefon uygulamasını açar. Uygulamanın
  bugün gerçekten yapabildiği tek bildirme yolu bu.
- **Tamam** / kapat.
- Sheet **kendiliğinden kapanmalı mı?** Görüşünü yaz. Geri al'ın bir ömrü olacaksa
  o ömrü görsel olarak nasıl gösterdiğini de göster (sayaç halkası, sönen çubuk vb.).

Ayrıca: taşıma **çakışmaya düşmez** (geçersiz hedef zaten bırakılamıyor), ama taşınan
randevu **geçmiş bir saate** düşebilir. O hâli de düşün.

## Sözlük — ürünün mevcut kelimeleri, DEĞİŞTİRME

`Geldi` · `Gelmedi` · `Geldi · bekliyor` · `Geri al` · `Saati değiştir` ·
`Personeli değiştir` · `Hizmeti değiştir` · `Notu düzenle` · `Randevuyu iptal et` ·
`Randevuyu sil` · `Atanmamış` · `Not yok` · `İlk ziyaret` · `Yeni müşteri` ·
`Bakiye ₺0` · `taşındı` · çakışma biçimi `Deniz · 13:00–14:30`

Yeni kelime gerekiyorsa üret, ama bunların üstüne yazma.

## Çerçeve — uygulamanın gerçek ölçüleri

- Sayfa kenar boşluğu `18`; blok arası `14`; başlık ile rozetler arası `8`.
- Müşteri adı `28px`; ilk ad `500` ağırlık ve ikincil mürekkep, soyadı `800` ve tam
  mürekkep; tracking `-.03em` / `-.035em`.
- Rozet: `h32 · padX12 · r10 · 13px/600`, ikon `15`, avatar `20` (`1.5` halka, `9px`
  baş harfler), rozetler arası `8`.
- Gömülü krem kart: `padding 14 · radius 18 · gap 12` (uygulamadaki bütün kart
  ailesiyle aynı çerçeve). İçinde rakam jetonu `42` daire, rakam `21px/800`, ek
  `13.5px/700` `.42` opaklık; sağdaki yuvarlak ok `36` (ikon `16`); alt rozetler
  `h36 · padX13 · r14 · 13px/700`.
- Geldi/Gelmedi butonları `h66`, aralarında `10`.
- Değiştir satırları: ikon `23`, chevron `19`, satır yüksekliği ~`62`, ayırıcı `1px`.
- Yıkıcı bölge: üstten `22`, alttan `30`, satır arası `10`, ikon `20`, metin `16px/700`,
  ipucu `12px/500`.
- Onay diyaloğu: kenardan `24`, dolgu `20`, iç boşluk `14`, başlık `21px/800`
  (`-.03em`, satır `1.15`), gövde `14.5px/500` satır `1.5`, özet paneli `padding 14 ·
  radius 18`, düğmeler arası `9`.
- Taşıma sheet'i: köşe `22`, blok arası `14`, başlık `21px/800`, alt metin `13.5`,
  yeşil durum rozeti `h28 · padX10 · r10 · 12px/700` zemin `rgba(45,143,50,.13)`,
  nokta `8`; düğmeler `h60`, arası `10`.

## Renk

- Koyu tema: sayfa `#0E0E0E` civarı, gömülü kart krem `#FAF3E9`, üstünde mürekkep
  `#0E0E0E` ve ikincil `rgba(14,14,14,.52)`.
- Aydınlık tema: gömülü kart **tersine döner** — `#1C1710` / `#F3EDE3` /
  `rgba(243,237,227,.58)`. Gerekçe: krem sayfa üstünde krem kart düzlem değiştirmez.
- Turuncu `#FF5A1F` **yalnız zaman ve eylem** taşır — durum rengi değildir.
- Amber `#D9A43B` bekleme; yeşil `#2D8F32` tamamlanmış; kırmızı krem üstünde `#A82F2F`,
  koyu üstünde `#E07272`.
- **Kırmızı dolu buton yok.** Yıkıcı eylem kırmızı METİN olarak, sola dayalı durur —
  dolu kırmızı buton yanlışlıkla basılacak kadar davetkâr.

## Değişmezler

- **Ölü kontrol yok.** Bir satır chevron gösteriyorsa bir şey açar; açmıyorsa chevron
  göstermez. Bugünkü en büyük şikâyet bu.
- **Sahte teslimat yok.** Hiçbir metin "bildirim gönderildi", "müşteriye haber verildi"
  demez. Uygulama mesaj atmıyor.
- Kullanıcı 40–55 yaş, salonda ayakta, tek elle, tek bakışta. Dokunma hedefi ≥ 44 pt.
- Rakamlar sistem fontu (SF Pro) + `tabular-nums`; metin Hanken Grotesk.
- Türkçe büyük harf kuralı (İPTAL, DEĞİŞTİR — İ noktalı).
- Hareket yalnız **opaklık ve dönüşüm**; yükseklik, renk, gölge, yarıçap animasyonu yok.
  Renk değişimi iki yüzeyin üst üste yumuşak geçişiyle yapılır. **Gölge hiç kullanma** —
  ayrım kenarlık ve yüzey farkıyla.
- Yalnız flexbox. CSS grid, float, `position:sticky` yok. React Native'e taşınacak.
- Emoji yok. Sade çizgi ikon (1.7 kalınlık, yuvarlak uç).

## Ayrıca istediğim

**Hareket.** Bu sayfa bir bloğa dokunulunca **açılıyor** ve kapanıyor; alt ekranlar
(B, C, D, E) onun üstünden geliyor. Şunları tanımla:

- Takvimdeki blok ile açılan sayfa arasında bir bağ var mı — hangi eleman devam ediyor?
- Sayfanın içeriği nasıl geliyor: hep birlikte mi, sırayla mı? Sıralıysa hangi sırayla
  ve kaç ms arayla?
- "Geldi"ye basıldığında durum satırı ne yapıyor? Butonlar gidip yerine tek satırlık
  durum geliyor — bu bir takas mı, dönüşüm mü?
- E'deki `12:00 → 13:30` hareketi nasıl beliriyor?
- Her geçiş için **ms ve eğri** yaz. Süreler `160–320 ms` bandında kalsın.

## Teslim

- Cihaz `393 × 852` (iPhone 16 Pro); `375 × 667`de sıkışan yerleri ayrıca belirt.
- Tek, kendi kendine yeten HTML. Harici font/CDN yok.
- Bütün hâlleri telefon çerçeveleri içinde, **alt alta ve etiketli** göster
  ("Müdür 25 · A2 — geçmişi bilinmeyen müşteri"). Sekmeli prototip yapma; hepsini aynı
  anda görmem gerekiyor. En az bir hâli **aydınlık temada** da çiz.
- Her ekran için ölçü tablosu (dolgu, yarıçap, punto, renk) ver ve CSS'i tabloyla
  **birebir** tut; çeliştiğinde CSS esas alınacağı için çelişki bırakma.
- Hareketler için ayrı bir tablo: olay · süre · eğri · hangi özellik.
- Sonda kısa bir "React Native notları" bölümü: metin kırpma, satır sayısı sınırları,
  uzun ad/uzun hizmet adı davranışı.

## Ton

Sakin, net, güven veren. Kutlama yok, abartı yok. Sayfa tek bir soruya cevap versin:
**"Bu randevuya ne olacak ve ben ne yapmalıyım?"**
