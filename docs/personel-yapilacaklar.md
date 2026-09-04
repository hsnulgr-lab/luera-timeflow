# Personel modu — yapılacaklar

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

### A2 · Not düğmesindeki amber nokta sabit

`<Tool label="Not" glyph="note" dot ... />` — `dot` koşulsuz veriliyor.

**Neden:** notu olmayan randevuda da "burada bir not var" diyor. Üçüncü boş
açılıştan sonra personel o noktaya bakmayı bırakıyor; nokta bir daha hiçbir
şey anlatamaz. `appointment.notes` doluluğuna bağlanacak.

### A3 · İki ölü düğme

`Müşteriyi ara` ve `Müşteri kartı` (`kumanda.tsx:479`, `:481`) — `onPress`
yok. Karşılıkları hazır: telefon için `src/lib/phone.ts`, kart için
`app/(staff-flow)/customer.tsx` (müdür tarafında kullanılıyor).

### A4 · Profildeki ölü satırlar

`app/(staff)/profile.tsx` → `Tema`, `Yazı boyutu`, `Şifremi değiştir`,
`Yardım`. Dördü de `Pressable`, dördünde de ok işareti, hiçbirinde `onPress`
yok. Ya bağlanacak ya ok işareti kalkacak.

### A5 · Bildirim anahtarları hiçbir şey yapmıyor

`profile.tsx` → üç anahtar (yeni randevu · iptal · günün özeti).
`expo-notifications` **kurulu değil**. Ya paket kurulacak (bkz. C1) ya da
anahtarlar kaldırılacak. Ortası yok.

---

## B · Tasarımda var, kodda yok

### B1 · Çevrimdışı kuyruk şeridi (`.qb`)

Amber şerit: **"SIRADA 2 YAZMA"**, gönderilince yeşile dönüp "gönderildi"
der.

**Neden:** bodrum katta çalışan personel için "işlemi başlattım ama gitti
mi?" sorusunun tek cevabı. Veri hazır: `src/api/staff.ts` kuyruğu tutuyor,
`useConnectivity` çalışıyor (`app/(staff)/calendar.tsx` kullanıyor).

### B2 · Para maskesinin fitili (`.fuse`)

Tutar 6 sn sonra gizleniyor (kodda var) ama altındaki **incelen amber çizgi**
yok. Maskenin niye kaybolduğunu açıklayan tek şey o.

### B3 · Belirsizlik işareti (`.big.q`, `.big.qs`)

Kadranın büyük sayısının altına noktalı çizgi koyan hâl. Şu an her sayı
kesinmiş gibi duruyor.

### B4 · Komşu iş uydurma

`Neighbour` her randevuda sabit "Zeynep Kaya · boya · 24 dk" gösteriyor.
Dört kademe (`.par` → `.w` → `.hot` → `.hot.zz`) doğru uygulanmış; veri
sahte ve **tekil** — gerçekte üç komşu iş birden olabilir. Sunucuya
bağlanınca çözülür.

---

## C · Paket gerektirenler

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
`app/(staff)/calendar.tsx` içindeki `ME = 'merve'` sabiti gerçek oturuma
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

### E1 · Müşteriler sekmesi — hiç tasarlanmadı

`app/(staff)/customers.tsx` bugün 14 satırlık bir yer tutucu.

Kapsam kararı verildi: **rehber değil, defter.** Personelin kendi baktığı
müşteriler; her satırda son geliş, son hizmet, formül işareti. Bakiye ve
tahsilat **girmez** — `staff-api` bunları bilinçli döndürmüyor.

Bağımlılık: **renk formülü kaydı olmadan bu sekme bir telefon rehberi.**
Kuaförün telefonunda zaten bir rehber var. Önce formülü *kaydetme*
(kumandada), sonra *okuma* (bu sekmede).

### E2 · Renk formülü kaydı

Araştırmanın en tekrar eden bulgusu: kolorist hizmetten sonra baz seviye,
kod, oksidan hacmi, gram, gerçek süre ve sonucu yazıyor. Sektör hâlâ basılı
formül defteri kullanıyor — yazılımlar bunu çözmüyor.

Adisyonda malzeme kalemleri yarısını zaten tutuyor (`Boya · 7.3 kumral`).
Eksik olan: **oran, süre, sonuç.**

Not: `visit.note` ucu da yok; not yazılıyor ama kaydolmuyor
(`kumanda.tsx:1046` bunu ekranda dürüstçe söylüyor).

### E3 · Kazanç sekmesinin geleceği

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
