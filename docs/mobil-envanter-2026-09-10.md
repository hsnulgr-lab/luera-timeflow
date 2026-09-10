# Mobil · borç envanteri

**Tarih:** 10 Eylül 2026 · **Dal:** `chore/expo-57` · 6 commit, **push edilmedi**

```
tsc      temiz
test     1765 geçiyor / 0 hata
lint     508 hata — 420'si reanimated'in yazımını anlamayan tek bir yanlış alarm
paket    12.944.941 bayt, uyarısız derleniyor
```

Yapı ayakta. Karar katmanı saf (React importu yok), kilitler veriden türüyor,
rol sızıntısına karşı dört kilit de yerinde. **Eksik olan yapı değil, bağlantı.**

---

# 0 · Tek gerçek engel

## `D1` — hiçbir ekran sunucuya bağlı değil

`src/api/staff.ts` yazılmış, on iki ucu da sunucuda karşılığıyla duruyor,
testleri var — ama `app/` altında onu kullanan **tek bir ekran yok**. Bugün
`demoAgenda`'dan, Takvim `mockDay`'den okuyor. `EXPO_PUBLIC_AUTH_MODE`
hiçbir zaman `live` yapılmadı.

Bağlanınca dört şey birden çözülür: Takvim ile kumandanın kimlikleri uyuşur,
`ME = 'merve'` sabiti gerçek oturuma döner, çevrimdışı kuyruğu anlam kazanır,
Personel 12/13/14'ün karşılaştırma · sıklık · kapı mantığı gerçek değerine
kavuşur.

### Önkoşul: altı sözleşme uyuşmazlığı

İstemcinin ürettiği gövdeler sunucunun kabul ettiğiyle uyuşmuyor. Dördü
sessizce yanlış davranıyor — hata vermiyor, veri kaybediyor.

| # | Ne | Sonuç |
|---|---|---|
| 1 | Katalog dışı kalem (`free:`) `visit.items`'te UUID bekleniyor | **400** — "diye ekle" akışı hiç kaydedilemiyor |
| 2 | `qty > 1` ek hizmette ve satılan üründe reddediliyor | **400** — üstelik Kasa `qty`'yi hiç okumuyor, para hatası riski |
| 3 | `tags` sunucuda yok (`visit.formula` almıyor) | Personel 12'nin ton ekseni **sessizce düşüyor** |
| 4 | `UsageRow` kaynağı yok — hiçbir uç geçmiş kalemleri dönmüyor | Sıklık kutusu sahte veriyle çalışıyor |
| 5 | `customer` ucu geçmiş `adisyon_items` dönmüyor | "bu müşteride" işareti doldurulamıyor |
| 6 | `performance` yalnız bugün+hafta toplamı dönüyor | Kazanç ekranı 7 günlük çubuk ve "gelmeyen müşteri" çiziyor — **ikincisinin verisi hiç yok** |

**3 · 4 · 5 · 6** yalnız `staff-api/index.ts`'e ekleme; mevcut hiçbir
davranışı bozmuyor. **1 · 2** Kasa'da da bir yarım istiyor, yani ürün kararı:
serbest kalem için Kasa'ya fiyat alanı, `qty` için Kasa'nın adet okuması.

> "Gelmeyen müşteri"nin veri kaynağı **yok**: `status` yalnız
> `pending·confirmed·cancelled·completed`, iptal gelmemek değil. Ya modele
> bir damga girecek ya ekrandan kalkacak.

---

# 1 · Kırık ya da yalan söyleyen kod

Veritabanı bunları çözmez; bağlantıdan sonra da aynen durur. Dördü doğrudan
**çıkarma** — silmek bir yapıyı bozamaz.

| Kod | Ne | Yer |
|---|---|---|
| `A1` | **Dört kırık adres** — `(manager)` grubu artık yok | `personel/[id].tsx:46` · `randevu/[id].tsx:102` · `customer.tsx:54,77` |
| `A3` | "PIN'i değiştir" ölü satır (`onPress={() => undefined}`) | `(staff-flow)/account.tsx` |
| `A4` | **1592 satır öksüz ekran** — kumanda yerlerini aldı | `appointment · visit · finish · sent` |
| `A5` | Ölü importlar | çeşitli |
| `A6` | `Linking.openURL` catch'siz | telefon araması |
| `B1` | `customer_phone: '+90...'` demo değeri | tuş takımına düşüyor |

