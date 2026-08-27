# Müdür 30 · Kasa v2 — gün sonu, personel ve kâr — Claude Design promptu

Ekler: Kasa ekranı görüntüsü (mevcut hâl) +
`docs/design-reference/Luera Mobil - Mudur 14 Kasa.html` (**korunacak dil**) +
`docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`.

---

**Müdür 30 · Kasa "ciro" diyor, "kâr" diyemiyor**

Luera TimeFlow'un müdür Kasa ekranını genişlet. Mevcut ekran iyi ve
**korunacak**: turuncu kahraman panel, bugün giren tutar, düne göre değişim,
ödeme yöntemi kırılımı, bekleyen adisyon şeridi, hareket listesi. İstenen şey
yeni bir Kasa değil, **eksik üç sorunun eklenmesi**.

## Bağlam — salon sahibi akşam ne yapar

Türkiye'de salon nakit ağırlıklı çalışıyor. Gün bitiyor, son müşteri çıkıyor,
sahibi çekmeceyi sayıyor. Üç şeye bakıyor:

1. **Kim ne yaptı** — hangi personel ne kadar ciro üretti. Prim hesabının da
   temeli. (Veri `payments.staff_id`'de hazır.)
2. **Çekmecede olması gereken ile olan tutuyor mu** — nakit sayımı ve fark.
3. **Bugün kazandım mı** — ciro eksi gider. Ekran bugün yalnız GİRENİ
   sayıyor; gider defteri veritabanında var (`expenses`) ama Kasa'da yok.

Rakiplerde (Fresha, Vagaro, Zenoti) gün sonu kapanışı ve nakit sayımı
**masaüstü POS işi**. Salon sahibi akşam masada değil, kapıda. **Cepte iyi
yapan yok** — burası açık bir kapı.

## Tasarlanacak

### A · Personel bazlı ciro

Günün cirosunun kişiye dağılımı. Salon sahibinin günde en çok sorduğu soru.

- Kaç kişi? 3–8 arası tipik, ama 15 de olabilir.
- Ne gösterilecek: ad, tutar, işlem sayısı. **Prim yüzdesi gösterilmemeli**
  (bu ekranda değil — prim ayrı bir konu ve tartışma yaratır).
- Sıralama: en çok üretenden mi, sabit personel sırasından mı? **Sen karar
  ver ve gerekçelendir** — sıralama bir değer yargısıdır.
- Kahraman panelin içine mi, altına mı, hareketlerin üstüne mi?

### B · Gün sonu kapanışı

Yeni bir alt ekran. Akşam bir kez açılır, iki dakika sürer.

Taşıması gerekenler:

- **Beklenen nakit** — sistemin bildiği nakit tahsilat toplamı.
- **Sayılan nakit** — müdürün girdiği sayı.
- **Fark** — ve fark varsa ne oluyor? Sıfırdan farklı bir sayı bir suçlama
  değil, bir kayıt olmalı. Açıklama satırı zorunlu mu, isteğe bağlı mı?
- **Kart ve havale** sayılmaz (banka söyler) — ama görünmeli mi?
- Kapanış **geri alınabilir mi?** Yanlış sayı girildiğinde ne oluyor?

Bu ekran bir **ritüel**: her akşam aynı sırayla, düşünmeden yapılabilmeli.
Klavye açıldığında sayı alanı ve kaydet düğmesi ikisi de görünür kalmalı —
bu üründe bir alt sayfa tam olarak bu yüzden kilitlenmişti.

### C · Bugünün sonucu (ciro − gider)

Gider defteri veritabanında var. Kasa'ya girmesi gereken **tam bir gider
defteri değil**, iki şey:

- Bugünün giderleri toplamı ve **bugünün gerçek sonucu** (giren − çıkan).
- **Hızlı gider girişi** — üç dokunuş: tutar, kalem, kaydet. Salon sahibi gün
  içinde malzeme alıyor, kargo ödüyor, çay-şeker alıyor; akşama unutuyor.

Gider **negatif bir sayı olarak** mı, ayrı bir satır olarak mı gösterilir?
Kahraman paneldeki büyük rakam hangisi olmalı — giren mi, sonuç mu? **Bu
tasarımın en önemli kararı**; gerekçesini yaz.

### D · Ortalama sepet

Tek satır, tek sayı. Sektörün beş çekirdek KPI'sından biri. Nereye girer?

## Değişmeyecekler

- **Turuncu kahraman panel ve bugünün büyük rakamı** kalır (içeriği
  tartışmaya açık — bkz. C).
- **Bekleyen adisyon şeridi** kalır: panelin altından çıkan, dünden kalanı
  yaşlandırarak söyleyen şerit.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM. Kırmızı
  `#E07272`/`#C94040` risk. Amber `#D9A43B`/`#B87A00` uyarı. Yeşil
  `#5FBF64`/`#2D8F32` olumlu. Renk tek başına anlam taşımaz.
  **Dikkat:** para burada turuncu DEĞİL — turuncu bu üründe zaman ve eylem
  taşıyor, tutar taşımıyor.
- **Hareket sözleşmesi:** yalnız `opacity`, `translateX/Y`, `scale`, hepsi
  native sürücüde. Renk, yükseklik, gölge animasyonlanamaz. `reanimated` ve
  `gesture-handler` projede yok. `reduceMotion` açıkken hareket yok.
- **Sıfır bir ölçümdür, bilinmemek bir boşluktur** — ikisi asla aynı çizilmez.
- **Sahte onay yok**, ölü kontrol yok.
- Abonelik/plan/fiyat/fatura **hiç geçmez** (App Store 3.1.1).

## Ölçüler

Sayfa yanı 18 · kart yarıçapı 22 · alt sekme çubuğu payı 118 · dokunma hedefi
44'ün altına inmez. Hedef kitle 40–55 yaş, ayakta, tek elle. Açık temada iki
yüzey neredeyse aynı (`#FAF7F3` üstüne `#F0E9DF`) — basılabilir her yüzeyin
kılcal kenarlığı olmalı.

## Çıktı

Kasa ana ekranı (koyu + açık) ve gün sonu kapanışı alt ekranı (koyu + açık).
Hızlı gider girişi. Her hareket için süre, eğri, `reduceMotion` hâli. Ve her
karar için bir cümlelik gerekçe — özellikle kahraman paneldeki büyük rakamın
ne olduğu ve personel sıralaması için.
