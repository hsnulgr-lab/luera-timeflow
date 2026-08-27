# Müdür modu · analiz, rakip karşılaştırması ve yol haritası

Tarih: 2026-08-28. Kaynak: mevcut kod + şema taraması, sektör KPI literatürü,
global (Fresha · Booksy · Vagaro · Mangomint · Zenoti · Boulevard) ve Türkiye
(Salon Randevu · Kolay Randevu · Randevio · Kuaförüm Yanımda) ürün incelemesi.

---

## 0 · Tek cümlelik teşhis

Müdür modunun **ekranları bitti, aklı eksik**. Bugün ne olduğunu çok iyi
gösteriyor; **ne olacağını** ve **ne yapılması gerektiğini** hiç söylemiyor.
Rakiplerin çoğu da bunu yapmıyor — açık kapı orada.

---

## 1 · Sıradaki randevu kartı — gerçek hayatta ne sorulur

Kart bugün şunu söylüyor: kim, hangi hizmet, kaç dakika, kiminle, girmesine
kaç dakika, ve iki düğme (Geldi / Gelmedi). Bağlam varsa not, paket ve bakiye
de ekleniyor.

**Kartın cevaplamadığı, salonda her gün sorulan altı soru:**

1. **"Bu müşteri gelecek mi?"** — `reservations.customer_confirm` kolonu
   ŞEMADA VAR (085) ve WhatsApp hatırlatmasına gelen Evet/Hayır oraya
   yazılıyor. Mobilde hiç okunmuyor. Müdür, 24 saat önce "geleceğim" demiş
   müşteriyle hiç cevap vermemiş müşteriyi ekranda ayırt edemiyor. **Bu, en
   ucuz ve en yüksek getirili eksik.**
2. **"Bu müşteri daha önce yakmış mıydı?"** — geçmiş gelmeme sayısı veride
   türetilebilir. Sektör hedefi no-show < %6; salonun kaybı doğrudan boş
   koltuk.
3. **"İlk ziyaret mi?"** — ilk gelen müşteri farklı yönetilir: form, alerji
   testi, daha uzun süre, tanıştırma. Kart bunu söylemiyor.
4. **"Personel hazır mı?"** — A2 kartında "Selin şu an işlemde · 08 dk" var
   ✓. Ama A1'de yok; oysa asıl kritik soru orada: 6 dakika sonra girecek
   müşteriyi karşılayacak kişi hâlâ meşgulse randevu zaten gecikecek.
5. **"Ne kadar tutacak?"** — beklenen tutar kartta yok. Gün sonu tahmini de
   yok.
6. **"Bu randevu tekrarlanan mı?"** — `014_recurring_reservations` var;
   düzenli müşteri ile tek seferlik müşteri aynı çiziliyor.

**Öneri:** kartı büyütmek yerine **tek bir "durum şeridi"** eklemek. Üç
duruma indirgenmiş, kelimeyle yazılan, renkle desteklenen bir satır:
`Geleceğini bildirdi` · `Cevap yok` · `Riskli — son 5 randevunun 2'sine
gelmedi`. Kart yüksekliği değişmez, satır yalnız söyleyecek bir şey varken
çizilir.

---

## 2 · Kasa — müdür ne görmek ister

Bugün: bugün giren, düne göre değişim, ödeme yöntemi kırılımı, bekleyen
adisyonlar, hareket listesi. Bu **iyi bir kasa ekranı** ama bir **gün sonu
ekranı değil**.

**Şemada VAR ama Kasa'da GÖRÜNMEYEN üç şey:**

| Ne | Şema | Kasa'da |
|---|---|---|
| Gider defteri | `080_expenses` | yok |
| Personel primi | `073_staff_commission` | yok |
| Stok | `074/075_stock` | yok |

**Sonuç:** Kasa "ciro" diyor, **"kâr" diyemiyor**. Salon sahibinin ilk sorduğu
soru "bu ay kazandım mı?" — 080'in kendi başlığında yazan cümle bu. Masaüstü
cevaplıyor, cep cevaplamıyor.

**Öneriler, önem sırasına göre:**

1. **Personel bazlı ciro.** Salon sahibinin günde en çok sorduğu soru "kim ne
   yaptı". Prim hesabının da temeli. Veri `payments.staff_id`'de (027) hazır.
2. **Gün sonu kapanışı (nakit sayımı).** Türkiye'de salonlar nakit ağırlıklı
   çalışıyor. Akşam çekmece sayılır ve beklenenle karşılaştırılır. Rakiplerin
   hemen hepsinde bu masaüstü POS işi; **cepte iyi yapan yok.** Ekran: beklenen
   nakit, sayılan nakit, fark — ve fark varsa açıklama satırı.
3. **Ortalama sepet.** Sektörün beş çekirdek KPI'sından biri. Tek satır.
4. **Gider girişi (hızlı).** Tam gider defteri değil; "bugün ne çıktı" için
   üç dokunuşluk bir giriş. Ciro − gider = günün gerçek sonucu.
5. **Hedef.** Aylık ciro hedefine göre bugünün payı. Motivasyon değil, karar
   aracı: hedefin altındaysa boş saat doldurma refleksi tetiklenir.

---

## 3 · Rakiplerde olup bizde olmayan

