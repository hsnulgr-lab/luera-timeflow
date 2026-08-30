# Personel 01 · Bugün — personelin gün akışı

Bu, personel modunun **ilk tasarım turu**. Mevcut ekran
`Luera Mobil - Kumanda.html` içindeki **Personel 04 / 05**'in uygulaması ve
**değiştiriliyor** — sıfırdan değil, yönü değişerek.

**Effort: High.**

---

## 0 · Ne değişiyor, ne kalıyor

**Değişiyor:** Personel 04'ün iki kararı bırakılıyor.

| Eski karar | Yerine |
|---|---|
| "Ekranın yarısı sıradaki randevu ve tek buton" | Tek tip sıra: her randevu aynı biçimde, rayda alt alta |
| "En fazla dört satır, fazlası tümünü gör ile" | Günün tamamı; bitenler katlanmış tek satırda |

**Kalıyor:** kumanda felsefesi. Personel modu bir *cep masaüstü* değil bir
**kumanda**: az düğme, büyük düğme, tek yol, en fazla iki seviye derinlik.
Yeni yerleşim daha çok BİLGİ gösteriyor; daha çok EYLEM göstermiyor.

---

## 1 · Ekranın işi ve kullanıcısı

Personel telefonu **bilgi almak için değil, iş yapmak için** açıyor. Müdürden
dört fiziksel farkı var ve tasarımın girdisi bunlar:

**Eller dolu.** Islak, boyalı, eldivenli. İki elle kullanılan hiçbir şey
çalışmaz, hassas jest çalışmaz. **Dokunma hedefi müdürdekinden BÜYÜK olmalı**
— müdürde taban 44 pt; burada 44 tavan değil taban bile sayılmaz.

**Ekran MÜŞTERİNİN GÖZÜ ÖNÜNDE.** Telefon koltuğun yanında duruyor. Müdürde
olmayan bu kısıt, kartın içeriğini doğrudan belirliyor: alerji notu, bakiye,
salon notu ve geçmiş gelmeme sayısı **açıkça yazılamaz**.

**Telefon cebe girip çıkıyor**, vardiya boyunca onlarca kez. Ekran her
açılışta aynı yerden devam etmeli; müşterinin önünde "neredeydim" aranmaz.

**Bodrum kat, kötü sinyal.** Yazma isteklerinin çevrimdışı kuyruğu ZATEN
YAZILI (`src/api/staff.ts`) ama arayüz karşılığı yok.

**Ekranın cevaplaması gereken altı soru:**
1. Sıradaki kim, ne zaman, ne yapacağım?
2. Geldi mi? *(vardiyanın en kritik anı)*
3. Bu müşteride bilmem gereken bir şey var mı?
4. Şu an ne kadardır çalışıyorum, planlanandan uzadım mı?
5. Bugün kaç işim kaldı? *(mola planlamak için)*
6. Bunu yaptım mı? *(aynı işi iki kez başlatmamak için)*

Bugünkü ekran 1'i kısmen, 3'ü kısmen, 5'i kısmen cevaplıyor. **2, 4 ve 6'yı
hiç cevaplamıyor.**

---

## 2 · ZATEN YAZILMIŞ — yeniden çizme, bunları devral

Bu turun en önemli maddesi. Aşağıdakiler kodda çalışıyor ve müdür tarafında
kullanılıyor; personel ekranı bunları **aynen** kullanacak. İki mod aynı ürün.

| Parça | Ne yapar | Referans |
|---|---|---|
| `DayHeader` | `Paz.` + turuncu nokta + sönük `30` | Müdür akış başlığı |
| `DayScrubber` | 7 günlük şerit + cetvel, hap ortada | `Mudur 19 Gun Cetveli.html` |
| `NowLine` | **Turuncu saat hapı + saç teli** | `Takvim.html` |
| `nowLineAfter()` | Çizgi hangi randevudan SONRA gelir | saf fonksiyon |
| `DayEnd` | "Günün sonu" ayracı | `Takvim.html` |
| `StaffShiftBarView` | Vardiya çubuğu + o anki konum | `Mudur 24 Personel Gunu.html` |
| `StaffAppointmentRow` | Rayda tek randevu satırı | aynı |
| `staffDay.ts` | Saf karar katmanı | — |

`staffDay.ts` şunları ZATEN modelliyor: `runningAppointment` ·
`upcomingAppointments` · `pastAppointments` · `showNowLine` · `nowLineTime` ·
`shift` · `isDayEnded` · `emptyNote`.

> **Yani referans görsellerdeki turuncu "12:36" çizgisi, vardiya çubuğu ve
> ray üzerinde sıralanan randevular bu projede çizilmiş durumda.** Senin işin
> onları yeniden icat etmek değil, personelin kendi günü için **eylemli** hâle
> getirmek.

---

## 3 · Verilen kararlar — bunları tartışma

1. **Kahraman kart YOK.** Her randevu aynı biçimde, rayda alt alta. Sıradaki
   olan vurgulu ama ayrı bir kart değil.
