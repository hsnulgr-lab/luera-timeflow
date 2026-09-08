# Personel modu — yapılacaklar

> **Güncelleme 2026-09-04:** A1 hariç A grubunun tamamı, B2, B3'ün yerine
> geçen alerji işareti ve E1/E2'nin tamamı uygulandı. Aşağıda üstü çizili
> olmayanlar duruyor.

Tarama tarihi: **2026-09-05**. Kaynak: kumanda ekranının tasarım dosyasıyla
(`Luera Mobil - Personel 06 Islem Kumandasi.html`) kod karşılaştırması ve
personel modunun ekran ekran taraması.

Sıra **öneme göre**, günlere göre değil. Her maddede "neden" var: bir madde
neden yapıldığını söylemiyorsa, sonraki tur onu yanlış yapar.

---

## A · Arayüz yalan söylüyor — önce bunlar

Bu üçü "ölü kontrol yok, sahte onay yok" kuralını doğrudan çiğniyor ve
üçü de kısa iş.

### A1 · Adisyon kalemi düzenlenemiyor

`app/(staff-flow)/kumanda.tsx` → `LineRow` tamamen okunur.

Tasarımda çizilmiş ama uygulanmamış: `.it.op` açılan satır hâli, içinde
`− adet +` sayacı (`.qty`, 46 pt düğmeler) ve kırmızı **Kaldır** düğmesi
(`.rm`, çöp ikonu).

**Neden:** yanlışlıkla eklenen kalem geri alınamıyor; iki kez basılan ürün
iki satır oluyor ve ikisi de kasaya gidiyor. Adisyon gönderilene kadar her
şey düzeltilebilir olmalı — tasarım da öyle diyor.

**Tasarım turu gerekmiyor.** Ölçüler HTML'de hazır.

### ~~A2 · Not düğmesindeki amber nokta sabit~~ · YAPILDI

`<Tool label="Not" glyph="note" dot ... />` — `dot` koşulsuz veriliyor.

**Neden:** notu olmayan randevuda da "burada bir not var" diyor. Üçüncü boş
açılıştan sonra personel o noktaya bakmayı bırakıyor; nokta bir daha hiçbir
şey anlatamaz. `appointment.notes` doluluğuna bağlanacak.

### ~~A3 · İki ölü düğme~~ · YAPILDI

`Müşteriyi ara` ve `Müşteri kartı` (`kumanda.tsx:479`, `:481`) — `onPress`
yok. Karşılıkları hazır: telefon için `src/lib/phone.ts`, kart için
`app/(staff-flow)/customer.tsx` (müdür tarafında kullanılıyor).

### ~~A4 · Profildeki ölü satırlar~~ · YAPILDI

Personel 10 uygulandı (2026-09-05). `Görünüm` ve `Yasal` ortak gruba taşınan
gerçek ekranlara bağlandı (`app/(ortak)/profil/`); `Yazı boyutu`,
`Şifremi değiştir` ve `Yardım` **kaldırıldı** — pasif bırakılmadı.

### ~~A5 · Bildirim anahtarları hiçbir şey yapmıyor~~ · YAPILDI

Üç anahtar da **kaldırıldı** (2026-09-05); yerine tek bir `Foot` cümlesi
geldi ve nereye bakılacağını söylüyor: *"Bildirimler henüz gelmiyor. Yeni
randevularınızı Bugün sekmesinde görürsünüz."*

Kapalı-kısık bırakmak seçilmedi: anahtar yine hiçbir şey yapmazdı ve ekran
müşterinin gözü önünde açılabiliyor — kapalı duran bir "Randevu iptali"
anahtarı, iptallerin bildirilebildiği ama personelin kapattığı izlenimi
verirdi. `expo-notifications` girdiğinde (C1) cümlenin yerine üç **gerçek**
anahtar gelir; grubun yeri hazır.

---

## B · Tasarımda var, kodda yok

### ~~B1 · Çevrimdışı kuyruk şeridi (`.qb`)~~ · TASARLANDI ve YAZILDI

