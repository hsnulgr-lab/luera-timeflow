# Personel kumandası · envanter, boşluklar ve yol haritası

Tarih: 2026-08-30. Kaynak: `staff-api` (987 satır) ve `app/(staff)*` (4096
satır) taraması, `mobile/src/api/staff.ts`, şema (076 · 082 · 089 · 090 · 091).

---

## 0 · Tek cümlelik teşhis

Personel tarafında **sunucu bitmiş, istemci kütüphanesi bitmiş, ekranlar hiç
başlamamış**. Elimizde çalışan bir motor ve boyanmış bir maket var; ikisi
birbirine hiç bağlanmadı.

Bu, müdür tarafının tersi bir durum: orada ekranlar bitti veri yoktu, burada
veri hazır ekran yok.

---

## 1 · Envanter

### Hazır — dokunulmayacak

| Parça | Durum |
|---|---|
| `supabase/functions/staff-api/index.ts` | **987 satır, 12 uç, bitmiş** |
| `mobile/src/api/staff.ts` | Token saklama, PIN oturumu, **çevrimdışı yazma kuyruğu** |
| Şema | `082` personel kimliği · `089` ciro görünürlüğü · `090` ziyaret sıkılaştırma · `091` cihaz kodları |

`staff-api`'nin on iki ucu: `device.pair` · `device.code.create` ·
`device.code.redeem` · `roster` · `session.start` · `me` · `session.refresh` ·
`agenda` · `catalog` · `customer` · `performance` · `visit.start` ·
`visit.items` · `visit.finish`.

Uçlar iyi düşünülmüş ve gerekçeleri yazılı:

- **Yetki SORGUDA uygulanıyor, arayüzde değil.** `agenda`'da "kendi randevusu"
  filtresi sorgunun içinde: "filtreyi arayüze bırakmak, isteği elle atan
  birine tüm salonu açardı."
- **`catalog` tek turda** hizmet ve ürün dönüyor: "kötü sinyalde iki ayrı
  istek, ikisinden birinin düşmesi demek. Kumanda sık sık bodrum katında
  açılıyor."
- **`visit.items` yalnız KATALOG KİMLİĞİ alıyor**, adı ve fiyatı sunucu
  çözüyor: elle atılan bir istek kasadaki toplamı değiştiremesin.
- **`visit.finish` idempotent** ve stok uzlaştırması yapıyor: kuyruk aynı
  isteği iki kez gönderirse hata değil.
- **`performance` ayarlanabilir**: `staff_can_see_revenue` kapalıysa 403.

### Taslak — yeniden yazılacak

| Ekran | Satır | Durum |
|---|---|---|
| `(staff)/index` — bugün | 901 | Müşteri adları **JSX'e gömülü** (`REST`, `:744`) |
| `(staff)/calendar` | 525 | `PREVIEW_TODAY`, `PREVIEW_NOW_MINUTES` sabitleri |
| `(staff)/customers` | **14** | Ekranda yazıyor: "Bu ekran sıradaki turda yazılacak." |
| `(staff)/performance` | 262 | `TODAY` ve `BARS` sabit |
| `(staff-flow)/visit` | 478 | `TEST_ELAPSED_SECONDS` |
| `(staff-flow)/finish` | 344 | `SERVICES`, `MATERIALS` sabit |
| `(staff-flow)/appointment` · `sent` | 770 | Sabit |

**Hiçbiri `src/api/staff.ts`'i çağırmıyor.** Yalnız `profile` ve `account`
oturum için kullanıyor.

**Karar katmanı yok.** Müdürde `managerFlow.ts` (1452 satır saf mantık) var ve
mock'u gerçeğe çevirmek *kaynak değiştirmek* demek. Personelde çevrilecek bir
şey yok: veri arayüzün içinde yaşıyor.

**Tasarım turu geçmemiş.** `docs/` altında 11 müdür brief'i var, personel
brief'i **sıfır**. Üç ekran `LayoutAnimation` kullanıyor — müdürün hareket
sözleşmesinin yasakladığı şey.

---

## 2 · Sunucunun sunduğu, ekranın kullanmadığı

Bunlar "eksik özellik" değil: **yazılmış ve bağlanmamış** yetenekler.

1. **Müşteri risk bayrakları.** `customer` ucu `custom_fields` (076) ve
   `settings.risk_rules`'ı birlikte dönüyor, eşlemeyi istemciye bırakıyor
   ("kural motorunu iki yerde çalıştırmak ikisinin ayrışması demekti").
   Ekran hiç okumuyor.
2. **Ciro görünürlüğü sözleşmesi TEK TARAFLI.** Sunucu 403 dönüyor ve kendi
   yorumunda diyor ki "arayüz sekmeyi hiç göstermez". Arayüz **her zaman**
   gösteriyor (`_layout.tsx:44`). Bağlandığı gün, cirosu kapalı bir salonda
   personel "Kazanç"a basıp hata görecek.