2. **Hafta şeridi var**, dokununca o güne geçer.
3. **Uyarılar görünür, içerikleri dokununca açılır** (müşteri kısıtı).
4. **Bugün bitenler katlanmış tek satırda** durur, dokununca açılır.

---

## 4 · Tasarlanacaklar

### A · Satırın anatomisi

Tek bir satır biçimi, çok sayıda hâl. Solda saat rayı, sağda içerik — müdürün
akışıyla aynı dil.

Satır **en az** şunları taşıyor: saat · müşteri adı · hizmet · süre. Fazlası
hâle bağlı.

### B · Randevunun hâlleri — turun asıl çıktısı

Bugünkü ekranın tek hâli var. Verinin desteklediği hâller:

| Hâl | Veri kaynağı |
|---|---|
| Gelecek, müşteri henüz gelmedi | `start_time` > şimdi |
| Saat geçti, müşteri gelmedi | `start_time` < şimdi, damga yok |
| **Müşteri geldi, başlanabilir** | `customer_arrived_at` *(uca eklenecek)* |
| İşlem sürüyor | `arrived_at` dolu, `service_ended_at` boş |
| Planlanandan uzadı | süre aşımı |
| Bitti, adisyon gönderilmedi | `service_ended_at` dolu, `adisyon_items` boş |
| Bitti, kasaya gitti | `adisyon_items` dolu |
| Tahsil edildi | `is_paid` |
| İptal | `status = 'cancelled'` |

Her hâl **kendi kelimesini** söylemeli. Renk tek başına anlam taşımaz.

### C · Birincil eylem nerede yaşıyor — **turun en zor sorusu**

Eski tasarımda "İşleme başla" 66 pt'lik bir butondu, tab bar'ın hemen üstünde,
başparmak bölgesinde. Kahraman kart kalkınca o buton da kalktı.

Ama eylem hâlâ **tek ve en erişilebilir** olmalı — üstelik eller dolu.
Seçenekler ve bedelleri:

- **Satırın içinde**: doğru randevuya bağlı ama kaydırınca ekrandan çıkabilir
- **Altta sabit bir çubukta**: hep erişilebilir ama hangi randevuya ait olduğu
  ayrıca söylenmeli
- **İkisi birden**: satırda küçük, altta büyük — tekrar mı, yoksa iyi mi?

**Kararı sen ver ve gerekçelendir.** Aynı anda birden fazla satır eylem
gösterebilir mi, yoksa yalnız bir tane mi? (Örnek: bir müşteri işlemde, öteki
kapıda bekliyor.)

### D · Şimdi çizgisi ve boşluklar

`NowLine` var. Ama iki randevu arasında **iki saat boşluk** varsa ekran ne
diyor? Boşluk bir bilgi mi (mola planlanır), yoksa görmezden mi gelinir?
Gün henüz başlamadıysa çizgi nerede durur?

### E · Yapılanlar — katlanmış satır

Bugün bitenler tek satırda: kaç iş, ne kadar sürede, kaçı kasaya gitti.
Dokununca açılır. Açılma ve kapanma **yükseklik animasyonu değil** (sözleşme
yasaklıyor) — nasıl çözülür?

Bu satır "hata yapma ihtimalini ortadan kaldırma"nın merkezi: personel aynı
işi iki kez başlatmasın, adisyonu gönderdiğini görsün.

### F · Gün şeridinin noktaları

Referansta günlerin altında nokta var: o gün randevu olduğunu söylüyor.
`DayScrubber`'da bugün **yok**. Nokta mı, sayı mı, yoğunluk çubuğu mu?
Bugünün kendisi nasıl ayrışır, seçili gün nasıl ayrışır — **iki ayrı işaret
gerekiyor** ve karışmamalı.

### G · Uyarılar müşterinin gözü önünde

Alerji notu, bakiye, paket, ilk ziyaret. Rozet ne kadar bilgi verir? "Alerji
notu var" bile fazla mı — sadece bir işaret mi olmalı? Açılınca ne oluyor:
sayfa mı, alt sayfa mı, satırın kendisi mi büyüyor?

**İlk ziyaret bir uyarı DEĞİL**, iyi haberdir; ayrı bir ağırlıkta durmalı.

### H · Boş hâller

Bugün randevu yok · vardiya bugün yok (izinli) · gün bitti · henüz başlamadı.
Dördü ayrı cümle; hiçbiri boş bir ekran değil.

### I · Hareket

Ekran açılışı, gün değişimi, satırın hâl değiştirmesi (geldi → sürüyor →
bitti), yapılanların açılması, şimdi çizgisinin ilerlemesi.

---

## 5 · Değişmeyecek kısıtlar

**Uygulama React Native ile yazılıyor, SwiftUI ile değil.** Hedef iOS 26'nın
yerli hissi (alt bar gerçek Liquid Glass, sistem materyalleri) ama çizim
katmanı RN. Bu yüzden hareket sözleşmesi katı:

- **Yalnız `opacity`, `translateX/Y`, `scale`** — hepsi native sürücüde.
  Yükseklik, genişlik, renk, yarıçap ve gölge **animasyonlanamaz**. Renk
  değişimi = üst üste iki katmanın çapraz sönmesi.
