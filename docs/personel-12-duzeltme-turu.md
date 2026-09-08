# Personel 12 · düzeltme turu

**Effort: Medium.** Tur kabul edildi; üç madde kaldı.

---

Personel 12 (Ziyaretin formülü) turu **kabul edildi.** Tek gövde iki kabuk,
geçmişin etiket satırında yaşaması, eksik kaydetmenin iki ayrı cümlesi,
`± 5 dk`, `Düzelt`in bedelinin yazılması, gerçekten sayan sayaç satırı ve üç
yokluğun üç ayrı cümlesi — hepsi olduğu gibi kalıyor. Ölçüler denetlendi:
68 pt ızgara, 52 pt adım, 48 pt ton kelimeleri, 44 pt `Düzelt`. Hareket
sözleşmesi temiz.

Üç madde kaldı. Birincisi turun kendi ana fikriyle çelişiyor; ikincisi yanlış
bir bileşenin üstüne çizilmiş; üçüncüsü aritmetik.

---

## 1 · Liste dışı oran, karşılaştırmayı deliyor  ← asıl madde

Turun başlığı **karşılaştırma** ve karşılaştırma `formula.ratio` alanından
besleniyor: geçmiş satırı, etiketlerdeki fark, ızgaradaki "geçen sefer"
noktası — üçü de o alanı okuyor.

Ama oran üç değerde kaldı ve liste dışı oran **serbest nota** yazılıyor.
Sonuç şu: kuaför `1:2,5` kullandığı ziyarette `ratio` ya boş kalıyor ya
yanlış. Bir sonraki ziyarette geçmiş satırı **"geçen sefer 1:2"** diyecek —
oysa `1:2,5`'ti.

Ve bu tam olarak hatırlanmaya en değer ziyaret: **olağandışı olan.** Sık
kullanılan üç oranı zaten kimse unutmuyor; defterin var olma sebebi
istisnalar.

Aynı sorunu bekleme için **doğru çözdün**: `± 5 dk` gerçek değeri alanın
kendisine yazıyor, etiket `35 dk → 40 dk · liste dışı` diyor, kayıt dürüst
kalıyor. Oran için aynı şey yapılmadı.

**Dördüncü kutu itirazın kabul.** "Seyrek değer, sık kararın 68 puntosunu
alamaz" doğru ve o kısıt duruyor: varsayılan yerleşimde oran ızgarası
**üç kutu** kalmalı, fazladan tek punto yer tutmamalı.

Kendi dilbilgisinde bunun cevabı zaten iki kez var: hem `± 5 dk` hem ton
kelimeleri **yalnız seçimden sonra** beliriyor, yani varsayılan yerleşimde
sıfır yer tutuyor. Aynı kalıbı orana uygula ya da daha iyisini bul ve
gerekçelendir.

Çözerken bunlar geçerli:

- Gerçek değer `formula.ratio`'ya girmeli — serbest nota değil. Kayıt
  dürüst olmazsa karşılaştırma da olmaz.
- Klavye yok. Eller boyalı ve eldivenli.
- Varsayılan yerleşim büyümüyor; zorunlu dokunuş sayısı **dört** kalıyor.
- Oranın ikinci terimi sürekli bir eksen (kolorist "biraz daha oksidan" diye
  düşünüyor) ama birincisi hep 1. Sınır önerisi: `1:1` … `1:3`, 0,5 adım.
- Serbest notun etiketinden `liste dışı oran buraya` kalkıyor; not asıl
  işine dönüyor.

**Çizilecek:** oran alanının seçimden önceki ve sonraki hâli, liste dışı
değer seçilmiş hâli, ve bu satırın eklendiği karede gövdenin nasıl kaydığı.

---

## 2 · Gönderme uyarısı yanlış bileşenin üstünde

Amber satırın **yeri doğru** — gönderme güvertesinin içinde, engelleme yok,
ikinci onay yok. Cümle de doğru.

Ama altına çizdiğin düğme yanlış: sade bir *Adisyonu kasaya gönder*
düğmesi. Uygulamadaki gerçek bileşen **Personel 11'in yedi hâlli** gönderme
zinciri:

```
idle    turuncu düğme
window  6 saniye · fitil yanıyor · "Geri al" duruyor · İSTEK GÖNDERİLMEDİ
going   amber · "Gönderiliyor" · üç nokta
sent    yeşil · "Kasaya gönderildi"
sealed  sönük yeşil mühür
queued  çevrimdışı kuyrukta        (bugün ulaşılamaz)
error   sunucu reddetti            (bugün ulaşılamaz)
```

**Soru:** amber uyarı satırı bu zincirin neresinde duruyor, nerede düşüyor?

Dikkat edilecek nokta: `window` boyunca **hiçbir şey gönderilmemiş** ve
*Geri al* ekranda. Yani "kasaya gidince bu boşluk kalıcı olur" cümlesi o altı
saniye boyunca hâlâ doğru ve hâlâ eyleme çevrilebilir.

**Çizilecek:** uyarı satırının en az `idle` · `window` · `going` hâlleri.

---

## 3 · Sayılar tutmuyor

- **375 × 667**: başlıkta `%88 = 587 pt`, gerekçede `555 pt`. Gövde
  667 − 34 = 633 pt, %88'i ≈ **557 pt**. Hangisi doğru?
- Aynı karede `içerik 630 pt` ve `630 − 557 = 73 pt` kaydırma çıkıyor, ama
  metin `53 pt` diyor.
- Dokunuş sayısı bir tabloda **3**, cevaplarda **4**.

Üçünü de tek bir sayıya oturt.

---

## Değişmeyen kısıtlar

Önceki turun hepsi geçerli. Özellikle:

- Yalnız `opacity` · `translateX/Y` · `scale`. Yükseklik animasyonlanmıyor.
- Izgara **68 pt** — eldiven payı, küçülmüyor. Yeni kontroller 44 pt'nin
  altına inmiyor.
- Turuncu yalnız zaman ve eylem.
- Ölü kontrol yok, kısık düğme yok.
- `formula` alanları: `materials · ratio · waitMinutes · waitSource
  ('timer'|'manual') · result · note · staffId · writtenAt`. Bunun dışında
  bir alana ihtiyaç duyarsan **söyle ve etiketle** — jsonb olduğu için
  eklemek ucuz, ama sessizce varsayma. *(Ton kelimeleri için ayrı bir `tags`
  alanı zaten eklenecek; onu sen çözmene gerek yok.)*

Sözleşme dışına çıkan bir hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

## Çıktı

Yalnız değişen kareler, **koyu ve açık temada**, her ölçü yazılı:

1. Oran alanı — seçimden önce · seçimden sonra · liste dışı değer seçilmiş
2. Liste dışı oran seçilmiş **tam kare** (gövdenin kayması görünsün)
3. Gönderme uyarısı — `idle` · `window` · `going`
4. 375 × 667'de oran adımı açıkken sıkışma

Her karar için bir cümlelik gerekçe.

## Ekler

1. `Luera Mobil - Personel 12 Ziyaretin Formulu.html` — **düzeltilen tur**
2. `Luera Mobil - Personel 11 Kasaya Gonderme.html` — gerçek gönderme zinciri
3. `docs/personel-12-formul.md` — turun brief'i

**Effort: Medium.**
