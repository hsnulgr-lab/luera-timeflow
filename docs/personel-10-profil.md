# Personel 10 · Profil

**Bu bir keşif turu DEĞİL, uyarlama turu.** Ekran zaten çizildi — Müdür 27'de.
Senin işin onu yeniden tasarlamak değil, **personelin ihtiyacına göre
uyarlamak**: hangi satır kalır, hangisi düşer, personele özel olan ne eklenir.

**Effort: Medium.**

---

## 0 · Kural: aynı parçalar, farklı içerik

Müdür profili paylaşılan bir kütüphane üstünde duruyor:
`src/components/ProfileParts.tsx` → `ProfileHead` · `TodayCard` · `Group` ·
`ProfileRow` · `SwitchRow` · `Foot` · `ProfileNav` · `Chevron` · `CheckIcon`.

**Bu bileşenler AYNEN kullanılacak.** Ölçüleri, ritmi, boşlukları
değiştirilmeyecek. Yeni bir satır biçimi, yeni bir başlık tipi, yeni bir kart
İCAT EDİLMEYECEK. İhtiyacın olan bir parça kütüphanede yoksa **çizme, söyle**.

Sebep: iki mod aynı ürün. Personel profili müdürünkine *benzemek* için değil,
**aynı parçalardan yapıldığı için** tutmalı. Bugünkü personel profili bu
kütüphaneden ÖNCE yazılmış — kendi başlık çubuğunu, kendi bölüm başlığını,
kendi anahtarını yeniden çizmiş. 340 satır; müdürünki aynı işi 161'de yapıyor.
Fark bir tasarım kararı değil, bir zamanlama kazası. Bu tur onu kapatıyor.

---

## 1 · Satır satır: müdürde ne var, personelde ne olur

| Müdür 27 | Personel | Karar |
|---|---|---|
| `ProfileHead` — PROFİL / Studio Ayla / Kadıköy | **aynı bileşen**, ad ve alt satır değişir | verildi |
| `TodayCard` — 09:00–21:00, salon açık mı | **vardiya kartı** — personelin kendi saatleri | verildi |
| Çalışma saatleri → `profil/saatler` | **Vardiyam** → aynı yedi günlük ızgara | verildi |
| Hizmetler ve fiyatlar | **yok** — fiyat müdürün işi | verildi |
| Hesap | var | verildi |
| Görünüm | var, **gerçekten bağlanacak** | verildi |
| Bildirimler | var ama anahtarlar sahte — §3·B | **turun sorusu** |
| Yasal | var | verildi |
| — | **Cihaz** — telefon işletmeye bağlı | personele özel |

Personel profilinde **bugün olup da kalkacak olan** iki şey:

- **76 pt turuncu avatar diski.** Müdürün `ProfileHead`'inde avatar yok:
  "PROFİL" üst etiketi, ad, alt satır. Aynı ekran olacaksa disk kalkar.
- **`Yazı boyutu · Normal` satırı.** Telefonun ayarını izliyor, uygulamanın
  ayrı bir kontrolü yok; satır yalnız bunu ilan ediyordu.

---

## 2 · Devralınacak ikinci ekran: yedi günlük ızgara

`app/(manager-flow)/profil/saatler.tsx` yedi günü **tek ekranda** çiziyor —
`52 + (7 × 60) = 472 pt`, 375 pt'lik telefonda bile kaydırma yok. Bugünün
satırında turuncu omurga var. Personelin "Vardiyam" ekranı **bu ızgaranın
kendisi**, yeniden çizilmeyecek.

Uyarlanacak olan üç şey:

1. **Satırın üçüncü hâli.** Müdürde bir gün ya açık ya kapalı. Personelde üç
   hâl var: *çalışıyor (saatiyle)* · *düzenli izin günü* · **salonun
   saatlerini kullanıyor** (bkz. §3·A).
2. **İkinci katman: tarihe bağlı izin.** Bir gün hem "normalde çalışılan gün"
   hem "bu hafta izinli" olabiliyor. İki katman aynı ızgarada nasıl okunur?
3. **Düzenlenemez.** Müdür satıra dokunup saati değiştiriyor; personel
   değiştiremez (§3·C).

---

## 3 · Personele özel olan — turun asıl işi

### A · `working_hours` NULL = "salonun saatlerini kullanıyor"

`staff.working_hours` (`008_staff.sql`), jsonb:

    { day: 0–6, start: "09:00", end: "18:00", isOff: true|false }[]

`NULL` ise personelin ayrı saati **yok**; salonunkini (`settings.working_hours`,
aynı biçim) kullanıyor.

> **Bu "salonla aynı saatler" DEMEK DEĞİL.** Salon saatini değiştirince
> personelinki de değişir. Ekran bu farkı söylemek zorunda, yoksa dondurulmuş
> bir kopya sanılır. Bu bir cümle işi, bir kutu işi değil.

### B · Tarihe bağlı izin

`staff_time_off` (`012_staff_time_off.sql`): `(staff_id, date, reason)`,
`UNIQUE(staff_id, date)` — **gün gün** tutuluyor.

