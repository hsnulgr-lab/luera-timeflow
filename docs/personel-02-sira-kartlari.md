# Personel 02 · Sıra kartları

**Effort: High.**

Bu turun konusu **tek bir bileşen**: personelin "Bugün" ekranında saat rayının
sağında alt alta dizilen **randevu kartı**.

Ekranın geri kalanı bu turun konusu DEĞİL ve değişmiyor: üstteki gün başlığı
(`Paz.` + turuncu nokta + sönük `30`) duruyor, altındaki hafta şeridi
kaldırıldı, saat rayı duruyor, turuncu "şimdi" çizgisi duruyor, alt sekme
çubuğu duruyor. **Bunları yeniden çizme, yerlerini değiştirme, yerine bir şey
önerme.** Kartın onlarla nasıl hizalandığını göster, o kadar.

---

## 1 · Kartın işi

Personel telefonu bilgi almak için değil **iş yapmak için** açıyor. Kart altı
sorudan dördünü tek bakışta cevaplamalı:

1. Sıradaki kim, ne zaman, ne yapacağım?
2. Geldi mi?
3. Şu an ne kadardır çalışıyorum, planlanandan uzadım mı?
4. Bunu yaptım mı? *(aynı işi iki kez başlatmamak için)*

Kalan iki soru (bugün kaç işim kaldı · bu müşteride bilmem gereken bir şey var
mı) ekranın başka parçalarına ait, karta değil.

İki fiziksel kısıt kartın içeriğini doğrudan belirliyor:

**Eller dolu.** Islak, boyalı, eldivenli. Hassas hedef çalışmaz.

**Ekran müşterinin gözü önünde.** Telefon koltuğun yanında duruyor. Kartta
müşterinin okumaması gereken hiçbir şey yazamaz — borç, alerji notu, salon
notu, geçmiş gelmeme sayısı. Bunlar kartta YOK.

---

## 2 · Görsel yön

Ekteki beş referansın hepsi aynı şeyi yapıyor ve tur bunu izliyor:

**Kart düz.** Siyahtan bir tık açık tek renk dolgu, geniş yarıçap. **Gradyan
yok, kenarlık yok, gölge yok, cam yok, parıltı yok.** Önceki turlarda cam
denendi ve tutmadı; bu karar kapandı, açma.

**Kart ince.** Şikâyet birebir şu: kartlar üstten ve alttan fazla kalın. Sabit
yükseklik olmayacak — yüksekliği içerik belirleyecek. Bunun anahtarı §4'teki
kural: **durum satırı ancak söylenecek bir durum varsa vardır.** Sıradan bir
gelecek randevu iki satır; sadece süren randevu üç satır olur.

**Sıcak.** Referanslar nötr gri kullanıyor, biz kullanamayız: ekranın üstünde
sıcak kahve bir gradyan var ve liste ondan kopmamalı. Koyu temada zemin
`#120E08`, kart `#241E16`. Açık temada zemin `#F3ECE0`, kart `#FFFDFB`.
Bu iki değeri kullan; nötr griye kaydırma.

Kart, saat rayının sağında kalan genişliğin tamamını kaplar.

---

## 3 · Kartın taşıyabileceği veri

Bu liste tam. **Burada olmayan hiçbir bilgiyi karta koyma** — uydurulmuş bir
alan tasarımı geçersiz kılar.

| Alan | Örnek | Not |
|---|---|---|
| `start_time` | `11:30` | Saat rayında, kartın içinde değil |
| `end_time` | `12:15` | Süre buradan hesaplanır: `45 dk` |
| `customer_name` | `Ayşe Yılmaz` | Kartın birincil satırı |
| `service` | `Saç boyama + fön` | Serbest metin, uzun olabilir |
| `arrived_at` | damga | İşlem BAŞLADI demek |
| `service_ended_at` | damga | İşlem BİTTİ demek |
| `adisyon_items` | dizi | Boşsa adisyon gönderilmemiş |
| `is_paid` | bool | Kasada tahsil edildi |
| `status` | `cancelled` | İptal |
| `customer_arrived_at` | damga | Müşteri KAPIDA. Veritabanında var, uca eklenecek — çizebilirsin |
| `customer_phone` | var/yok | Sadece varlığı; numara YAZILMAZ |
| `service_color` | renk | Hizmetin kendi rengi. **Durum anlatmakta kullanılamaz** |

Süren işlem için ekranda canlı bir **geçen süre** sayacı var (`24:18`) ve
planlanan süreyle karşılaştırılabiliyor.

---

## 4 · Dokuz hâl — turun asıl çıktısı

Bugünkü kartın tek hâli var. Dokuzunu da tek tek çiz.

| # | Hâl | Nereden anlaşılır |
|---|---|---|
| 1 | Gelecek randevu | Saat henüz gelmedi, damga yok |
| 2 | **Kapıda** — müşteri geldi, başlanmadı | `customer_arrived_at` dolu, `arrived_at` boş |
| 3 | **Sürüyor** | `arrived_at` dolu, `service_ended_at` boş |
| 4 | **Uzadı** | Sürüyor + geçen süre > planlanan |
| 5 | **Gecikti** — saat geçti, müşteri yok | `start_time` geçmiş, hiçbir damga yok |
| 6 | Bitti, adisyon gönderilmedi | `service_ended_at` dolu, `adisyon_items` boş |
| 7 | Bitti, kasaya gitti | `adisyon_items` dolu, `is_paid` false |
| 8 | Tahsil edildi | `is_paid` |
| 9 | İptal | `status = 'cancelled'` |