- **`LayoutAnimation` yasak.** (Bugünkü personel ekranlarının üçü ihlal
  ediyor; bu turda düzelecek.)
- **`react-native-reanimated` ve `react-native-gesture-handler` kurulu değil
  ve kurulmayacak.** RN'in kendi `Animated`'i, `Animated.spring`,
  `Animated.stagger` ve `PanResponder` var.
- **Dokunma hedefi 44 pt'nin altına inmez** — burada tabandır, hedef değil.
- **Turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM.** Durum rengi değil. Risk
  `#E07272`/`#C94040`, amber `#D9A43B`/`#B87A00`, yeşil `#5FBF64`/`#2D8F32`.
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Krom yok:** araç çubuğu, filtre satırı, sekme grubu girmez.
- **Kurallar VERİDEN türer, moddan değil.** "Şu kadar randevu varsa şu düzen"
  gibi bir eşik yok: eşik, sayı değişince listeyi yeniden dizer. Tek meşru
  kırılma **sıfır**.
- **Ölü kontrol yok, sahte onay yok.** Sıfır bir ölçümdür, boş bir gapdir;
  ikisi aynı şey değildir.

---

## 6 · Cevaplamanı istediğim sorular

1. **Birincil eylem nerede yaşıyor** ve aynı anda kaç satır eylem gösterebilir?
2. Kahraman kart olmadan **"sıradaki" nasıl ayrışır** — ve müşteri geldiğinde
   o vurgu değişir mi?
3. Uyarı rozeti **görünür ama okunmaz** nasıl olur?
4. İki randevu arasındaki boşluk anlatılır mı?
5. Gün şeridi ile alttaki **"Takvim" sekmesinin iş bölümü** ne? İkisi aynı işi
   yapıyorsa biri fazladır — hangisi?
6. Eller doluyken dokunma hedefi kaç olmalı, ve yanlış satıra basmayı ne
   engelliyor?
7. Çevrimdışı kuyruk satırda nasıl görünür? ("sıraya alındı" bir hâl mi?)
8. Bütün bunlar 375 × 667'lik küçük telefonda ne oluyor?

Sözleşme dışına çıkan bir hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 7 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **Sabah 09:00** — gün başlamadı, 5 randevu önde, hiçbiri bitmemiş
2. **Öğlen 12:36** — 2 iş bitmiş (katlanmış), 1 müşteri geldi bekliyor,
   1 işlem sürüyor, 2 randevu önde ← **ana kare**
3. **Akşam 18:20** — hepsi bitmiş, gün sonu
4. Yapılanlar satırının **açılmış** hâli
5. Uyarı rozetinin **açılmış** hâli
6. Satırın dokuz hâlinin tek tek çizimi
7. Boş hâller: randevu yok · izinli · gün bitti
8. Gün şeridi: bugün · seçili gün · randevusuz gün
9. `reduceMotion` hâli
10. 375 × 667 sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 8 · Ekler ve kutuya yazılacaklar

**Ekler:**
1. `docs/design-reference/Luera Mobil - Kumanda.html` — değiştirilen tasarım
2. `docs/design-reference/Luera Mobil - Mudur 24 Personel Gunu.html` —
   **devralınacak yerleşim**
3. `docs/design-reference/Luera Mobil - Mudur 19 Gun Cetveli.html` — gün şeridi
4. `docs/design-reference/Luera Mobil - Takvim.html` — şimdi çizgisi ve gün sonu
5. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`
6. `docs/design-reference/Luera Mobil - Durumlar.html`
7. Kullanıcının gönderdiği 6 referans görseli
8. Cihazdan alınmış bugünkü "Bugün" ekranı görüntüsü

**Kutuya yazılacak cümle:**
> Personel modunun ilk turu. Mevcut "Bugün" ekranını (Kumanda.html · Personel
> 04/05) değiştiriyoruz: kahraman kart kalkıyor, günün tamamı rayda tek tip
> sıra hâlinde. Yerleşimi Müdür 24'ten devral, şimdi çizgisini Takvim'den al.
> Turun asıl çıktısı **randevunun dokuz hâli** ve **birincil eylemin nerede
> yaşayacağı**. Ekran müşterinin gözü önünde kullanılıyor ve personelin elleri
> dolu — ikisi de tasarımın girdisi.

**Effort: High.**

---

## Doğrulama

Bu bir **tasarım** turu; kod doğrulaması yok. Tasarım döndüğünde ölçeceklerim:

- Önerilen her hareketin sözleşme içinde olduğu (yalnız opacity/translate/scale)
- Dokunma hedeflerinin 44 pt'nin ALTINA inmediği
- Devralınan bileşenlerin (`NowLine`, `DayScrubber`, `StaffShiftBarView`)
  ölçülerinin korunduğu — iki mod aynı ürün
- Turuncunun yalnız zaman ve eylemde kullanıldığı
- Dokuz hâlin dokuzunun da çizilmiş olduğu
- `reduceMotion` hâlinde bilginin durmadığı