**"İzin başlangıcı / bitişi" diye kolon YOK.** Dönüş tarihi bir veri değil,
bir çıkarım (`src/lib/staffDay.ts → returnDateISO`) ve üç hâlde türetilemiyor:
liste bilinmiyor · bugün listede yok · dizi bilinen ufkun sonuna kadar sürüyor.
Türetilemiyorsa **cümle kurulmaz** — proje bu kararı `returnLine`'da zaten
böyle vermiş, sen de aynısını yap.

`reason` alanı dolu olabilir. **Gösterilecek mi?** Bu ekran müşterinin gözü
önünde açılabiliyor; "raporlu" yazan bir satır orada durmalı mı? — **soru**

### C · Personel bunu DEĞİŞTİREMEZ

Vardiyayı müdür belirler, izni müdür girer. Personel tarafında ne bir uç var
ne bir onay akışı: **"İzin iste" düğmesi çizilirse ölü doğar.**

Müdürde ızgara satırı dokunulabilir ve saat düzenleyiciyi açıyor. Personelde
dokunulamayacak. Ekran bunu nasıl söyleyecek?

- **Hiç söylemez** — okunur liste, sessiz. Kullanıcı neden dokunamadığını
  anlamaz.
- **Bir kez söyler** — ızgaranın altında tek cümle (`Foot` bileşeni var).
- **Bir eylem verir** — "İşletmeyi ara". Telefon numarası `staff-api`'de yok;
  eklenmesi gerekir.

**Kararı sen ver.** "Ölü kontrol yok" kuralı burada en görünür yerde
sınanıyor: yapılamayan görünmez, ama **sebebi görünür**.

### D · Bildirim anahtarları sahte

Üç anahtar: yeni randevu · iptal · günün özeti. **Üçü de hiçbir şey yapmıyor.**
`expo-notifications` projede kurulu değil; bildirim gelmiyor ve gelemez.

İki yol var, ortası yok:
1. Anahtarlar **ekrandan kalkar**, yerine bildirimlerin henüz gelmediğini
   söyleyen bir cümle.
2. Anahtarlar kalır ama **kapalı ve kısık** durur, "yakında" der.

Hangisi — ve o alan ekranda ne kadar yer kaplar, bugünkü gibi üç tam satır mı,
tek satır mı? — **soru**

> Bu ekran müşterinin gözü önünde açılabiliyor. Sahte bir anahtar burada
> yalnız kullanıcıyı değil, **müşterinin gördüğü ürünü** de yanıltıyor.

### E · Cihaz bölümü

Personel modunun müdürde karşılığı olmayan tek bölümü:

- Telefonun bağlı olduğu işletme
- **Oturumu kapat** — geri dönüşü pahalı: personel çıkarsa telefonu yeniden
  bağlamak için işletmeden **yeni bir kod** istemesi gerekiyor. Bugün bu
  yalnız alt ekranda, küçük gri bir cümlede yazıyor.
- `PIN'i değiştir` — **bugün ölü**: satır var, `onPress` boş, hedef ekran yok
  ve sunucu tarafı da yok. Ekran çizilirse uygulanamaz.

Bu uyarı ne zaman görünür: satırda mı, dokunduktan sonra mı? — **soru**

---

## 4 · Kapalı veri listesi

**Bu listede olmayan hiçbir alanı icat etme.**

**Oturumdan** (`AuthSession`, bugün geliyor): `profile.name` ·
`profile.initials` · `profile.title` (Kuaför, Estetisyen…) ·
`profile.business.name` · `profile.business.location` · `biometricEnabled`

**Sunucudan** (`staff-api → me`, bugün geliyor): `staff.id` · `staff.name` ·
`staff.color` · `staff.role`

**Vardiya ve izin** (tablolar canlı, **uç henüz yok** — bu turdan sonra
yazılacak): `staff.working_hours` · `staff_time_off` · `settings.working_hours`

**Olmayan ve İCAT EDİLMEYECEK olan:**

- İşe giriş tarihi, kıdem, yıllık izin **hakkı** — tablo yok
- **İzin talebi** — uç, tablo, onay akışı hiçbiri yok
- Prim oranı — `008_staff.sql`'de alan yok
- Aylık/haftalık istatistik — `performance` ucu var ama
  `staff_can_see_revenue` kapalıyken 403 dönüyor, **varsayılan kapalı**
- Profil fotoğrafı — yükleme ucu yok
- **"İşlerim" / kazanç satırı** — prim kararı bu turun dışında, dokunulmayacak

---

## 5 · Boş ve kenar hâller

- `working_hours` **NULL** — salonun saatlerini kullanıyor
- Bugün izinli · bu hafta hiç çalışma günü yok
- İzin dizisi ufkun sonuna kadar sürüyor — **dönüş tarihi yok**
- `staff_time_off.reason` boş
- `profile.title` yok (rol girilmemiş)
- İşletme adı çok uzun
- Oturum okunurken (bugün: boş zemin)

---

## 6 · Değişmeyecek kısıtlar

