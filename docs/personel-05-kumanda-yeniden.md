# Personel 05 · İşlem kumandası — sıfırdan

**Effort: High.** Bu ekran personel modunun **bayrak gemisi**. Bu ekran
olmazsa hiçbir şey olmaz.

Bir önceki tur bir **form** üretti: chevron'lu ayarlar satırları, eşit
ağırlıkta kutular, ekranın yarısı boş. Sıfırdan başlıyoruz.

**Korunacak tek şey: kaydırarak başlat.** Geri kalan her şey — yerleşim,
yapı, tipografi ölçeği, hiyerarşi, malzeme, süsleme — **serbest**.

---

## 1 · Bu ekran ne

Bir randevunun tamamı burada yaşıyor. Kuaför bunu **iki saat boyunca**
tezgâhın üstünde açık tutuyor.

Sayı olarak: bir randevu boyunca ekrana **30–40 kez bakılıyor**, **5–10 kez
dokunuluyor**. Bakış/dokunuş oranı yaklaşık **5:1**.

Bunun tek bir tasarım sonucu var ve bütün turun omurgası bu:

> **Ekran 70–80 cm mesafeden, eğik açıyla, yarım saniyede okunmalı.**
> Yakından okunması gereken hiçbir şey birincil olamaz.

Bu bir kontrol paneli, bir kayıt formu değil. Bir **alet**. Uçak kokpiti,
fırın paneli, dalış bilgisayarı — bakılan, okunan, sonra tekrar işe dönülen
şeyler.

Kendi tasarımını sınamak için üç test:

| Test | Nasıl |
|---|---|
| **80 cm** | Çizimi küçült, kolun boyu kadar uzaktan bak. Ne okunuyor? |
| **Yarım saniye** | Ekrana bir an bak, kapat. Ne hatırlıyorsun? |
| **Eldiven** | Her dokunma hedefi ıslak, kalın bir parmakla vurulabilir mi? |

---

## 2 · Personelin dört korkusu

Tasarım bunları çözerse iyi tasarımdır. Sırayla, en korkulandan aza:

**1. Boyayı zamanında yıkamamak.** Saç yanar, müşteri kaybedilir. Geri dönüşü
yoktur.

**2. Kalem eklemeyi unutmak.** Kullanılan boya, satılan şampuan adisyona
yazılmazsa salon parayı kaybeder ve bunu kimse fark etmez.

**3. Yanlış randevuyu başlatmak/bitirmek.** Sunucuya yazılır, geri alınmaz.

**4. Sinyal gidince yaptığı işin kaybolması.** Bodrum katta çalışıyor.

---

## 3 · Üç evre, üç ayrı biçim

Ekran değişmiyor — **biçim değiştiriyor.** Evre veriden okunuyor, çağıran
seçmiyor.

| | Evre | Veri | Ekranın kahramanı |
|---|---|---|---|
| **A** | Başlamadan önce | `arrived_at` boş | **Kaydırma çubuğu** |
| **B** | İşlem sürüyor | `arrived_at` dolu, `service_ended_at` boş | **Zaman** |
| **C** | Bitti, adisyon açık | `service_ended_at` dolu | **Toplam** |

Üç evrenin **üç ayrı şekli** olmalı. Aynı iskelete üç farklı içerik doldurmak
geçen turun hatasıydı: beş blok, beşi eşit ağırlıkta, hiçbiri "asıl olan bu"
demiyor.

Her evrede **tek bir kahraman** var ve geri kalan her şey ona hizmet ediyor.

---

## 4 · Turun merkezindeki problem: iki saat

B evresinde **iki sayaç** var ve ikisi ters yönde çalışıyor:

| | Geçen süre | Bekleme süresi |
|---|---|---|
| Yön | yukarı sayar | **aşağı sayar** |
| Ne diyor | "programda mıyım" | "ne zaman yıkayacağım" |
| Kaçırırsan | randevu sarkar | **saç yanar** |
| Ne sıklıkta var | işlem süresince hep | yalnız kurulduğunda |

**Aciliyet sırası ikincisinde.** Geçen sürede 10 dakika sarkmak normaldir;
bekleme süresinde 5 dakika gecikmek telafisi olmayan bir hatadır.