3. **Çevrimdışı kuyruk.** İstemcide yazılı, hiçbir ekran yazma yapmadığı için
   hiç çalışmadı. Kuyruğun arayüz karşılığı ("sıraya alındı") da yok.
4. **Malzeme düşümü.** `visit.items` ürün ve stok kesintisini destekliyor;
   `finish` ekranındaki `MATERIALS` sabit bir dizi.

---

## 3 · Sahada personel ne yapar

Müdür telefonu **bilgi almak** için açıyor. Personel **iş yapmak** için
açıyor, ve arada üç fiziksel fark var:

**Eller dolu.** Islak, boyalı, eldivenli. İki elle kullanılan hiçbir şey
çalışmaz; hassas jest çalışmaz. Dokunma hedefi müdürdekinden BÜYÜK olmalı.

**Telefon cebe girip çıkıyor.** Vardiya boyunca onlarca kez. Oturum kalıcı,
PIN kısa; her açılışta şifre yazılmaz. (`tokens.clearStaff` bunu zaten
düşünmüş: çıkışta personel oturumu düşer, CİHAZ eşleşmesi kalır.)

**Ekran MÜŞTERİNİN GÖZÜ ÖNÜNDE.** Bu, müdür tarafında olmayan bir kısıt ve
tasarımın en kritik girdisi. Personel telefonu koltuğun yanında tutuyor;
müşteri ekrana bakabiliyor. Yani **risk bayrağı, bakiye, salon notu ve geçmiş
gelmeme sayısı** müdürdeki gibi açıkça yazılamaz. `customer` ucu bunları
dönüyor — ekran onları nasıl taşıyacağı **tasarlanmamış bir sorun**.

Vardiyanın anları:
1. Vardiya başı — PIN, bugün kimler var
2. "Müşteri geldi" bildirimi (push altyapısı hazır:
   `notify_push_on_reservation` + `send-push`)
3. İşlemi başlat — **tek dokunuş**, `visit.start`
4. İşlem sırasında ek hizmet / malzeme — `visit.items`
5. Bitir ve adisyonu kasaya gönder — `visit.finish`
6. Sıradakine bak
7. Gün sonu kendi kazancı — izin verilmişse

---

## 4 · Felsefe: kumanda ≠ cep desktop

Müdür tarafı bilinçli olarak **cep desktop**: zengin, çok bilgili, gezinilir.
Personel tarafı **kumanda** olmalı: az düğme, büyük düğme, tek yol.

Pratik karşılığı:
- Ekran başına **tek birincil eylem**. Personel "hangisine basayım" diye
  düşünmemeli.
- **Gezinme derinliği en fazla iki.** Bugün → ziyaret → bitir.
- Sayı ve rapor personelin işi değil; **kendi kazancı hariç** (o da opsiyonel).
- Müdürün akış ekranındaki gibi bir olay listesi personelde **olmamalı**:
  personel salonu değil, kendi sırasını yönetiyor.

---

## 5 · Sıra önerisi

**Önce (ortak, iki tarafı da ilgilendirir):**
1. **Ortak durum sözlüğü** — bir `reservations` satırı → tek bir durum. Müdür
   doğrudan Supabase'den, personel `staff-api`'den okuyor: iki yol, tek gerçek.
   Ayrışırlarsa müdür "işlem sürüyor" görürken personel "başlamadı" görür.
   Bilinen tuzak: `visit.start` işlem sürerken `status`'ü `'confirmed'`
   bırakıyor — şemaya bakıp "confirmed = başlamadı" demek doğal ve YANLIŞ.

**Sonra (personel):**
2. **Tasarım turu** — personelin kendi brief'i. Girdiler: eller dolu, ekran
   müşterinin gözü önünde, tek birincil eylem, iki seviye derinlik.
3. **`staffFlow.ts`** — karar katmanı. Veriyi JSX'ten çıkar.
4. **Ekranları yeniden yaz** — bugün · ziyaret · adisyon · müşteri (14 satırlık
   taslak) · kazanç.
5. **`src/api/staff.ts`'e bağla** — bu adım KISA, istemci hazır.

**Yanında kapanacak borçlar:**
- "Kazanç" sekmesi `staff_can_see_revenue` kapalıyken çizilmesin.
- Çevrimdışı kuyruğun arayüz karşılığı yazılsın.
- Müdürün "Personele söyle"si gerçek push atsın (altyapı hazır).
- `LayoutAnimation` kullanan üç ekran hareket sözleşmesine uysun.

**Tahmin:** tasarım turu + karar katmanı + ekranlar ≈ **3-4 hafta**. En büyük
belirsizlik tasarım turunda; Claude Design'ın hızı takvimi belirler.
