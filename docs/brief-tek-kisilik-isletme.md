# Brief · Üçüncü kabuk — tek kişilik işletme

**Kime:** Claude Design
**Tarih:** 2026-10-09 (v2 — yön düzeltildi)
**Durum:** Uygulama App Store'da canlı (1.0)
**Bağlayıcı referans:** `design-reference/canli-1.0/` — canlı sürümün ekran
görüntüleri. Klasördeki `.html` tasarım dosyaları bir tur geride; çelişkide
görüntüler geçerli.

---

## 0 · Bu brief ne İSTİYOR, ne İSTEMİYOR

**İstenmeyen:** yeni bir tasarım. Kullanımdaki ekranların yenilenmesi
istenmiyor. Yeni bileşen, yeni renk, yeni tipografi, yeni jeton, yeni hareket
dili yok.

**İstenen:** mevcut **müdür** ve **personel** ekranlarının, tek kişilik bir
işletmeye göre **harmanlanması.** Bilgisayarı olmayan bir kişi, her şeyi tek
telefondan yönetebilsin.

Bu bir *yeniden tasarım* değil, bir *yeniden bileşim* işi. Çıktı da buna göre
olmalı: hangi ekranın hangi parçası nereden geliyor, ne çıkıyor, ne giriyor.

---

## 0.1 · Ekler ve rolleri

İki tür ek var ve ikisi ayrı iş yapıyor. Karıştırılmamalı.

| Ek | Rolü | Nasıl kullanılacak |
|---|---|---|
| **`design-reference/canli-1.0/`** · 19 ekran görüntüsü | **NE** — hangi ekran, hangi hâl, hangi düzen, hangi cümle | **Bağlayıcı.** Ekranların doğrusu burada. Çelişkide bu kazanır |
| **`.html` tasarım dosyaları** | **NEYLE** — renk jetonları, tipografi, yarıçaplar, ikon seti, 393×852 çerçeve, belge düzeni | Kit olarak. **Ekran kopyalanmayacak:** içlerindeki ekranlar bir tur geride |

HTML'lerin jeton tarafı doğrulandı ve uygulamayla birebir tutuyor
(`src/theme/tokens.ts`): açık zemin `#F3ECE0`, koyu zemin `#120E08`,
turuncu `#FF5A1F`, yazı tipi Hanken Grotesk 200–900. Eskiyen şey yalnız
ekranların düzeni.

**Çıktı biçimi** önceki turlarla aynı: tek bir `.html` belge + yanında
`.js` ekran dosyaları, telefon çerçeveleri yan yana, her ekranın altında
gerekçe notları.

---

## 1 · Bugünkü iki kabuk

| Kabuk | Ne yapıyor | Sekmeler |
|---|---|---|
| **Müdür** | "cep masaüstü" — randevu kurar, taşır, siler, ekibini izler | Akış · Takvim · + · Kasa · Profil |
| **Personel** | "kumanda" — az şey, üç dokunuş, yalnız kendi günü | Bugün · Takvim · Müşteriler · Profil |

Tek kişi ikisine de sığmıyor: müdür ona olmayan bir ekibi soruyor, personel
işletmeyi yönetemiyor.

---

## 2 · Harman — ekran ekran

Her satır bir ekran. "Nereden" sütunu bağlayıcı: o ekran oradan alınacak,
yeniden çizilmeyecek.

| Tek kişilik ekran | Nereden | Ne ÇIKAR | Ne GİRER |
|---|---|---|---|
| **Gün** (ana) | **Müdür 24 · bir personelin günü** — `src/components/StaffDay.tsx` + `StaffDayParts.tsx` | Üstteki personel avatar şeridi, geri oku, personeller arası yatay sayfalama | Müdür Akış satırındaki **koyu eylem kartı** (aşağıda §3) |
| **İşlem** | **Personel kumandası** — `app/(staff-flow)/kumanda.tsx` | Hiçbir şey | "Adisyonu kasaya gönder" adımının yerine **tahsilat** |
| **Takvim** | **Müdür Takvim** — `app/mudur/calendar.tsx`, `ColumnCalendar` | Personel sütun başlıkları (tek sütun kalır) | — |
| **Randevu (+)** | **Müdür randevu kurma** — `CreateFlow` | "Kim yapacak" seçimi | — |
| **Kasa** | **Müdür Kasa** — `app/mudur/cash.tsx` | — | Tahsilatı **düzelt** ve **geri al** |
| **İşletme** | **Müdür Profil** — `app/mudur/profile.tsx` | "Personel" satırı | "Tek kişilik çalışıyorsunuz · **Ekip ekle**" |
| **Müşteriler** | Müdür Müşteriler | — | — |

**Sekme seti:** Gün · Takvim · + · Kasa · İşletme. Müdür setiyle aynı sayı ve
aynı yer.

---

## 3 · Ana ekran neden zaten yazılı