Geçen tur geçen süreyi **74 punto** yapıp bekleme sayacını küçük bir kutuya
koydu. **Hiyerarşi tersti.**

Cevaplanacak: bu ikisi aynı ekranda nasıl var olur? Bekleme sayacı
kurulduğunda ekranın dengesi değişmeli mi? İkisi aynı biçimi mi paylaşıyor,
yoksa birbirinden tamamen ayrı mı görünüyorlar? Bekleme yokken o alan ne
oluyor — boş mu duruyor, yoksa ekran kendini yeniden mi diziyor?

> **Teknik gerçek, tasarımı doğrudan etkiliyor:** uygulamada bildirim ve ses
> yok. Bekleme alarmı **telefon kilitliyken ya da uygulama arkadayken
> çalamaz.** Bu bir eksik ve kapatılacak; ama tasarım "alarm çalar" varsayımı
> üstüne kurulmamalı. Personel ekrana baktığında kalan süreyi **anında**
> görmeli — asıl güvence bu.

---

## 5 · Adisyon bir sepet değil

Kuaför kalemleri **kullandıkça** ekliyor: boyayı açtı → ekledi, şampuanı sattı
→ ekledi. Amaç kasada unutmamak.

Yani bu liste **çok yazılıyor, az okunuyor**. Ekranı yönetmemeli; ama üstüne
eklemek tek hareket olmalı.

Üç cins var ve üçü aynı şey değil:

| Cins | Ne | Örnek | Müşteri için |
|---|---|---|---|
| `extra` | Sonradan eklenen hizmet | Kaş alma | fatura kalemi |
| `product` | Satılan ürün | Şampuan | fatura kalemi |
| `material` | Kullanılan malzeme | Boya, oksidan | **çoğu salonda maliyet, faturada yok** |

Malzeme `visit.finish` çalışınca **stoktan düşüyor**. Yani "boya ekle" bir
stok hareketi.

Cevaplanacak: üç cins aynı listede mi? Malzemenin fiyatı görünmeli mi? Adet
nasıl artıyor? Yanlış eklenen kalem eller ıslakken nasıl siliniyor —
kaydırarak silmek burada tehlikeli.

---

## 6 · Ekranı müşteri görüyor

Telefon koltuğun yanında, müşterinin görüş alanında duruyor. İki saat boyunca.

**Yazılamayacaklar:** bakiye, alerji notu, geçmiş gelmeme sayısı, salon notu,
telefon numarası.

**Para maskelenmeli.** Geçen turun tek iyi fikri buydu ve korunuyor: fiyatlar
ve toplam varsayılan olarak gizli, personel dokununca kısa süre açılıp
kendiliğinden kapanıyor. Görünümünü yeniden tasarla, fikri koru.

**Not müşterinin göremeyeceği tek içerik.** Nerede yazılıyor, nasıl saklanıyor?

---

## 7 · Aynı anda iki işlem olabilir

Bazı salonlarda kuaför boyayı sürüp öteki koltuğa geçiyor, bazılarında tek iş
yapıyor. **Tasarım ikisini de kaldırmalı.**

Sonuçları:

- Personel bu ekrandan **çıkıp geri gelecek** — bekleme sayacı çalışmaya devam
  etmeli ve dönüşte doğru yerden devam etmeli
- Ekran, personelin **başka bir işlemi sürüyorsa** bunu söylemeli mi? Söylerse
  nerede, ne kadar sessizce?
- Bu ekrandan "Bugün"e dönmek tek dokunuş olmalı

---

## 8 · Korunan tek şey: kaydırarak başlat

A evresinin kahramanı. iPhone'un **slide to answer** çubuğu referans (ekli).

Korunan: **jest**. Yeniden tasarlanacak: görünüm, ölçü, davranış, çubuğun
ekrandaki yeri ve ağırlığı.

Tasarlanacak dört an: **dingin** (kırkıncı seferde hâlâ davet ediyor mu, yoksa
gürültü mü?) · **sürüklenirken** · **eşik geçildi** (personel bırakmadan önce
anlamalı) · **varış**.

