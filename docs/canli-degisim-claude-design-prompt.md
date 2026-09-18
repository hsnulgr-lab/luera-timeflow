# Canlı Değişimin Dili · Bir şey geldiğinde ekran ne yapar — Claude Design promptu

**Ekler:**
1. **Ekran görüntüleri (telefondan, bugünkü hâl):** müdürün **Akış** ekranı
   (yaklaşan randevu kartları, "Geldi" + "Yönet") · personelin **Bugün** ekranı
   (saat rayı + satırlar, "TAHSİL EDİLDİ" işaretli satır).
2. `docs/design-reference/Luera Mobil - Mudur 34 Eylem Hapi v2.html` — Akış'ın
   onaylanmış son hâli. **Bu turda dokunulmuyor**, yalnız üstüne hareket giyiyor.
3. `Luera Mobil - Giris v3 Isik Alani.html` — hareket sözlüğünün kaynağı (yaylar,
   süreler).

**Effort: High.**

---

## 0 · Bu tur neden var

Ekranlar artık **canlı.** Masaüstünden bir randevu oluşturulduğunda ya da
personel "Geldi" dediğinde, telefon saniyesinde haberdar oluyor ve listeyi
tazeliyor. Bundan önce ekran 25 saniyede bir yoklayarak öğreniyordu.

Bu iyi bir şey — ama yeni bir sorun doğurdu. Güncellemeler eskiden kullanıcı
ekrana **bakmıyorken** geliyordu (sayfa değiştirirken, uygulamayı açarken).
Şimdi **bakarken** geliyor. Ve bugün kart **pat diye** beliriyor:

**① Parmağının altındaki içerik kayıyor.** Müdür "Geldi"ye basmak üzere; tam o
an masaüstünden üstte bir randevu ekleniyor, kart aşağı kayıyor ve **yanlış
karta** basıyor. Bu bir süs meselesi değil, **yanlış dokunuş** meselesi.

**② Neyin değiştiği fark edilmiyor.** Anında ve sessizce eklenen bir kart,
gözün önünde olsa bile kaçabiliyor. Müdür "bir şey geldi" diye bilmiyor.

Yani bu turun işi **süslü bir belirme değil.** Hareketin görevi şunu demek:
**"yeni bir şey geldi, işte burada"** — ve bunu parmağı şaşırtmadan yapmak.

---

## 1 · Verilmiş kararlar — değişmez

1. **Akış'ın tasarımı DOKUNULMAZ.** Müdür bu ekrandan çok memnun ve bozulmasını
   istemiyor. Sabit kalanlar:
   - kronolojik **artan** sıra (geçmiş yukarıda, gelecek aşağıda)
   - şimdi-çizgisine açılma ve **alt üçte bir** konumu
   - satır anatomisi: saat rayı · nokta + etiket · ad · detay · kart
   - kart yükseklikleri **94 · 96 · 118**
   - **tek kart tek eylem**
   - **krom yok:** araç çubuğu, filtre, sekme yasak

   Bu tur yalnız **hareket** ekliyor. Kartın kendisini, sırasını ya da yerini
   değiştiren bir öneri kapsam dışı.
2. **Hareket yalnız CANLI değişiklikte.** Ekranı açtığında liste animasyonla
   dökülmemeli — her açılışta bir kaskad, günde on kez açılan bir uygulamayı
   yavaşlatır. Hareket, **ekran açıkken** gelen değişiklik için.
3. **Veri kanaldan gelmiyor, yalnız "değişti" haberi geliyor.** Telefon haberi
   duyunca listeyi baştan çekiyor ve eskisiyle karşılaştırıyor. Yani hareketin
   bildiği şey şu: **hangi satır yeni, hangisi gitti, hangisi değişti.** Kimin
   değiştirdiğini ya da neden değiştiğini bilmiyor.
4. **Olaylar toplanıyor.** Art arda gelen değişiklikler (bir adisyonun beş
   kalemi, bir taşımanın iki satırı) 300 ms içinde **tek tazelemeye** iniyor.
   Yani ekran bir anda birkaç değişikliği birden alabilir.

---

## 2 · Kapsam — hangi ekranlar

| Ekran | Kim | Bugün | Öncelik |
|---|---|---|---|
| **Akış** (`mudur/index`) | Müdür | Kartlar, eski `Animated` 13 yerde | **Ana kare** |
| **Bugün** (`personel/index`) | Personel | Satır listesi, hiç animasyon yok | **Ana kare** |
| Takvim (müdür, personel) | İkisi | Blok ızgara | İkincil |
| Kasa, müşteri defteri | Müdür | Liste | İkincil |

İkincil ekranlar için ayrı kare istemiyorum — **aynı dilin** oralara nasıl
uygulanacağını bir cümleyle söylemen yeterli.

---

## 3 · Tasarlanacak üç olay

### A · Yeni randevu geldi

Masaüstünden eklendi, ya da çevrimiçi randevudan düştü.

- Nasıl beliriyor?
- **"Yeni" vurgusu** — kart birkaç saniye işaretli kalıyor mu, sonra sıradan
  karta mı dönüyor? Kaç saniye? Neye benzer?
- Liste **ekranın dışında** bir yere eklendiyse (kullanıcı aşağıda, yeni kart
  yukarıda): kullanıcı bunu **nasıl** öğreniyor — ya da öğrenmeli mi?

### B · Randevu değişti

Personel "Geldi" dedi · tahsil edildi · saat değişti · personel değişti.

- Değişen kart **yerinde** nasıl belirtilir?
- Saati değişen randevu listede **yer değiştirir** (kronolojik sıra) — bu kayma
  nasıl görünür? Kullanıcının takip edebileceği bir hareket mi, sessiz bir
  yeniden diziliş mi?