Müdür bugün şeritten bir avatara dokununca **tek bir kişinin gününü** görüyor
(Müdür 24). O ekranda şunlar var:

- büyük avatar, durum çipi (**İŞLEMDE** / **MÜSAİT**), meslek
- koyu bir **hâl kartı**: *"SÜRÜYOR · 51:01 · Tuğçe Erden · Aromaterapi
  Masajı · 15:50'te biter"* ya da *"ŞU AN BOŞ · 34 dk · 15:50'a kadar ·
  sıradaki Ufuk Şen"*
- **SIRADAKİ · 1 RANDEVU** listesi, şimdi çizgisi
- altta iki eylem: **Randevu ver** · **Ara**

Bu, tek kişinin Gün ekranının neredeyse tamamı. Eksik olan tek şey, o hâl
kartının **dokunulabilir** olması.

Müdür Akış'ta o dokunulabilir hâli de var: satırın içindeki **koyu eylem
kartı** — *"UZUN BEKLİYOR · 50 dk · [Personele söyle]"*, *"KASADA BEKLİYOR ·
45 DK · ₺1.500"*. Aynı kartın tek kişilik moddaki düğmeleri:

| Satırın hâli | Kartta ne yazıyor | Düğme |
|---|---|---|
| sıradaki | kaç dakika sonra | **Başlat** |
| sürüyor | geçen süre | **Kumandayı aç** |
| beklemede | bekleme kalanı | **Kumandayı aç** |
| adisyon açık | tutar | **Tahsil et** |

**Yani "alt yuva" ve "ada" diye yeni bileşenlere gerek yok.** Süren işin
sayacı zaten Gün ekranında, satırın kendi kartında duruyor. Kumanda, karta
dokununca tam ekran açılıyor — bugün personelin "Bugün"den kumandaya gittiği
yolun aynısı.

---

## 4 · Bilgisayar duvarları

Bu modun belirleyici şartı: **kullanıcının bilgisayarı yok.** "Bilgisayardan
yapın" diyen her yer ya çözülmeli ya anlamını yitirmeli. Hiçbiri sessizce
dışarıda kalmamalı.

| Yer | Bugün | Tek modda |
|---|---|---|
| `profil/personel.tsx:285,353` | "Personeli bilgisayardan ekleyin" | **Düşer** — satır render edilmiyor. Ekip "Ekip ekle" kapısından ekleniyor |
| `CreateFlow.tsx:455` | "Hizmetler masaüstündeki ayarlardan eklenir" | **Yanlış cümle, kusur.** Telefonda `profil/hizmetler` ekranında "+" var ve çalışıyor. Her modda düzeltilmeli |
| `cash.ts:380` | "Düzeltme ve iptal masaüstündeki Kasa'dan" | **Çözülmeli** — Kasa'da Düzelt / Geri al. Ters kayıt, sunucu saatiyle; eski satır silinmiyor |
| Akış · adisyon | Tahsilat eylemi yok (müdür kararı 2026-09-17) | **Çözülmeli** — parayı alan ile uygulamayı kullanan aynı kişi |
| `paket-sat.tsx:303` | "Peşinat ve taksit masaüstünden" | **Kısmen** — paket tek ödemeyle satılır; taksit kapsam dışı, seçenek hiç çıkmaz |
| `actionPill.ts:39` | WhatsApp "masaüstünden bağlanır" | **Bağlamadan** — "Mesajla hatırlat" telefonun WhatsApp'ını hazır metinle açar (`Linking` · `wa.me`) |
| `signup/ready.tsx` | "Kurulumu bilgisayardan tamamla" düğmesi | **Hiç çıkmaz** |
| `createFlow.ts:181` | Personel yoksa "Saat seçin" sessizce kapalı | **Düşer** (karar 3). Kapalı kalan her düğme sebebini yazar |

---

## 5 · Dört ürün kararı

Gerekçeli öneri beklenir; seçim ürün sahibinin.

**1 · Mod nasıl belirlenir?** Kayıt anında herkesin personel sayısı sıfır, o
yüzden çıkarım yapılamıyor. Öneri: `signup/ready.tsx`in yerine tek soru —
*"Bu işletmede işi kim yapıyor?"* → **Yalnız ben** / **Ekibim var**. Adım
sayısı artmıyor.

**2 · Sonradan çalışan alınca?** Mod kendiliğinden değişmez; kullanıcı
İşletme → **Ekip ekle** ile seçer. Önkoşul: personel ekleme telefonda
yapılabilmeli, yoksa kapı duvara dönüşür.

**3 · "Personel" kavramı altta kalsın mı?** Öneri: kalsın. Sahip kayıtta
sessizce bir personel satırına bağlansın (`006_handle_new_user_safe.sql`).
Takvim, çakışma kontrolü ve raporlar `staff_id` üzerinden yürüyor; boş
bırakmak her sorguya görünmez bir ikinci dal açar. Arayüzde kavram hiç
görünmez.