Eşiğin altında bırakılırsa çubuk başa döner. Bu geri dönüş *"olmadı"* demeli,
*"yanlış yaptın"* dememeli.

**Kaydıramayan kullanıcı:** ekran okuyucu kullanan biri bu çubuğu kaydıramaz.
Kaydırma tek yol olamaz — ikinci yol nedir ve normal kullanıcıya görünmeden
nasıl var olur?

### Bitirme: uzun bas

Düğmeye basılı tutuluyor, dolan bir gösterge tamamlanınca işlem bitiyor;
bırakılınca hiçbir şey olmuyor.

**Jest korunuyor, görünümü serbest.** Geçen turdaki "kenarlıklı kutuda yüzen
form düğmesi" değil — iPhone'un konuşma ekranındaki END gibi yalnız, kalın ve
tereddütsüz olmalı (ekli).

Ne kadar sürede doluyor — **karar senin, gerekçelendir**.

---

## 9 · Geri alınamaz üç yazma

`visit.start` · `visit.items` · `visit.finish`. Üçü de sunucuya gidiyor, üçü de
geri alınamıyor.

**Sinyal yoksa istek yerel kuyruğa alınıyor** ve bağlantı gelince gönderiliyor.
Personel için işlem başlamıştır; sunucu için henüz başlamamıştır.

Bu üçüncü hâl bu turun **gizli konusu**: kuyruğa alınmış bir başlangıç ekranda
nasıl görünür? Personel işine devam edebilmeli ama "gitti" yalanını da
duymamalı. **Sahte onay yok.**

**Ekranda kaç onay var: BİR.** Kaydırmadan ya da uzun bastan sonra "emin
misiniz?" penceresi çıkmaz — jestin kendisi onaydır.

---

## 10 · Serbest olan her şey

Bunları açıkça yazıyorum çünkü geçen tur fazla temkinli davrandı:

- **Yerleşim tamamen serbest.** Başlık + liste + alt düğme kalıbı zorunlu değil
- **Cam serbest** (`backdrop-filter`). Bir uyarı: cam gerçek bir sistem
  materyali ve kullanıcı "Saydamlığı Azalt"ı açtığında **düz bir yüzeye
  dönüşüyor**. Camın arkasındaki hiçbir şey okunmayı cama borçlu olmamalı
- **Tipografi ölçeği serbest.** Büyük sayı, ince başlık, ne gerekiyorsa
- **Süsleme serbest:** halka, yay, gradyan, gölge, doku, derinlik
- **Ekran tek ekrana sığacak, sayfa kaydırılmayacak.** Adisyon uzarsa yalnız
  o liste kendi içinde kayar; geri kalan her şey yerinde kalır
- Alt sayfa, üst tabaka, geçici katman — serbest

**Referans olarak bakılabilecekler** (kopyalanacak değil, ödünç alınacak):
iOS Zamanlayıcı'nın halkası ve iri rakamı · Live Activity'lerin "şu anda
sürüyor" dili · Fitness halkalarının aynı anda iki ilerlemeyi okutması ·
sürücü uygulamalarının tek işe odaklı kokpiti · POS uygulamalarının tek elle
hızlı kalem ekleyişi.

---

## 11 · Tek kural: renk

| | |
|---|---|
| Turuncu `#FF5A1F` | yalnız **ZAMAN ve EYLEM**. Durum rengi değil |
| Risk / gecikme | koyu `#E07272` · açık `#C94040` |
| Bekleme / dikkat | koyu `#D9A43B` · açık `#B87A00` |
| Tamam / bitti | koyu `#5FBF64` · açık `#2D8F32` |
| Zemin | koyu `#120E08` · açık `#F3ECE0` |
| Yüzey | koyu `#241E16` · açık `#FFFDFB` |
| Metin | koyu `#F3EDE3` · ikincil `%58` · üçüncül `%36` |

**Bu paletin dışında renk yok.** Geçen turda hizmet adının yanına mavi bir
şerit girmişti — mavi bu üründe hiç yok.

---

## 12 · Ekranın taşıyabileceği veri

