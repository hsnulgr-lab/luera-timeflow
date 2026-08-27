# Müdür 29 · Sıradaki randevu kartı v2 — Claude Design promptu

Ekler: akış ekranı görüntüsü (mevcut hâl) +
`docs/design-reference/Luera Mobil - Mudur 20 Bekleme Kartlari.html` +
`docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi Kartlari.html`
(kart ailesinin dili — **korunacak**) +
`docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`.

---

**Müdür 29 · Sıradaki randevu kartına "gelecek mi?" sorusunu ekle**

Luera TimeFlow'un müdür akış ekranındaki **sıradaki randevu kartını**
genişlet. Kart bugün çalışıyor ve güzel; **yeniden tasarlanmasını
istemiyorum.** Eksik olan tek bir bilgi katmanı var ve o katman kartın en
önemli sorusunu cevaplıyor.

## Bağlam

Salon müdürü telefonu açıyor, akış ekranına bakıyor. Sıradaki randevu kartı
şunu söylüyor: kim geliyor, ne yaptıracak, kiminle, girmesine kaç dakika var.
İki düğme: **Geldi** / **Gelmedi**.

Söylemediği şey: **bu müşteri gerçekten gelecek mi.**

Bu boş bir soru değil. Uygulama randevudan 24 saat önce WhatsApp'tan
hatırlatma gönderiyor ve müşterinin **Evet/Hayır cevabı veritabanına
yazılıyor** (`reservations.customer_confirm`). Yani cevap elimizde; ekran onu
hiç göstermiyor. Müdür, "geleceğim" demiş müşteri ile hiç cevap vermemiş
müşteriyi ayırt edemiyor — ikisi de aynı kartta, aynı sakinlikte duruyor.

Sektör verisi: gelmeme oranı hedefi **%6'nın altı**. Salonun en pahalı sorunu
"boş kalan ama dolu görünen slot".

## Tasarlanacak

### A · Durum şeridi (kartın içinde, tek satır)

Kart yüksekliği **büyümemeli**. Eklenecek şey tek bir satır ve o satır
**yalnız söyleyecek bir şey varken** çizilir.

Taşıyacağı üç hâl:

1. **Geleceğini bildirdi** — müşteri hatırlatmaya "Evet" yazdı. Bu iyi haber;
   müdürün yapacağı bir şey yok. En sessiz hâl olmalı.
2. **Cevap yok** — hatırlatma gitti, müşteri cevap vermedi. Nötr; ama randevu
   yaklaştıkça anlamı değişiyor (2 saat kala cevapsızlık, 20 saat kala
   cevapsızlıktan başka bir şey). **Zamanla değişmeli mi? Sen karar ver.**
3. **Riskli** — bu müşteri geçmişte gelmemiş. Örnek cümle: `Son 5
   randevunun 2'sine gelmedi`. Yanında tek bir eylem: **Hatırlat** (WhatsApp).

**Hatırlatma hiç gitmediyse** (numara yok, hatırlatma kapalı) satır **hiç
çizilmez** — "bilinmiyor" diye bir rozet konmaz. Bu üründe bilinmeyen ile
olumsuz aynı şey değildir.

### B · İlk ziyaret işareti

İlk kez gelen müşteri farklı yönetilir: form, alerji sorusu, tanıştırma, daha
uzun süre. Kartta bunu söyleyen **çok küçük** bir işaret gerekiyor — rozet mi,
ismin yanında bir işaret mi, sen öner. **Uyarı gibi görünmemeli**: ilk ziyaret
iyi bir haberdir, risk değil.

### C · A1'de personel hazırlığı

Bağlamı olan kartta (A2) `Selin şu an işlemde · 08 dk` satırı zaten var ve
doğru. Bağlamı olmayan sade kartta (A1) yok — oysa asıl kritik soru orada: 6
dakika sonra girecek müşteriyi karşılayacak kişi hâlâ meşgulse randevu zaten
gecikecek. A1'e bu bilgi **kartı şişirmeden** nasıl girer?

## Değişmeyecekler

- **Kartın iskeleti, ölçüleri ve iki düğmesi.** Bu kart ailesi tasarlandı ve
  uygulandı; v2 ekleme yapar, yeniden kurgulamaz.
- **Geri sayım bloğu** (`GİRMESİNE · 6 dk · 11:30 · 45 dk`) olduğu gibi kalır.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM — asla durum.
  Kırmızı `#E07272`/`#C94040` risk. Amber `#D9A43B`/`#B87A00` uyarı. Yeşil
  `#5FBF64`/`#2D8F32` olumlu. **Renk tek başına anlam taşımaz; kelime her
  zaman yazılı.**
- **Hareket sözleşmesi:** yalnız `opacity`, `translateX/Y`, `scale`, hepsi
  `useNativeDriver: true`. Yükseklik, renk, gölge animasyonlanamaz — renk
  değişimi iki yüzeyin çapraz solmasıyla olur. `reanimated` ve
  `gesture-handler` projede yok. `reduceMotion` açıkken hareket yok.
- **Sahte veri yok.** Bilinmeyen çizilmez.

## Cevaplamanı istediğim üç soru

1. Üç durumun **görsel ağırlık sırası** ne? "Geleceğini bildirdi" en sessiz,
   "riskli" en yüksek olmalı — ama "riskli" bile bir uyarı bombardımanı
   olmamalı: müdür günde otuz kart görüyor.
2. Cevapsızlık **randevu yaklaştıkça** biçim değiştirmeli mi?
3. Satır **girerken** ne oluyor? Kart zaten ekranda dururken bir hatırlatma
   cevabı gelirse (canlı) satır nasıl beliriyor?

## Çıktı

Kartın üç durumu × koyu/açık tema, artı ilk ziyaret işareti, artı A1'in
personel satırı. Her hareket için süre, eğri ve `reduceMotion` hâli. Her
karar için bir cümlelik gerekçe.