`A1` en ciddisi: ikisi **kapanış yolu** (yığın boşken kullanıcı çıkmazda
kalıyor), ikisi **randevu oluşturma** (hiçbir şey açılmıyor). `typedRoutes`
kapalı olduğu için `tsc` görmüyor. **Düzeltmenin yanına gezinme hedefi testi
gerekiyor** — yoksa bir sonraki yeniden adlandırmada tekrarlanır.

---

# 2 · Kod değil, KARAR

Bağlantı anında karşınıza çıkacaklar. Şimdi bir satırla karar vermek, o gün
tasarım tartışması açmaktan ucuz.

**`?? list[1]`** — `kumanda.tsx:93`. Tanınmayan `id` gelince **başkasının
randevusunu açıyor** ve "randevu bulunamadı" diye bir hâl hiçbir yerde
çizilmemiş. Bugün zaten tetikleniyor.

**Gönderme penceresinin tahliyesi** — `kumanda.tsx:519`. 6 saniyelik pencere
açıkken ekrandan çıkılırsa hiçbir şey gönderilmiyor. Bugün zararsız;
`visit.finish` bağlandığı gün **sessiz veri kaybı**.

**`kumanda.tsx` 1680 satır** — bölünsün mü? Bağlantı bu dosyaya yükleme,
hata ve yeniden deneme kodu ekleyecek, yani büyüyecek. **Öneri: sonra.**
Şimdi bölmek, bağlantıda ikinci kez bölmek demek.

**Prim / komisyon sisteme girecek mi?** Girmezse Kazanç ekranı Profil'de
"İşlerim" satırı olur (gösterdiği tutar salon cirosu, personelin eline geçen
para değil — "Kazanç" demek yalan). Girerse `staff` tablosuna oran alanı
gerekir.

**`react-native-gesture-handler` kurulsun mu?** Hâlâ yok, ayrı bir karar.

---

# 3 · Sunucu ucu olmayanlar

Mobil kodu hazır, karşılığı yazılmadı.

**Müdür API'si HİÇ YOK.** `staff-api` yalnız personeli besliyor. Müdürün
Kasa'sı için hareket listesi, iptal ve düzeltme uçları; randevu oluşturma ve
güncelleme; ayrıca **denetim kaydı tablosu** (iptal izi şu an yalnız
istemcide) gerekiyor. `payments`'ta update yolu yok — "düzelt" tasarım gereği
sil + yeniden yaz.

| Eksik uç | Bugün ne oluyor |
|---|---|
| `working_hours` + `staff_time_off` | Vardiyam `demoSource` ile çalışıyor |
| `visit.arrive` | "Geldi" işareti yerelde kalıyor |
| `visit.note` | Not yazılıyor, kaydolmuyor (ekran bunu dürüstçe söylüyor) |
| `salonSettings` | Saatler, hizmetler, bildirim kaydı sahte kaynak |
| Expo Push kanalı | Yok |
| Kasa iptali | Cihazda yaşıyor, uygulama kapanınca kayboluyor |

---

# 4 · Ekran ve tasarım eksikleri

**Müdür · Müşteriler listesi** — tasarım turu gerektiren **tek gerçek eksik
ekran**. Müşteri kartı var ve paylaşımlı, ama müdür ona yalnız bir randevunun
üzerinden ulaşabiliyor; bugün randevusu olmayan müşteriyi arayamıyor.
Personeldeki defteri devralır.

**Müdür durum ekranları bağlı değil.** `OfflineBar`, `useConnectivity`, üç
iskelet — hepsi yazılı ve çalışıyor ama hiçbir müdür ekranına takılı değil.
İçinde gerçek bir hata var: `mudur/calendar.tsx:71` → `.catch(() => undefined)`,
gün sayıları okunamazsa şerit **her günü sıfır randevu** gösteriyor. Dolu bir
salonda müdüre salonun boş olduğunu söylüyor.

