# TEK · G5 · Gün kartının seçicisi — Claude Design promptu

Tek kişilik işletmenin **Gün** ekranındaki krem hâl kartı (v4 · G1–G4) bugün
YALNIZ BİR randevuyu taşıyor: sıradakini. Kullanıcı kartın **tasarımının aynı
kalmasını**, ama ona bir yetenek eklenmesini istiyor: kart bir **picker** gibi
aşağı-yukarı kaydırılsın, sıradaki randevular arasında geçilsin ve **hangisi
seçiliyse Başlat onu** başlatsın.

**Ekler — yalnız bunlar (başka dosya ekleme):**
1. `Luera Mobil - Tek Kisilik v4.html` + `tek4-kit.js` + `tek4-ekranlar.js` +
   `tek4-belge.js` — **dördü birlikte** (HTML ötekileri yüklüyor). Gün'ün
   onaylı hâli: G1 · G2 · G3 · G4 kartları ve listesi.
2. `Luera Mobil - Kumanda.html` — Başlat'ın açtığı ekran. Kadranın kelimeleri
   bu turun sözlüğü: **BEKLİYOR · GECİKME · BAŞLAMAYA**.
3. **Ekran görüntüleri:**
   - telefonda Gün, 23:00 — kartın **bugünkü** hâli (BEKLİYOR · 30 dk · Başlat)
   - aynı kartın yakın planı — **görüntülerde eski etiket "KAPIDA" yazıyor;
     artık "BEKLİYOR"** (satır da "… · 22:05’te geldi" oldu)
   - **yığın-picker referansı** (ortada seçili kart, üstte ve altta küçülüp
     solan kartlar, yanda ok) — İSTENEN HAREKETİN KENDİSİ
   - iOS saat tekerleği (orta bant seçili, komşular soluk)
   - masaüstünün "SEANSI PLANLANMAMIŞ · 1/5 · Seans planla" yığını —
     Luera'nın kendi yığın deseni (sayaç + arkada solan ikinci satır)

**Effort: High.**

---

## Çıktı kuralı — önce bunu oku

- **Tek HTML dosyası:** `G5-gun-secici.html`. Tur yarıda kesilirse "devam"
  dendiğinde kaldığın kareden sürdür.
- **Kaydırma prototipte DENENEBİLMELİ:** kart fareyle sürüklenebilsin ve
  tekerlekle kaydırılsın; bırakınca en yakın randevuya otursun. Bu turun asıl
  çıktısı hareket — durağan kare yetmez.
- **Tema: tek bir koyu/açık düğmesi.** Aynı kareyi iki temada ayrı çizme.
- **Telefon ölçüsü: kareler 393 × 852.** G5·1 ayrıca 375 × 667'de çizilir
  (kartın altında listenin ne kadar kaldığı asıl soru).
- **Açıklama kısa:** her karar için tek cümle gerekçe, her hareket için tek
  satır zaman çizelgesi (özellik · ms · eğri).

## Ortak kısıtlar

- **Kartın kendisi DEĞİŞMİYOR.** Krem yüzey (koyu temada `#FAF3E9`, açıkta
  `#1C1710`), köşe 18, iç pay 14, etiket 11.5 · harf aralığı 0.06, büyük sayı
  34, sağda turuncu hap (`Başlat`), altında tek satır bağlam. Yeni olan
  yalnız **yığın** ve **hareket**.
- **Renk envanteri — yeni renk icat etme:** turuncu `#FF5A1F` yalnız **zaman ve
  eylem** · kırmızı `#E07272`/`#A82F2F` risk/gecikme · amber `#D9A43B`/`#8A5C00`
  bekleme · yeşil olumlu.