- **React Native**, SwiftUI değil. Yalnız `opacity`, `translateX/Y`, `scale`;
  hepsi native sürücüde. Yükseklik, genişlik, renk, yarıçap ve gölge
  **animasyonlanamaz**; renk değişimi = iki katmanın çapraz sönmesi.
- **`LayoutAnimation` yasak.** `react-native-reanimated` ve
  `react-native-gesture-handler` **kurulu değil ve kurulmayacak**.
- **`expo-notifications` kurulu DEĞİL** (bkz. §3·D).
- Dokunma hedefi **44 pt'nin altına inmez**.
- **Turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM.** Durum rengi değil. Risk
  `#E07272`/`#C94040`, amber `#D9A43B`/`#B87A00`, yeşil `#5FBF64`/`#2D8F32`.
- **Türkçe büyük harf `textTransform` ile yapılmaz** — `İ`/`I` bozuluyor.
  Projede `upperTR` var.
- **Ölü kontrol yok, sahte onay yok.** Ok işareti olan satır bir yere gitmeli;
  anahtar bir şey değiştirmeli.
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**

---

## 7 · Cevaplamanı istediğim beş soru

Gerisi karara bağlandı; yalnız bunlar açık:

1. **Vardiya kartı** ne söylüyor ve dokunulabilir mi? Müdürünki çalışma
   saatlerine gidiyordu; burada gidilecek yer "Vardiyam" ekranı — ama personel
   orada hiçbir şeyi değiştiremiyor. Dokunulabilir olması yalan mı?
2. Haftalık vardiya ile **tarihe bağlı izin aynı ızgarada** nasıl okunur?
3. `working_hours` NULL — "salonun saatlerini kullanıyor" nasıl söylenir ki
   "salonla aynı saatler" sanılmasın?
4. Sahte **bildirim anahtarları** kalksın mı, kısılsın mı?
5. "Bunu değiştiremezsin" **ne zaman ve kaç kez** söylenir?

Sözleşme dışına çıkan bir hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 8 · Çıktı

**Koyu ve açık temada**, her ölçü yazılı:

1. **Profilin tam hâli** — ana kare, müdürünkiyle yan yana konabilecek
2. **Vardiya kartının dört hâli**: vardiyada · başlamadı · bitti · bugün izinli
3. **"Vardiyam" ekranı** — yedi gün, üç hâl, üstünde tarihe bağlı izinler
4. `working_hours` NULL hâli
5. İzin dizisi: dönüş tarihi bilinen hâl · bilinmeyen hâl
6. Bildirimler alanının seçtiğin çözümü
7. Cihaz bölümü ve oturumu kapatma anı
8. Boş hâller (§5)
9. `reduceMotion` hâli
10. 375 × 667 sıkışması

Her karar için **bir cümlelik gerekçe**. Uzun analiz istemiyorum — bu bir
uyarlama turu.

---

## 9 · Ekler ve kutuya yazılacaklar

**Ekler:**
1. `docs/design-reference/Luera Mobil - Mudur 27 Profil.html` —
   **devralınacak ekran**
2. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`
3. `docs/design-reference/Luera Mobil - Durumlar.html`
4. Cihazdan alınmış **müdür Profil** ekranı görüntüsü
5. Cihazdan alınmış **personel Profil** ekranı görüntüsü (bugünkü hâli)

**Kutuya yazılacak cümle:**
> Personelin Profil sekmesini **Müdür 27'nin aynısı** yapıyoruz — aynı
> bileşenler, aynı ölçüler, aynı ritim — yalnız içeriği personelin ihtiyacına
> göre değişiyor: hizmet ve fiyat satırları düşüyor, yerine **vardiya** ve
> **cihaz bağlantısı** geliyor. Yedi günlük çalışma saati ızgarası müdürde
> zaten çizilmiş; personelin "Vardiyam" ekranı onun uyarlaması olacak — tek
> farkı üçüncü bir gün hâli (salonun saatlerini kullanıyor), üstüne binen
> tarihe bağlı izinler, ve personelin hiçbirini değiştirememesi. Bu bir keşif
> turu değil; yeni bileşen icat etme, eksik olanı söyle. Ekran müşterinin gözü
> önünde açılabiliyor.

**Effort: Medium.**

---

## Doğrulama

Tasarım döndüğünde ölçeceklerim:

- **`ProfileParts` bileşenlerinin ölçülerinin değişmediği** — iki ekran yan
  yana konduğunda aynı ürün görünüyor mu
- Yeni bir satır biçimi / kart / başlık tipi icat edilmediği
- Yedi günlük ızgaranın `saatler.tsx`'in ölçülerini koruduğu
- Dokunma hedeflerinin 44 pt'nin ALTINA inmediği
- Turuncunun yalnız zaman ve eylemde kullanıldığı
- **Tek bir ölü kontrolün kalmadığı**
- Kapalı veri listesinin dışına çıkılmadığı — özellikle **izin talebi**,
  **izin hakkı** ve **kazanç** icat edilmediği
- `working_hours` NULL hâlinin "salonla aynı saatler" diye okunmadığı
- `reduceMotion` hâlinde bilginin durmadığı