**Personel takviminin dört hâli** (`D3`) — boş gün · yüklenme iskeleti · ay
ızgarası · kaydırınca toplanan başlık. Testleri `skip`'te bekliyor.

**`B3` belirsizlik işareti** — kadranın büyük sayısının altına noktalı çizgi.
Şu an her sayı kesinmiş gibi duruyor.

**`B4` komşu iş uydurma** — `Neighbour` her randevuda sabit "Zeynep Kaya ·
boya · 24 dk". Bağlanınca çözülür.

**Kasa "Düzelt" düğmesi tasarımsız** — çizili, basınca bir şey olmuyor,
çünkü akışın ekranı hiç çizilmedi. Uydurulmadı.

**Müşteri kartı v2** — çıktı beğenilmedi, v1 yerinde. Kapanmış sayılabilir.

---

# 5 · Paket gerektirenler

**`expo-notifications`** — listenin **en kritiği**. Kumandanın en tehlikeli
sözü: boya süresi personelin eline emanet ediliyor ama telefon kilitlenince
hiçbir şey çalmıyor. Aşırı işlem görmüş boya = yanmış saç. **Bu çözülmeden
ekran sahaya çıkamaz.**

**`expo-keep-awake`** — işlem sürerken ekran uyanık kalsın. Üç satır kod,
her gün hissedilen kazanç; listenin en iyi kâr/zarar oranı.

---

# 6 · Yayın engelleri (App Store)

| Yönerge | Durum |
|---|---|
| **2.1** App Completeness | Hiçbir ekran sunucuya bağlı değil → **kesin ret** |
| **5.1.1(v)** Hesap silme | `STUB_PARTS`'ta; `account-delete` yazıldı ama **deploy edilmedi** → **kesin ret** |
| **2.1** Kayıt | `signup` stub — kaydolunamıyor |
| **2.1** Demo hesabı | Çalışan demo eşleştirme kodu gerekiyor |
| **3.1.1** Uygulama içi satın alma | **Araştırılmalı.** Konum sağlam görünüyor (işletme satın alıyor, uygulamada fiyat/plan hiç geçmiyor) ama tahminle geçilmez |
| Gizlilik | KVKK metni org başına URL; App Store Connect'te gizlilik politikası zorunlu |
| — | **90 günlük cihaz token'ı dolunca çıkacak ekran hiç tasarlanmadı** |

> Kullanıcı kararı (2026-08-15): Apple Developer hesabı yok, yayın uzun
> sürecek. Bu maddeler **acil değil**, sıraya en sonda.

---

# 7 · Bilinçli olarak açılmayacaklar

- **`C` grubu** — bağlanınca kendiliğinden ölecek sahte veri; dokunulmayacak
- **Sekme çubuğunun kaydırınca küçülmesi** — dev build gerekiyor (Xcode ~10 GB
  ya da EAS), proje bitince
- **Giriş v2** — Giriş v3 ile büyük ölçüde kapandı
- **`kumanda.tsx`'i bölmek** — bağlantıdan sonra

---

# Önerilen sıra

| # | İş | Neden burada |
|---|---|---|
| 1 | **Tur 0** — sunucu eklemeleri (uyuşmazlık 3·4·5·6) | Tek dosya, katkı niteliğinde, risksiz, `D1`'in önkoşulu |
| 2 | **Sözleşme testi** | Altı uyuşmazlığın altısını da kırmızıya boyar |
| 3 | **`A1`** — dört adres + gezinme hedefi testi | On dakika, bugün kullanıcıyı çıkmaza sokuyor |
| 4 | **`D1`** — tek ekran (Bugün) gerçek veriye | Bir gerçek gün, bir gerçek salon |
| 5 | `A3 · A4 · A5 · A6 · B1` | Temizlik; hiçbiri mimariye ekleme yapmıyor |
| 6 | Uyuşmazlık **1 · 2** (Kasa'nın yarısıyla) | Ürün kararı gerektiriyor |
| 7 | `expo-keep-awake`, sonra `expo-notifications` | İkincisi sahaya çıkışın ön koşulu |
| 8 | Müdürün müşteri listesi | Tek eksik ekran |
| 9 | Yayın engelleri | Apple hesabı geldiğinde |