- **Yazı tipi:** Hanken Grotesk. Büyük harf metin katmanında yazılır
  (`textTransform` Türkçe İ'yi bozuyor).
- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş, ayakta, tek elle.
- **Hareket sözlüğü:** durum 140 ms · yay: sönüm 20, sertlik 320–340, kütle
  0.5. Yeni bir değer öneriyorsan gerekçesini yaz.
- **Araç:** jestler `PanResponder` (**react-native-gesture-handler YOK** ve
  kurulmayacak); hareket RN `Animated` ya da reanimated 4.5.1, yalnız
  **opacity / translateY / scale**. `expo-haptics` kurulu (değer başına
  `selection` tıkı mümkün). `expo-blur` kurulu ama kart başına bulanıklık
  pahalı — önerirsen bedelini yaz. **Yok:** Skia, Lottie, `LayoutAnimation`.
- **Bedel etiketi:** her hareketin yanına **A** bugün yazılır · **B** Skia ya da
  gesture-handler ister (uygulanamaz — A karşılığını da çiz) · **C** mümkün değil.
- **`reduceMotion`:** hareket durur, **bilgi durmaz** (yığın yine görünür,
  geçiş anlık).
- **Uydurma veri yok:** olmayan özellik, sayı ya da iddia çizilmez.

## Apple'ın picker ilkeleri (HIG · Pickers) — bu tura düşen kısmı

Kaynak: https://developer.apple.com/design/human-interface-guidelines/pickers
- Picker, **sıralı** ve **öngörülebilir** değerlerden birini seçtirir —
  burada değerler bugünün randevuları, **saat sırasıyla**.
- Seçim **bağlamda** yapılır; seçmek için başka bir ekrana geçilmez.
- Tekerlekte seçili değer **ortadaki bantta**, komşular görünür ama geri
  çekilir (küçülür, solar); kaydırma ivmeyle sürer ve bir değere **oturur**.
- Uzun listeler için uygun değil — bugünün kalanı genelde 1–6 randevu.

---

# İŞ · G5 · Hâl kartının seçicisi

### Gerçek — bugün kod böyle çalışıyor
- Kart sırası (v4): **süren ya da beklemedeki iş (G2/G3) → açık adisyon (G4)
  → sıradaki randevu (G1)**. Hap kumandayı açar; işi başlatan kumandadaki
  "Kaydır ve başlat" (hap işi kendisi BAŞLATMIYOR — geri alınamaz bir yazma).
- **Başlatılabilir randevu** = iptal ya da tamamlanmış değil, başlamamış ve
  **gelmedi sayılmamış**:
  - **BEKLİYOR** (kehribar) — müşteri geldi, iş başlamadı. Büyük sayı:
    kaç dakikadır bekliyor. Satır: "Tuğçe Erden · Kaş Tasarımı · 22:05’te geldi".
  - **GECİKTİ** (kırmızı) — saati geçti, müşteri gelmedi, 30 dk pay
    dolmadı. Büyük sayı: kaç dakika geçti. Satır: "Gizem Ünal · Kaş Tasarımı ·
    29 dk sonra gelmedi sayılır".
  - **ŞU AN BOŞ** (G1) — saati gelmemiş ilk randevu. Büyük sayı: ona kalan
    süre. Satır: "14:00’e kadar · sıradaki Tuğçe Erden".
- 30 dk pay dolan randevu **gelmedi** sayılır ve kartın konusu değildir.
  Müşteri yine de gelirse randevu kartındaki "Geldi" onu BEKLİYOR'a alır.
- **Sunucu saat kısıtı koymuyor:** randevu saatinden önce de başlatılabilir.
  Kumanda bu durumda "N dk BAŞLAMAYA" der.
- Birden çok başlatılabilir varsa kart bugün yalnız **ilkini** (saat
  sırasıyla) gösteriyor. Ötekine ulaşmanın yolu yok: listenin kartına
  dokununca randevu kartı açılıyor, başlatmıyor.
- Sıradaki yoksa kart: "ŞU AN BOŞ · 1 sa 24 dk · 23:55’e kadar · sıradaki
  randevu yok" ya da kapanıştan sonra "BUGÜN · 5 randevu · 3 tamamlandı ·
  1 gelmedi". Bu iki hâl seçici DEĞİL (tek kart).
- Kartın altındaki liste bugünün bütün randevuları; süren iş varken yalnız
  sıradakiler.

### Neden (kullanıcının cümlesi)
Bir müşteri sırasını başkasına verdi; biri erken geldi; iki kişi aynı anda
bekliyor. Saatinden önce başlatılması gereken bir randevu olabilir.

### İstenen
Kart **picker gibi** davranır: karttan başlayan dikey sürükleme seçiliyi
değiştirir; seçili kart ortada **tam** durur, komşular üstte ve altta **yığın**
olarak görünür (referans görseldeki gibi küçülüp solarak). Bırakınca en yakın
randevuya oturur. Kartın içeriği (etiket, büyük sayı, satır, hap) **seçilenin**
hâlini söyler. **Başlat seçileni** açar.

### Kareler
- **G5·1 Durgun · üç başlatılabilir** — BEKLİYOR seçili; altında GECİKTİ ve
  16:30'daki sıradaki yığında. Konum göstergesi (ör. masaüstünün "1/3"ü) —
  gerekli mi, nerede? Karar ver.
- **G5·2 Sürüklerken** — iki kartın tam ortası; komşuların ölçek, kayma ve
  opaklık değerleri. Hareket tablosu bu karede.
- **G5·3 İkinci seçili** — GECİKTİ ortada, BEKLİYOR üstte yığında.
- **G5·4 İleri randevu seçili (saatinden önce başlatma)** — ilk olmayan,
  saati gelmemiş randevunun kartı ne der? "ŞU AN BOŞ … sıradaki" yalnız ilk
  için doğru. Kumandanın "N dk BAŞLAMAYA" diline yaslanan bir öneri getir.
- **G5·5 Tek başlatılabilir** — bugünkü kartın BİREBİRİ: yığın izi yok,
  sürükleme yok. Kullanıcı farkı görmemeli.
- **G5·6 Süren iş + sıradakiler** — en üstte SÜRÜYOR (G2) ya da BEKLEMEDE
  (G3); sıradakiler yığında. Başlat ne yapar? (bkz. Kararlar 3)
- **G5·7 reduceMotion** — aynı yığın, geçiş anlık.
- **G5·1 · 375 × 667** — kart + yığın + listenin ilk satırı sığıyor mu?

### Kararlar — her birine tek cümle gerekçeyle cevap ver
1. **Sayfa kaydırması ile çakışma.** Gün sayfası dikey kayıyor. Karttan
   başlayan dikey sürükleme seçiciye, kart dışından başlayan sayfaya gider.
   Kullanıcı kartın kaydırılabildiğini **dokunmadan önce** nasıl anlıyor?
   (yığının görünen kenarı mı, sayaç mı, ilk açılışta bir ipucu mu?)
2. **Varsayılan seçim** her zaman ilk (saat sırası). Kullanıcı ikinciye
   kaydırıp bıraktıysa: ekrana dönünce, yeni randevu gelince ya da süre
   geçince ilk karta geri mi döner? Öner.
3. **Süren iş varken** sıradakilere bakılabilir mi, başlatılabilir mi? Tek
   kişi aynı anda iki iş yapamaz, ama boya beklerken (G3 · BEKLEMEDE) başka
   müşteriye başlamak gerçek bir iş. Öneri: süren işte yalnız bakılır, Başlat
   yalnız BEKLEMEDE'yken açılır — kabul ya da reddet.
4. **Listeyle bağ.** Kullanıcının ilk fikri: bekleyen müşterinin liste
   kartına basınca kumanda açılsın. Seçenekler: (a) liste kartına basmak
   seçiciyi o randevuya getirir, (b) doğrudan kumandayı açar, (c) bugünkü
   gibi randevu kartını açar. Birini seç; seçili randevunun listede de
   işaretlenip işaretlenmeyeceğini söyle.
5. **Saatinden önce başlatma** ek bir onay istiyor mu, yoksa kumandanın
   "Kaydır ve başlat"ı yeterli engel mi?
6. **Ekran okuyucu:** seçici "ayarlanabilir" öğe olarak yukarı/aşağı
   kaydırmayla değişir; her değişimde ne okunur? Tek cümle.
7. **Dokunsal tık** her randevuya oturuşta mı, yalnız bırakınca mı?

### Hareket tablosu (G5·2'nin altında)
Seçili ↔ komşu geçişinde: translateY · scale · opacity değerleri, oturma
yayı, uçlarda lastik bandı (ilk ve son randevuda), tık zamanı. Her satıra
bedel etiketi (A/B/C).
