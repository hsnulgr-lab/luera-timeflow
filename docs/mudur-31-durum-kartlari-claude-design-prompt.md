# Müdür 31 · Durum kartları ailesi ve eylemleri — Claude Design promptu

Ekler: iki akış ekranı görüntüsü (mevcut hâl — **ölçüler bunlar, ideal kabul
edildi**) · `docs/design-reference/Luera Mobil - Mudur 20 Bekleme Kartlari.html`
· `docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi
Kartlari.html` (ailenin dili — **korunacak**) ·
`docs/design-reference/Luera Mobil - Mudur Modu.html`.

---

**Müdür 31 · Akıştaki her duruma doğru eylemi ver**

Luera TimeFlow'un müdür akış ekranında dokuz olay türü var ve her biri bir
kart çiziyor. Kartların **ölçüleri ve dili doğru** — ekteki görüntüler ideal
kabul ediliyor ve **büyümeyecek**. Eksik olan şey ölçü değil: **kartların
yarısı bir durumu bildiriyor ama o durumda yapılacak şeyi sunmuyor.**

Bu belge kartların görünümünü değil, **eylem ailesini** tasarlar.

---

## 1 · Bugünkü envanter — ne var, ne yok

| Kart | Durum | Bugünkü eylemler | Eksik olan |
|---|---|---|---|
| `next` | Sıradaki randevu | Geldi · Gelmedi | **Geciken müşteriye ulaşma yolu yok** |
| `arrived` | Müşteri geldi, bekliyor | Personele söyle · Beklemeye al · Geri al | — (bu kart tam) |
| `started` | İşlem sürüyor | yok | Süre aşımında ne olacak? |
| `finished` | İşlem bitti | yok | Kasaya devir görünür mü? |
| `due` | Adisyon bekliyor | Tahsil et | Müşteri gittiyse? |
| `paid` | Tahsilat alındı | yok | — (doğru, karar yok) |
| `booked` | Yeni online randevu | yok | Onay/görme yolu yok |
| `cancelled` | Randevu iptal edildi | yok | **Boşalan saat kimseye sorulmuyor** |
| `noshow` | Müşteri gelmedi | Geri al · Geç geldi · Yeniden randevu | **WhatsApp'tan yazma yok** |

Üç satır kalın: müdürün **gerçekten yapacağı şeyi** ekran sunmuyor.

---

## 2 · Neden bu üç eksik pahalı

Salonun tek gerçek kaybı **boş koltuk**. Üç eksiğin üçü de tam olarak o kaybın
oluştuğu anlar:

- **Geciken müşteri** — henüz kayıp değil, ama on dakika sonra kayıp olacak.
  Müdürün elindeki tek araç telefonu; ekran ona o aracı vermiyor, yalnız
  "Gelmedi" düğmesini gösteriyor. **"Gelmedi", müşteriyi kaybettikten sonra
  basılan düğmedir; kaybetmeden önce basılacak düğme yok.**
- **Gelmemiş müşteri** — randevu yandı. Şimdi iki şey mümkün: yerini
  doldurmak ve müşteriyle konuşmak. Kart ikisini de sunmuyor; yalnız kaydı
  düzeltmeyi sunuyor (Geri al / Geç geldi).
- **İptal edilen randevu** — o saat şu anda boş ve **bekleme listesinde o
  saati isteyen biri olabilir**. Kart bunu hiç söylemiyor.

## 3 · Elimizde gerçekten olan araçlar

Tasarım sahte eylem üretmesin diye: aşağıdakilerin **hepsi bugün sunucuda
çalışıyor**.

- **WhatsApp gönderimi** — çok kiracılı, kuyruklu, opt-out denetimli
  (`wa_message_log` + `wa_outbox`, `whatsapp-proxy`). Mesaj gönderme gerçek
  bir eylemdir.
- **Bekleme listesi** — `waitlist` tablosu ve `notify-waitlist` fonksiyonu;
  boşalan slotu bekleyene haber verebiliyor.
- **Hatırlatma onayı** — müşterinin "evet/hayır" cevabı
  (`reservations.customer_confirm`).
- **Personel bildirimi** — push kanalı (`send-push`, `push_subscriptions`).
- **Yeniden randevu** — `rebook`.

**Olmayan:** ödeme bağlantısı, otomatik arama, SMS. Bunlara dayanan bir eylem
önerme.

---

## 4 · Tasarlanacak kartlar

Her biri **mevcut kart iskeletiyle**: krem panel, sol kahraman rakam, sağ
eylem. Ölçüler ekteki görüntülerdeki gibi. **Kart 100 pt'yi geçmez.**

### A · `next` · geciken müşteri

Randevu saati geçti, müşteri yok. Bugün kart hâlâ `GİRMESİNE` diyor, sonra
`GECİKTİ`ye dönüyor ve iki düğme aynı kalıyor.

Yeni: **`Neredesin?` yolu.** WhatsApp'tan tek dokunuşla mesaj. Ama:

- Bu eylem `Geldi`nin yerini **almaz** — müşteri kapıdan girebilir.
- `Gelmedi`nin yerini de almaz — ama ondan **önce** gelmelidir: sıralama
  "önce ulaş, sonra düş".
- Üç düğme bir karta sığmaz. **Nasıl çözüyorsun?** (Üçüncüsü hayalet metin mi,
  ikincil eylem yer mi değiştiriyor, yoksa gecikme kartı ayrı bir hâl mi?)