Personel 11 uygulandı (2026-09-05). Ağ yokken düğme artık yeşile DÖNMÜYOR:
"Sırada · gönderilmedi", amber çerçeve, dolgu yok, üstünde kuyruk şeridi ve
plakada `SIRADA`. `queued` hâli `sent`in kısık hâli değil.

**Bağlanma borcu:** hâlâ demo. `staff.visit.finish` çağrısı yapılınca
`{ queued: true }` → `queued`, `ApiError` → `error` olarak bağlanacak; yer
`kumanda.tsx`'teki gönderme zincirinde hazır.

### ~~B2 · Para maskesinin fitili~~ · YAPILDI

Tutar 6 sn sonra gizleniyor (kodda var) ama altındaki **incelen amber çizgi**
yok. Maskenin niye kaybolduğunu açıklayan tek şey o.

### B3 · Belirsizlik işareti (`.big.q`, `.big.qs`)

Kadranın büyük sayısının altına noktalı çizgi koyan hâl. Şu an her sayı
kesinmiş gibi duruyor.

### B5 · Vardiya ve izin — EKRAN VAR, uç yok

Veri iki tabloda duruyor ve ikisi de canlı:

    staff.working_hours   (008)  jsonb  { day, start, end, isOff }[]  · NULL = salonunki
    staff_time_off        (012)  (staff_id, date, reason) · UNIQUE(staff_id, date)

Ekranlar yazıldı (2026-09-05): vardiya kartı `personel/profile.tsx`'te,
yedi günlük ızgara `(staff-flow)/vardiyam.tsx`'te, karar katmanı
`src/lib/staffShift.ts`'te. **`staff-api` ikisini de hâlâ döndürmüyor** —
ekran `demoSource` ile çalışıyor. Uç yazıldığında değişecek tek şey o
fonksiyonun yerini alan çağrı.

**Neden:** kuaförde vardiya haftalık sorulan bir soru; cevabı bugün yalnız
müdürün ekranında. Tasarımı `docs/personel-10-profil.md` §2–§3'e girdi;
yedi günlük ızgara müdürün `profil/saatler.tsx`'inden devralınıyor, uç o
turdan sonra yazılacak.

Not: personel bunları **değiştiremez** — izin talebi için ne uç var ne
onay akışı. Ekran okunur olacak.

### B4 · Komşu iş uydurma

`Neighbour` her randevuda sabit "Zeynep Kaya · boya · 24 dk" gösteriyor.
Dört kademe (`.par` → `.w` → `.hot` → `.hot.zz`) doğru uygulanmış; veri
sahte ve **tekil** — gerçekte üç komşu iş birden olabilir. Sunucuya
bağlanınca çözülür.

---

## A6 · Alerji uyarısı · YAPILDI

Kimlik plakasında, adın yanında, üç evrede de görünen kırmızı işaret.
Dokununca 6 saniyelik satır açılıyor; tür maskesiz (`RİSK · ALERJİ`),
detay maskeli. Birden fazla kural varsa işaret bölünmüyor, açılan satır
sayıyı ve türleri söylüyor.

---

## C · Paket gerektirenler

> **2026-09-05:** `react-native-reanimated` (4.5.1) ve `react-native-worklets`
> kullanıcı kararıyla projeye girdi — gerekçesi kasaya gönderme anının hareket
> kısıtı dışına çıkarılması. `expo-doctor` 21/21 geçiyor, Expo Go içinde hazır
> geliyor, özel build gerekmiyor. **Yazılmış ekranlar taşınmıyor:** çalışan bir
> animasyonu yeniden yazmanın kazancı yok. `react-native-gesture-handler`
> HÂLÂ kurulu değil — o ayrı bir karar.


### C1 · `expo-notifications`

İki şeyi birden açar: profildeki üç anahtar (A5) ve **bekleme sayacının
gerçekten çalması**.