Üç kural:

- **Her hâl kendi kelimesini söyler.** Renk tek başına anlam taşımaz — renk
  körü bir personel de aynı bilgiyi almalı.
- **Durum satırı ancak durum varsa vardır.** 1. hâlde durum satırı yoktur;
  kart iki satırdır ve liste bundan nefes alır.
- **Bitmiş randevular sönükleşir ama okunur kalır.** Personel "bunu yaptım mı"
  sorusunu onlara bakarak cevaplıyor.

---

## 5 · Sağdaki işaret

Kartın sağında, 1. referanstaki çatal-bıçak karesine benzeyen bir alan var.
Bizde bu **durum işaretidir, düğme değildir** ve **dokunulmaz**.

Bu yüzden düğme gibi görünmemeli: basılabilir bir yüzey izlenimi veren hiçbir
şey (belirgin kutu, kabartma, ok işareti) kullanma. Ve durum yoksa işaret de
yoktur.

**Eylem karta dokununca açılan randevu sayfasında yaşıyor.** Kartın kendisi
tek bir dokunma hedefidir — kartın içinde ikinci bir dokunulur şey yok.

---

## 6 · Renk

- Turuncu `#FF5A1F` **yalnız ZAMAN ve EYLEM** rengidir. Durum rengi değildir.
  Şimdi çizgisi ve geçen süre sayacı turuncudur; "gecikti" turuncu OLAMAZ.
- Risk / gecikme: koyu `#E07272`, açık `#C94040`
- Bekleme / dikkat: koyu `#D9A43B`, açık `#B87A00`
- Tamam / bitti: koyu `#5FBF64`, açık `#2D8F32`
- Metin: koyu `#F3EDE3` · ikincil `rgba(243,237,227,0.58)` · üçüncül `0.36`

---

## 7 · Karta GİRMEYECEKLER

Bu liste, önceki turlarda kendiliğinden eklenmiş ve kaldırılmış şeylerden
oluşuyor. Hiçbiri geri gelmeyecek:

- **`⋮` menü işareti** (4. ve 5. referansta var — bizde yok, arkasında hiçbir
  şey olmadığı için ölü kontrol olurdu)
- **Müşteri fotoğrafı / avatar** (böyle bir veri yok, ve ekranı müşteri
  görüyor)
- **`ilk ziyaret` etiketi, yeşil ✓ rozeti, amber `!2` rozeti** — üçünün de
  veri karşılığı YOK, üçü de önceki turda uydurulmuştu
- **Kartın içinde buton** ("Başlat", "Bitir", "Ara") — eylem burada yaşamıyor
- İlerleme çubuğu, yüzde, mini grafik
- Araç çubuğu, filtre satırı, sekme grubu
- Hizmet rengini durum rengi olarak kullanmak

---

## 8 · Çıktı

**Koyu tema birincil, açık tema ikincil.** Her ölçü yazılı olacak — dolgu
rengi, yarıçap, iç boşluklar (üst/alt ayrı ayrı), yazı boyutları ve
kalınlıkları, satır araları. Kartı ben bu sayılardan koda çevireceğim; sayı
yoksa tahmin ederim ve tasarım bozulur.

1. **Ana kare** — öğlen 12:36, listede: 1 bitmiş · 1 kapıda · 1 sürüyor ·
   2 gelecek randevu, aralarında turuncu şimdi çizgisi
2. **Dokuz hâlin tek tek çizimi**, yan yana karşılaştırılabilir
3. Ana karenin **açık tema** hâli
4. **375 × 667** küçük telefonda kart — uzun müşteri adı ve uzun hizmet adıyla
5. Kartın ölçü dökümü: tek bir patlatılmış çizim, sayılar üstünde

Her karar için bir cümlelik gerekçe. Fazlasını yazma.

---

## 9 · Kutuya yazılacak cümle

> Personel "Bugün" ekranının randevu kartını tasarla — **sadece kartı**.
> Ekranın geri kalanı (gün başlığı, saat rayı, turuncu şimdi çizgisi, alt
> sekme çubuğu) duruyor ve değişmiyor. Kart DÜZ: tek renk sıcak dolgu, geniş
> yarıçap, gradyan/kenarlık/gölge/cam yok. Kart İNCE: sabit yükseklik yok,
> durum satırı ancak söylenecek durum varsa var. Asıl çıktı **dokuz hâlin**
> tek tek çizimi ve kartın **sayısal ölçü dökümü**. Ekran müşterinin gözü
> önünde kullanılıyor; kartta borç, alerji, not YOK. Ekli listede olmayan
> hiçbir alanı karta koyma.

---

## 10 · Ekler

1. Kullanıcının gönderdiği 5 referans görseli (vardiya kartı · takvim günü ×2 ·
   görev listesi kartı ×2)
2. Bugünkü personel "Bugün" ekranının cihazdan alınmış görüntüsü — **kaldırılan
   tasarım**
3. `docs/design-reference/Luera Mobil - Durumlar.html` — durum kelimeleri
4. Beğenilen gün başlığı bloğunun görüntüsü — listenin bağlanacağı sıcaklık
