# Mobil · Sonraya bırakılanlar

Rafa kaldırılmış işler. Her madde: **ne**, **neden bekliyor**, **devam edilecek yer**.

---

## 1 · Giriş ekranı v2 (karşılama + dönüş girişi)

**Durum:** brief yazıldı, bir tur çıktı alındı, **beğenilmedi.**

Çıktının sorunu: ortadaki alan soluk yatay çizgilerden bir "gün cetveli
hayaleti" ile doldurulmuştu — karar gibi değil, ekran hatası gibi duruyordu.
Açık temada ortada dikey beyaz bir yıkama krem zemini ikiye bölüyordu. İki
kapıya eklenen çizgi ikonu (müdür çok satır / personel tek satır) iyi bir
fikirdi ama okunmayacak kadar soluk çizilmişti.

**Brief'in kendi hatası:** "premium" deniyor ama *Luera'nın* premium'unun neye
benzediği hiç tarif edilmiyor. Tasarım da güvenli olana kaçıyor.

**Devam edilecek yer:** üç yön önerildi, karar verilmedi —

1. **Ürünün kendisi** — ortada tam kontrastlı, okunan bir Luera parçası
   (randevu kartı, personel halkası); hayalet değil.
2. **Işık ve malzeme** — yavaşça kayan turuncu huzme, katmanlı gradyan; soyut.
3. **Tipografi kahraman** — ortada resim yok, dev bir cümle; kelimeler sırayla
   giriyor.

Yön seçilince brief'e o bölüm eklenip ikinci tur atılacak.

**Dosya:** [giris-v2-claude-design-prompt.md](giris-v2-claude-design-prompt.md)

**Not:** Bugünkü giriş ekranı çalışıyor, dürüst ve akışı doğru. Bu iş
yapılmazsa da uygulama eksik kalmaz.

---

## 2 · Müdür modu durum ekranları (yükleniyor · hata · çevrimdışı)

> **Kısmen kapandı (27 Ağustos).** Sayıların okunamaması artık "sıfır randevu"
> diye çizilmiyor; bilinmeyen gün ile boş gün ekranda ve ekran okuyucuda ayrı.
> Kalan kısım, hata hâlinin GÖRÜNÜR karşılığı — o hâlâ tasarımsız.

**Durum:** brief yazıldı, **kullanıcı tarafından rafa kaldırıldı** ("gereksiz").

Malzeme kodda hazır ve çalışıyor: `OfflineBar`, `animateOfflineBar`,
`useConnectivity()`, `offlineBannerText()`, üç iskelet bileşeni. Hepsi personel
takvimine ve auth ekranlarına bağlı; **müdür ekranlarının hiçbirinde yok.**

**Gerçek uçlara bağlanınca patlayacak yer:**
[calendar.tsx:71](../mobile/app/(manager)/calendar.tsx:71) — `.catch(() =>
undefined)`. Gün sayıları okunamazsa şeritteki bütün günler **sıfır randevu**
görünüyor; okunamamış gün ile boş gün ekranda aynı. Aynı sebeple akış ekranı
"bugün boş" plakasını çiziyor — dolu bir salonda müdüre salonun boş olduğunu
söylüyor.

Tek satırlık dürüst çare var: bilinmeyen sayıyı sıfır yazmak yerine hiç
yazmamak. Tasarım gerektirmiyor.

**Dosya:** [mudur-28-durumlar-claude-design-prompt.md](mudur-28-durumlar-claude-design-prompt.md)

---

## 3 · Dev build (sekme çubuğunun kaydırınca küçülmesi)

**Durum:** kod tarafı hazır, **doğrulanamıyor** — proje bitince yapılacak
(ağır iş).

Akış ekranında kaydırıcı ekranın ilk çocuğu yapıldı; iOS 26'nın
`minimizeBehavior`'ı ancak öyle çalışıyor
([react-native-screens#4145](https://github.com/software-mansion/react-native-screens/issues/4145)).
Ama Expo Go'da hâlâ küçülmüyor ve **sebep kanıtlanmadı**: prop gidiyor, uyarı
logu çıkmıyor, etki yok.

**Kaldığımız yer:** çıplak bir `ScrollView` içeren geçici bir test sekmesi
("Lab") yazılmıştı, sonuç alınmadan kaldırıldı. Dev build'e geçince ilk iş onu
tekrar kurup ölçmek:

- Lab'de küçülüyorsa → sorun ekran yapımızda, kazmaya devam.
- Lab'de de küçülmüyorsa → sorun Expo Go'nun native tarafındaydı, dev build
  zaten çözmüş olacak.

**Engel:** Xcode kurulu değil (yalnız Command Line Tools). İki yol: Xcode
kurmak (~10 GB) ya da EAS Build ile buluttan derlemek.

Aynı sebeple Takvim ve Kasa'da küçülme hiç denenmedi: oralarda engel sabit
başlık (hafta şeridi / turuncu özet paneli) ve onu kaydırma içine almak
tasarımı değiştiriyor.

---

## 4 · Müşteri kartı v2

**Durum:** brief yazıldı, çıktı **beğenilmedi**, v1 yerinde kalıyor.

**Dosya:** [mudur-23-musteri-karti-v2-claude-design-prompt.md](mudur-23-musteri-karti-v2-claude-design-prompt.md)

---

## 5 · Küçük borçlar

- **Personel modunda "PIN'i değiştir" ölü kontrol** —
  `(staff-flow)/account.tsx`, `onPress={() => undefined}`. Personel modunun
  işi, bilinçli olarak dokunulmadı.
- **H1 başlık sayısı** — "SIRADAKİ · 0 RANDEVU" yalnız gelecek olanları
  sayıyor ama liste kapanmış satırları da gösteriyor.

---

## Sunucu ucu bekleyenler (mobil kodu hazır)

- **Hesap silme** — ekran hazır, uç yok. **App Store 5.1.1(v) yayın engeli.**
- Salon saatleri / hizmetler / bildirim kaydı — `salonSettings.ts` sahte kaynak.
- `visit.arrive` — "Geldi" işareti yerelde kalıyor.
- Randevu oluşturma / güncelleme — yerel takvim kaynağına yazılıyor.
- Expo Push kanalı.