**Neden:** kumandanın en tehlikeli sözü. Boya süresi personelin eline
emanet ediliyor ama telefon kilitlenince hiçbir şey çalmıyor. Aşırı işlem
görmüş boya = yanmış saç. Bu çözülmeden ekran sahaya çıkamaz.

### C2 · `expo-keep-awake`

İşlem sürerken ekran uyanık kalsın, bitince serbest bıraksın.

**Neden:** eldiven boyalıyken Face ID açmak günde onlarca kez. Üç satır kod,
her gün hissedilen kazanç — listenin en iyi kâr/zarar oranı.

---

## D · Yapı

### D1 · Hiçbir personel ekranı sunucuya bağlı değil

`src/api/staff.ts` yazılmış, uçları hazır, testleri var — ama `app/` altında
onu kullanan **tek bir ekran yok**. Bugün `demoAgenda`'dan, Takvim
`mockDay`'den, Kazanç sabit dizilerden okuyor.

Bağlanınca üç şey birden çözülür: Takvim ile kumandanın kimlikleri uyuşur,
`app/personel/calendar.tsx` içindeki `ME = 'merve'` sabiti gerçek oturuma
döner, çevrimdışı kuyruğu anlam kazanır (B1).

### D2 · 1592 satır ölü ekran

Eski dört akış ekranı kumandanın yerini almasıyla öksüz kaldı; yalnız
birbirlerine referans veriyorlar:

    app/(staff-flow)/appointment.tsx   546
    app/(staff-flow)/visit.tsx         478
    app/(staff-flow)/finish.tsx        344
    app/(staff-flow)/sent.tsx          224

Silinmeli — yoksa bir sonraki tur yanlış dosyayı düzenler.

### D3 · Takvimin dört hâli çizilmedi

Personel Takvim'i sütunlu salon görünümüne geçti. Sütunlu ızgarada
karşılıkları olmayan davranışlar (testleri `skip`te bekliyor):

- boş gün ekranı
- yüklenme iskeleti
- ay ızgarası
- kaydırınca toplanan başlık

Çevrimdışı bandı ve aşağı çekip yenileme **geri getirildi**.

---

## E · Tasarım turu gerektirenler

### ~~E1 · Müşteriler sekmesi~~ · TASARLANDI ve YAZILDI

`app/personel/customers.tsx` bugün 14 satırlık bir yer tutucu.

Kapsam kararı verildi: **rehber değil, defter.** Personelin kendi baktığı
müşteriler; her satırda son geliş, son hizmet, formül işareti. Bakiye ve
tahsilat **girmez** — `staff-api` bunları bilinçli döndürmüyor.

Bağımlılık: **renk formülü kaydı olmadan bu sekme bir telefon rehberi.**
Kuaförün telefonunda zaten bir rehber var. Önce formülü *kaydetme*
(kumandada), sonra *okuma* (bu sekmede).

### ~~E2 · Renk formülü kaydı~~ · TASARLANDI ve YAZILDI

Araştırmanın en tekrar eden bulgusu: kolorist hizmetten sonra baz seviye,
kod, oksidan hacmi, gram, gerçek süre ve sonucu yazıyor. Sektör hâlâ basılı
formül defteri kullanıyor — yazılımlar bunu çözmüyor.

Adisyonda malzeme kalemleri yarısını zaten tutuyor (`Boya · 7.3 kumral`).
Eksik olan: **oran, süre, sonuç.**

Not: `visit.note` ucu da yok; not yazılıyor ama kaydolmuyor
(`kumanda.tsx:1046` bunu ekranda dürüstçe söylüyor).

### E3 · Kazanç sekmesi · **SEKME KALDIRILDI**, karar duruyor

Kullanıcı kararı (2026-09-05): **sekme çubuğundan kalktı.** Ekran silinmedi,
`app/(staff-flow)/kazanc.tsx`'e taşındı ve şu an HİÇBİR YERDEN erişilmiyor —
park edilmiş kod, ölü kontrol değil (hiçbir düğme oraya bakmıyor).