**4 · Tahsilat telefondan yapılsın mı?** 2026-09-17'de kapatılmıştı; dayanağı
rol ayrımıydı (işi yapan ≠ parayı alan). Tek kişide bu ayrım yok. Öneri: tek
modda açılsın, düzeltme ve geri alma dahil. Uygulama kart çekmiyor, parayı
kaydediyor.

---

## 6 · Kısıtlar — pazarlık dışı

**Sekme çubuğu.** `NativeTabs`, **etiketli** (`labelVisibilityMode="labeled"`).
iOS 26 onu yüzen bir kapsül olarak çiziyor; biçim sistemden geliyor, elle
çizilmiyor. Etiketler kalıyor: kitle 40–55 yaş ve bu ikonlar ezbere bilinmiyor.

**Özet şeridi yok.** Üç hücreli ciro/adisyon şeridi Akış'tan kaldırıldı,
`tests/mobile-mudur-denetim.test.mjs:30` nöbet tutuyor. Gerekçe: *"Ciro ve
adisyon Kasa'nın işi; akışta randevuların yerini yiyordu."*

**Ekran yalan söylemez.** Yükleniyor / okunamadı / gerçekten boş üç ayrı
hâldir. Boş dizi "yok" der, `null` "bilmiyorum" der. Okunamayan veri "0" diye
gösterilmez. Mevcut karşılıkları kullan: `DaySkeleton`, `DurumUnread`,
`VoidBlock`, `EmptyDay`.

**Dokunulan her kontrol bir iş yapar.** `onPress`i olmayan düğme, dolmayan
sayaç yok. Kapalı bir düğme sebebini yazar.

**Yazma önce sunucuya gider.** Ekran sunucu kabul etmeden değişmez; redde
hiçbir şey değişmez ve sebep kullanıcının baktığı yerde yazar.

**Damgalar sunucu saatinden** (`server_now()`), cihazın saatinden değil.

**Türkçe, kısa, özürsüz.** Mevcut ton: *"Bugün randevunuz yok."*

**Hareket.** `react-native-reanimated` 4.5.1 var. **`react-native-gesture-handler`
YOK ve kurulmayacak** — jest `PanResponder` ile. Lottie ve Skia yok. Yazılmış
ekranlar RN `Animated`'de kalıyor.

**Rota.** `app/tek/` gerçek segment olmalı, grup değil — yoksa `/calendar` ve
`/profile` iki dosyaya birden düşer ve `tests/mobile-rota-cakismasi.test.mjs`
patlar. Her iki role açık ekranlar `app/(ortak)/` altında.

---

## 7 · Teslim

Çizilecekler, öncelik sırasıyla:

1. **Gün** — boşta, sürüyor, beklemede, adisyon açık. Dördü de aynı ekran,
   değişen yalnız satırın eylem kartı.
2. **İşletme** — satır düzeni ve "Ekip ekle" kapısının ne dediği.
3. **Kasa** — tahsilatı düzelt ve geri al.
4. **Randevu kurma** — "kim" adımı olmadan.
5. **Takvim** — tek sütun.
6. **Boş hâller** — gerçekten boş, kapalı gün, yükleniyor, okunamadı.
7. **Kurulum** — mod sorusu ve ilk gün.

Her ekranın yanında tek satır: *hangi mevcut ekrandan geldiği.* Yeni bir
bileşen önerilecekse, neden mevcut bir bileşenin yetmediği yazılmalı.

---

## 8 · Referanslar

**Önce bunlar — canlı sürümün ekranları** (`design-reference/canli-1.0/`,
dosya dosya ne olduğu `00-index.md` içinde):

- Ana ekranın iskeleti: `mudur-12-personel-gunu-islemde.webp`,
  `mudur-13-personel-gunu-musait.webp`
- Eylem kartının dili: `mudur-01-akis.webp`, `mudur-02-akis-kaydirilmis.webp`
- Kumanda: `personel-02-kumanda-islemde.webp`,
  `personel-03-adisyon-acik.webp`, `personel-04-bekleniyor.webp`
- Harmanlanacak diğer sekmeler: `mudur-03-takvim.webp`,
  `mudur-05-randevu-kur.webp`, `mudur-06-kasa.webp`, `mudur-07-profil.webp`
- Bilgisayar duvarı canlı örneği: `mudur-09-personel.webp` (sayfanın altı)

**Sonra kod** — bir ölçü ya da hâl tartışmalıysa:

- Müdür kabuğu: `app/mudur/_layout.tsx` · Akış `index.tsx`
- Bir personelin günü: `src/components/StaffDay.tsx`, `StaffDayParts.tsx`
- Akış satırı ve eylem kartı: `src/components/FlowParts.tsx`,
  `src/lib/actionPill.ts`
- Kumanda: `app/(staff-flow)/kumanda.tsx`
- Boş/yükleniyor/okunamadı: `src/components/EmptyDayParts.tsx`,
  `src/components/Durum.tsx`
- Kurallar: `mobile/AGENTS.md`