| Özellik | Kimde var | Bizde | Not |
|---|---|---|---|
| Tüketici pazar yeri (yeni müşteri getirir) | Fresha, Booksy, Treatwell | yok | En büyük stratejik fark. Ayrı bir ürün; kısa vadede kapsam dışı. |
| Mobil POS / kart okuyucu | Fresha, Square, Vagaro | yok | Türkiye'de POS entegrasyonu ayrı bir dünya. |
| İki yönlü SMS/WhatsApp sohbeti | Mangomint, Boulevard | kısmen (`whatsapp-booking`) | Bizde bot var, **sohbet kutusu yok**. |
| Prim / bordro | Zenoti, Vagaro | şema var (073), ekran yok | Yakın hedef. |
| Stok yönetimi | Fresha, Zenoti | şema var (074) | Kuaförde düşük öncelik, güzellik/diş'te yüksek. |
| Derin rapor (mobilde) | Zenoti, Meevo | yok | Mobilde derin rapor zaten yanlış; özet doğru. |
| AI resepsiyonist | Fresha (ücretli eklenti) | yok | Randevio'da WhatsApp botu var — Türkiye'de rekabet burada. |

## 4 · Bizde olup rakiplerin çoğunda olmayan

1. **WhatsApp yerlisi olmak.** Global oyuncular SMS/e-posta üstüne kurulu.
   Türkiye'de müşteri SMS okumuyor, WhatsApp okuyor. Bizde çok kiracılı
   WhatsApp (070), hatırlatma onayı (085), makbuz (084), bot (whatsapp-booking)
   zaten var. **Bu bir özellik değil, konumlanma.**
2. **Sektöre özel dashboard'lar** — kuaför, berber, güzellik, diş ayrı
   tasarım. Rakipler tek şablonu herkese giydiriyor.
3. **Dürüstlük sözleşmesi.** "Bilinmeyen ≠ sıfır", ölü kontrol yok, sahte onay
   yok. Küçük görünür; günlük kullanımda güven farkı yaratan tek şey budur.
4. **Türkçe'nin doğru yazılması** — ek uyumu, büyük harf tuzağı (İ/ı). Rakip
   ürünlerin çoğu makine çevirisi hissi veriyor.

---

## 5 · İnovasyon — kimsede olmayan, ilk biz yapabileceğimiz

### 5.1 Boş saat radarı ⭐ (en yüksek getirili fikir)

Salonun **tek gerçek kaybı boş koltuk**. Bugün hiçbir üründe "boşluğu
doldurmaya çalışan" bir ekran yok; hepsi olanı gösteriyor.

Öneri: müdür ekranında, günün içinde **doldurulabilir boşluk** belirdiğinde
tek bir kart çıkar:

> **14:00 – 16:00 · Merve boş**
> Son 30 günde bu aralıkta gelen 12 müşteri var.
> **Hepsine sor** (WhatsApp)

Elimizdeki her parça hazır: `020_waitlist`, `079_wa_outbox`, `030_rebook`,
`070_whatsapp_multitenant`. Eksik olan tek şey **kararı veren katman** ve o
katman saf bir fonksiyon.

### 5.2 Gelmeme riski, ama sessiz

"Riskli müşteri" damgası kabalık olur. Doğru biçim: kart, randevudan **60
dakika önce** ve yalnız geçmişi kötü olan müşteride tek satır gösterir —
`Son 5 randevunun 2'sine gelmedi · Hatırlat`. Tek dokunuşla WhatsApp gider.
Zenoti/Boulevard "no-show rate" raporu veriyor; **randevu anında uyaran yok.**

### 5.3 Gün sonu kapanışı — cepte

Nakit sayımı, fark, gün kapanış özeti. Rakiplerde masaüstü işi. Türkiye'de
salon sahibi akşam masada değil, kapıda. (Bkz. §2.2)

### 5.4 "Bugün ne oldu" — akşam tek ekran

Gün bitince tek bir kart: kaç randevu, kaç geldi, kaç gelmedi, ciro, en yoğun
personel, yarının ilk randevusu. Salon sahibi eve giderken bakar. `010_daily_insights`
şeması zaten var.

### 5.5 Personel gerçek zamanlı verimlilik

"Merve bugün 6 saatin 4,5'ini işlemde geçirdi · %75". Sektör hedefi %75–85.
Rakipler bunu ay sonu raporunda veriyor; **canlı gösteren yok.**

---

## 6 · Sıra önerisi

**Şimdi (veri hazır, ekran küçük):**
1. Hatırlatma onayı kartta görünsün (085 → kart) — bir gün.
2. Kasa'da personel bazlı ciro (027 → kasa) — bir gün.
3. Ortalama sepet — yarım gün.

**Sonra (tasarım gerekir):**
4. Sıradaki kart · durum şeridi → Müdür 29 brief'i.
5. Kasa · gün sonu kapanışı + gider + hedef → Müdür 30 brief'i.

**Sunucu bağlandıktan sonra:**
6. Boş saat radarı (5.1) — ürünün en ayrıştırıcı özelliği olabilir.
7. Gelmeme riski (5.2).

**Kapsam dışı (bilinçli):** pazar yeri, mobil POS, stok, derin rapor.