Liste **tam**. Burada olmayan hiçbir alanı ekrana koyma; uydurulmuş bir alan
tasarımı geçersiz kılar.

`customer_name` · `customer_phone` (yalnız varlığı, numara yazılmaz) ·
`service` · `start_time` · `end_time` (planlanan süre buradan) · `status` ·
`customer_arrived_at` · `arrived_at` (**işlem başladı** — adı yanıltıcı) ·
`service_ended_at` · `adisyon_items[] {name, price, kind, qty}` · `is_paid` ·
`notes` · katalog (hizmetler: ad, süre, fiyat · ürünler: ad, fiyat, birim,
`retail`/`consumable`, stok takibi)

**Bekleme sayacı hiçbir yere yazılmıyor** — telefonda yaşıyor.

**Not için sunucuda uç YOK.** Yazılacak, ama bugün yok. Tasarımda bekleyen bir
iş olarak yer alsın; ölü kontrol olarak değil.

---

## 13 · Cevaplanacak beş soru

1. **Her evrenin kahramanı ne** ve geri kalanı ona nasıl hizmet ediyor?
2. **İki saat aynı ekranda nasıl var olur** ve bekleme sayacı kurulduğunda
   denge nasıl değişir?
3. Adisyona kalem eklemek **tek elle, ıslak parmakla** kaç hareket?
4. **80 cm'den** bu ekranda ne okunuyor?
5. Kuyruğa alınmış bir başlangıç, **yalan söylemeden** nasıl görünür?

---

## 14 · Çıktı

**Koyu tema birincil, açık tema ikincil.** Her ölçü ve süre yazılı.

Az sayıda kare, **derinlemesine**. On iki sıradan çizim yerine altı mükemmel
çizim istiyorum.

1. **A evresi** — tam ekran, kaydırma çubuğu dingin
2. **B evresi** — bekleme sayacı YOKken ve VARken, yan yana
3. **C evresi** — adisyon kasaya
4. Kaydırmanın dört anı · uzun basmanın üç anı
5. Kalem ekleme
6. Kuyruğa alınmış hâl
7. 375 × 667 · cam kapalıyken

Her karar için **bir cümlelik gerekçe**. Neden yapmadığın şeyleri de yaz.

---

## 15 · Kutuya yazılacak cümle

> Personel modunun **bayrak gemisi**: bir randevunun tamamının yaşadığı işlem
> kumandası. Bu bir form değil bir ALET — bir randevu boyunca 30–40 kez
> bakılıyor, 5–10 kez dokunuluyor, yani **80 cm'den yarım saniyede
> okunmalı**. Tek ekrana sığacak, sayfa kaydırılmayacak. Üç evre, her birinin
> **tek bir kahramanı** var: başlamadan önce kaydırma çubuğu, sürerken zaman,
> bitince toplam. Turun merkezindeki problem **iki saat**: geçen süre yukarı,
> boya bekleme süresi aşağı sayıyor — ve aciliyet ikincisinde, çünkü
> kaçırılırsa saç yanar. Adisyon bir sepet değil hafıza desteği: çok yazılıyor,
> az okunuyor. Ekranı MÜŞTERİ GÖRÜYOR, o yüzden para maskeli. Korunan tek şey
> **kaydırarak başlat** jesti; yerleşim, tipografi, malzeme ve süsleme
> tamamen serbest — **yalnız renk paleti sabit**. Ekli veri listesinde
> olmayan hiçbir alanı koyma.

---

## 16 · Ekler

1. iPhone **slide to answer** — korunan jestin referansı
2. iPhone konuşma ekranı **END** düğmesi — bitirmenin ağırlık referansı
3. Kullanıcının gönderdiği cam kart / kaydırıcı referansları
4. Cihazdan alınmış **"Bugün"** ekranı — bu ekranın açıldığı yer ve
   onaylanmış görsel dil
5. `Luera Mobil - Personel 04 Islem Kumandasi.html` — **reddedilen tasarım**.
   Neyin tekrarlanmayacağını görmek için: chevron'lu ayarlar satırları, eşit
   ağırlıkta kutular, boş ekran, mavi şerit, çıplak sayaç