### C · Randevu gitti

İptal edildi ya da silindi.

- Nasıl kayboluyor? Altındakiler yukarı nasıl kapanıyor?
- **Sessizce mi gitmeli, yoksa bir iz mi bırakmalı?** (Müdür "Ayşe Hanım'ın
  randevusu nereye gitti?" diye düşünmemeli.)

---

## 4 · Değişmez kısıtlar

- **Konum korunur.** Kullanıcının baktığı ya da basmak üzere olduğu kart, üste
  eklenen bir şey yüzünden **yerinden oynamaz.** Asıl sorun buydu (§0 ①).
  Bunun nasıl sağlanacağını söyle — kaydırma konumu mu sabitleniyor, ekleme mi
  erteleniyor?
- **Hızlı.** Belirme 200–300 ms bandında. Yavaş animasyon premium değil, ağır
  hissettirir. **Premium his ölçülülükten gelir** — zıplayan, abartılı, her
  şeyi hareketlendiren bir dil ucuz durur.
- **Mevcut hareket sözlüğü** (`authMotion`, Giriş v3):
  ekran ileri 240 · geri 200 · alt sayfa giriş 260 / çıkış 180 · durum 140 ms ·
  yay: sönüm 20, sertlik 320–340, kütle 0.5. **Bu sözlükle konuş**; yeni bir süre
  ya da yay öneriyorsan gerekçesini yaz.
- **Araç:** reanimated 4.5.1 (liste giriş/çıkış/kayma hareketleri). **Yok:**
  gesture-handler, `LayoutAnimation`, Lottie, Skia. Her hareket için bedel
  etiketi: **A** reanimated ile bugün yazılır · **B** Skia ister (uygulanamaz —
  A karşılığını da çiz) · **C** mümkün değil.
- **`reduceMotion`:** hareket durur, **bilgi durmaz.** Kayma yerine anlık
  yerleşme, belirme yerine renk vurgusu. "Yeni geldi" bilgisi hareketsiz de
  verilebilmeli. **Bu hâli çiz.**
- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş, ayakta, tek elle.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız **zaman ve eylem** · kırmızı
  `#E07272`/`#C94040` risk · amber `#D9A43B`/`#B87A00` uyarı · yeşil
  `#5FBF64`/`#2D8F32` olumlu. "Yeni" vurgusu için yeni bir renk icat etme —
  mevcut envanterden hangisi ve neden?
- **İki tema da çizilir.**

---

## 5 · Cevaplamanı istediğim sorular

1. **"Yeni" vurgusu** neye benzer, kaç saniye sürer? Renk mi, hareket mi, ikisi mi?
2. Kullanıcı **basmak üzereyken** üste bir kart eklenirse ne olur? (Asıl soru.)
3. Ekranın **dışında** bir değişiklik olduysa kullanıcı öğrenmeli mi, nasıl?
4. Aynı anda **birkaç değişiklik** gelirse (ör. üç randevu birden): hepsi aynı
   anda mı, sırayla mı? Sırayla ise aralık kaç ms?
5. Saati değişen kartın **yer değiştirmesi** izlenebilir bir hareket mi olmalı?
6. İptal edilen randevu **iz bırakmalı mı?**
7. Personelin Bugün'ü müdürün Akış'ından **daha sakin mi** olmalı? (Personel
   ekrana müdürden daha az bakıyor; bildirim niyeti farklı.)
8. `reduceMotion`'da "yeni geldi" bilgisi **hareketsiz** nasıl verilir?

---

## 6 · Çıktı

**Koyu ve açık temada**, her süre ve yay değeri yazılı:

1. **L1 Akış · yeni randevu** — belirme · "yeni" vurgusu · vurgunun sönmesi ←
   **ana kare**
2. **L2 Akış · basmak üzereyken üste ekleme** — konum nasıl korunuyor ← **ana kare**
3. **L3 Akış · değişen kart** ve **yer değiştiren kart**
4. **L4 Akış · giden kart**
5. **L5 Personel Bugün** — aynı üç olay, satır dilinde
6. **`reduceMotion`** (L1 + L5)
7. İkincil ekranlar (Takvim, Kasa, defter) için **birer cümle**

Her karar için **bir cümlelik gerekçe.** Her hareket için **zaman çizelgesi**
(hangi özellik, kaç ms'de, hangi eğriyle).

---

## Kutuya yazılacak cümle

> Luera TimeFlow'da ekranlar artık canlı: masaüstünden bir randevu eklendiğinde
> telefon saniyesinde görüyor. Ama kart **pat diye** beliriyor — ve kullanıcı
> ekrana bakarken geldiği için iki sorun doğuruyor: basmak üzere olduğu kart
> **kayıyor** (yanlış dokunuş), ve neyin değiştiği **fark edilmiyor**. Bu turda
> **canlı değişimin dilini** tasarla: yeni randevu nasıl belirir ve kısa süre
> "yeni" diye işaretlenir, değişen kart nasıl belirtilir, giden kart nasıl
> kaybolur — ve en önemlisi **kullanıcının baktığı kart yerinden oynamaz.**
> Müdürün **Akış** ekranı dokunulmaz (sıra, anatomi, kart yükseklikleri
> sabit); yalnız hareket ekleniyor. Hareket yalnız canlı değişiklikte, 200–300
> ms, ölçülü — premium his ölçülülükten gelir. reanimated 4.5.1 var;
> gesture-handler, LayoutAnimation, Skia yok. Koyu + açık tema, reduceMotion.

**Effort: High.**