İki sebep üst üste bindi: gösterdiği tutar personelin eline geçen para değil
salon cirosu, ve sekme `staff_can_see_revenue` ile koşulluydu (varsayılan
KAPALI) — kabuk çoğu salonda dört, ayarı açanda beş sekme oluyordu. Sekme
çubuğu değişken olamaz.

**Hâlâ açık olan karar:** prim/komisyon sisteme girecek mi? Girmeyecekse
ekran Profil'de **"İşlerim"** satırı olarak geri gelir. Girecekse `staff`
tablosuna oran alanı gerekir ve `performance` ucu ona göre kurulur.


Bekleyen karar: **prim/komisyon sisteme girecek mi?**

- Girmeyecekse: sekme kalkar, içerik Profil'e bir satır olur, adı "Kazanç"
  değil **"İşlerim"** olur.
- Girecekse: `staff` tablosuna oran alanı gerekir ve `performance` ucu ona
  göre kurulur.

**Neden ad değişmeli:** `008_staff.sql`'de prim diye bir alan yok. Bugün
gösterilen `₺4.010` o personelin yaptığı işlerin **salon cirosu** — eline
geçen para değil. "Kazanç" demek yalan.

Ayrıca sekme `staff_can_see_revenue` ile koşullu ve **varsayılan kapalı**
(089): çoğu personelde kabuk 4 sekme, ayarı açan işletmede 5. Tab bar
değişken olamaz.


---

## Y · 2026-09-05'te yazılanlar

- `react-native-reanimated` 4.5.1 projeye girdi (yalnız Personel 11 için)
- `src/lib/sendToCash.ts` — yedi hâlli gönderme makinesi, 6 sn'lik pencere
- `src/components/SendToCash.tsx` — reanimated'in projedeki İLK kullanımı
- `src/lib/staffShift.ts` · `(staff-flow)/vardiyam.tsx` — Personel 10 vardiya
- `personel/profile.tsx` yeniden kuruldu (`ProfileParts` üstünde)
- `(ortak)/profil/` — Görünüm ve Yasal iki moda da açıldı
- Rota çakışması kapatıldı: `(manager)`/`(staff)` → `mudur`/`personel`
- `enterShell` · `roleGate` · `shellRoot` — rol sızıntısının dört kilidi
- Bugün ekranı şeritteki günü kendi içinde açıyor

## Z · 2026-09-04'te yazılanlar

- `supabase/090_visit_formula.sql` — `reservations.formula` jsonb
- `staff-api → visit.formula` · `customers` · `customer` (geçmiş satırına
  formül, kilit, kim yaptı)
- `mobile/src/lib/formula.ts` · `customerBook.ts` — saf karar katmanları
- `mobile/src/components/FormulaFields.tsx` — alt sayfa ve tam sayfanın
  ortak gövdesi
- `app/personel/customers.tsx` · `app/(staff-flow)/musteri.tsx` ·
  `app/(staff-flow)/formul.tsx`
- Kumanda: malzeme grubunun başlığı, pinlenen kopya, formül alt sayfası,
  plakada alerji işareti

**Cihazda doğrulandı** (iPhone 17 Pro simülatörü): alerji işareti ve fitili,
C evresinde başlığın amberden yeşile geçişi, formül alt sayfası, müşteri
sayfası, kilitli formül sayfası.

**Yol boyunca bulunan iki hata düzeltildi:**
1. `textTransform: 'uppercase'` dile duyarsız — `RİSK · ALERJİ` ekranda
   `RISK · ALERJI` oluyordu. Projenin `upperTR`'si kullanıldı.
2. Satır yüksekliği 1.02, büyük harfin üstündeki işareti kırpıyordu —
   `Öztürk` ekranda `Oztürk` görünüyordu. CSS kırpmıyor, RN kırpıyor.

**Hâlâ demo veriyle çalışıyor.** `D1` (ekranları sunucuya bağlama) duruyor.