- Kaç dakika gecikmeden sonra beliriyor? (Bugün otomatik düşme eşiği 30 dk.)

### B · `noshow` · gelmemiş müşteri

Bugün: Geri al · Geç geldi · Yeniden randevu. Üçü de **kaydı düzeltiyor**;
hiçbiri **müşteriye dokunmuyor**.

Yeni: **WhatsApp'tan yaz.** Bu kartın birincil eylemi bu mu olmalı? Salon
sahibi için gelmeyen müşteri iki şey demek: bugünkü boşluk ve yarınki risk.
Mesaj ikisini de çözmeye çalışan tek hamle.

Mesaj **hazır metinle mi gidiyor, boş mu?** Bu üründe otomatik mesaj yok;
müdür yazacak. Ama boş bir sohbet açmak da müdürü zorlar. Öneri getir.

### C · `cancelled` · boşalan saat

Bugün eylemsiz bir bildirim. Ama o saat **şu anda boş** ve bekleme listesinde
onu isteyen biri olabilir.

Yeni: **`Bekleyene sor`** — bekleme listesinde bu güne/saate uygun kişi varsa
kart onu söylüyor ve tek dokunuşla soruyor.

- Bekleme listesinde **kimse yoksa** ne oluyor? (Bu üründe kural: gidilecek
  yer yoksa düğme çizilmez.)
- Kaç kişi varsa "3 kişi bekliyor" mu diyor, ilk kişiyi mi söylüyor?

### D · `started` · süre aşımı

İşlem 45 dakikalıktı, 70 dakika oldu. Bugün kart yalnız süreyi sayıyor.
Sıradaki müşteri bundan etkilenecek.

Yeni: aşım **görünür mü**, ve görünüyorsa müdürün eylemi ne? (Sıradakine haber
vermek? Yoksa yalnız bilgi mi — her aşım bir sorun değildir.)
**Eylem gerekmediğine karar verirsen onu da gerekçelendir.**

### E · `booked` · yeni online randevu

Bugün eylemsiz. Müdürün burada gerçekten yapacağı bir şey var mı, yoksa bu
kart bilinçli olarak sessiz mi kalmalı? Karar senin, gerekçesiyle.

---

## 5 · Aileyi tutan kurallar

Bunlar mevcut kartlardan geliyor ve **yeni kartlar da bunlara uyacak**:

- **Dolu turuncu hap = birincil eylem, kartta en fazla bir tane.**
  Bugün: `Geldi`, `Tahsil et`, `Personele söyle`.
- **Kenarlıklı hap = ikincil.** Hayalet metin = üçüncül.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM — asla durum.
  Kırmızı `#E07272`/`#C94040` risk. Amber `#D9A43B`/`#B87A00` uyarı. Yeşil
  `#5FBF64`/`#2D8F32` olumlu. **Renk tek başına anlam taşımaz; kelime her
  zaman yazılı.**
- **Kahraman rakam solda, eylem sağda.** Rakam ne olduğu değil **ne kadar
  olduğu**: 14 dk bekliyor, ₺2.650, 6 dk kaldı.
- **Krem panel sayfanın tersi düzlemdir** — koyu temada krem, aydınlık temada
  koyu. (Bu kural mevcut koddan; ekteki dosyalar da böyle.)
- **Ölü kontrol yok.** Gidilecek yer yoksa, veri yoksa, numara yoksa **düğme
  hiç çizilmez** — pasif gri bırakılmaz.
- **Sahte onay yok.** Mesaj gönderildi denmesi için gerçekten gönderilmiş
  olması gerekir. Gönderim sonrası kart ne diyor?
- **Geri alınabilirlik:** mesaj gönderimi geri alınamaz, o yüzden onay
  diyaloğu mu ister yoksa tek dokunuş mu? (Bu üründe "Tahsil et" onay kartı
  gösteriyor, "Personele söyle" göstermiyor. Sınırı nereye koyuyorsun?)
- **Dokunma hedefi 44 pt'nin altına inmez.** 40–55 yaş, ayakta, tek elle.
- **Hareket:** yalnız `opacity`, `translateX/Y`, `scale`, native sürücüde;
  renk/yükseklik/gölge animasyonlanamaz. `reanimated` ve `gesture-handler`
  kurulu değil. `reduceMotion` açıkken hareket yok. Yeni bir hareket
  gerekiyorsa bedelini yaz: **A** bugün yazılabilir · **B** kütüphane ister ·
  **C** mümkün değil.

---

## 6 · Cevaplamanı istediğim sorular

1. **Geciken müşteri kartında üç eylem nasıl sığıyor** — ve hangisi birincil?
2. **Gelmemiş müşteride birincil eylem "WhatsApp'tan yaz" mı, "Yeniden
   randevu" mu?** İkisi farklı iş: biri ilişkiyi, öteki takvimi kurtarır.
3. Mesaj gönderildikten sonra kart **ne diyor** ve eylem düşüyor mu?
4. Bekleme listesi boşsa iptal kartı **neye benziyor**?
5. Süre aşımı bir **eylem** mi yoksa yalnız **bilgi** mi?

## 7 · Çıktı

Beş kart (A–E), her biri koyu ve açık temada, mevcut ölçülerle. Eylem
sonrası hâlleri de çiz (mesaj gönderildi, bekleyene soruldu). Her ölçü yazılı.
Her karar için **bir cümlelik gerekçe**. Ve hangi eylemin hangi sunucu ucuna
dayandığını yaz — sahte eylem istemiyorum.
