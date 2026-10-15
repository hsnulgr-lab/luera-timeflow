# Düzeltilecekler — mobil 1.0.1 (yayın öncesi denetimin bulguları)

**Kaynak:** 2026-10-15 gece, `docs/yayin-oncesi-genel-kontrol-prompt.md`
ile yapılan salt okuma denetimi (dal `tek-kisilik`, `e89d4c3`).
**Kullanıcı:** "Düzeltilmesi lazım tüm bulgular diye ayrı bir yer aç,
sırayla düzeltelim yarın sabah."

**Uygulama SIRASI bu belgede değil, Devir 2'de:**
`docs/devir/09-DEVIR-2-YAYIN-1.0.1.md` §3 (Faz 1–6). Buradaki madde
numaraları (D1…D11) kimliktir; kanıt, parçalar ve kutular burada. Bir madde
bitince kutusunu işaretle, altına commit kısaltmasını ve telefonda denenip
denenmediğini yaz.

Büyüklük: **XS** < 15 dk · **S** < 1 sa · **M** yarım gün · **L** bir gün+.
**Deploy ve göçü kullanıcı çalıştırır;** Claude komutu verir, çıktıyı ister,
uçları yoklar. Simülatör yasak, doğrulama telefonda Expo Go.

## Verilen kararlar (2026-10-15 gece)

| Konu | Karar |
|---|---|
| Ücretli kalemde adet / katalog dışı kalem | **Sunucu kabul etsin** (kullanıcı) |
| Yapay zekâ (§52 B7) | **Müşteri adı yapay zekâya hiç gitmesin, yer tutucu** (kullanıcı seçimi Claude'a bıraktı — gerekçe 5. maddede) |
| Tek kişilik mod 1.0.1'de | **A · Solo kapısı kalkar, kayıt sonundaki soru kalır** (kullanıcı, 2026-10-16) |
| Katalog dışı ÜCRETLİ kalem (2. madde alt soru) | **Ücretli türde kapalı** — katalog dışı ad yalnız malzeme; istemci rakam göndermez (kullanıcı, 2026-10-16) |
| Paket / indirim / kısmi / grup (6. madde) | **Telefon "Kasa'dan tahsil edin" der** — sunucu tanır, tahsilatı reddeder (kullanıcı, 2026-10-16) |
| Giriş ekranı (§52 A3) | **1.0.1'e girmiyor**, gönderimden sonra ilk iş (1.0.2) (kullanıcı, 2026-10-16) |

## Her düzeltmenin doğrulaması

Yeni test önce eski kodda kırılmalı → `npm test` (taban **3039 geçti / 0
kırık / 7 atlandı**) → `cd mobile && npx tsc --noEmit` → değişen dosyada lint
sayısı artmasın → sunucu değiştiyse kuru koşu / deploy komutu kullanıcıya →
ilgili 📱 adımı.

---

## 1 · 🔴 Sürüm `1.0.0` → `1.0.1` · XS

- [x] Yapıldı (2026-10-16) — `app.json` 1.0.1; `mobile-appstore-hazirlik` sürümün 1.0.0'dan büyük olduğunu kilitliyor. Commit: bekliyor.

- **Kanıt:** `mobile/app.json:5` `"version": "1.0.0"`. `mobile/eas.json:4`
  `appVersionSource: "remote"` yalnız DERLEME numarasını yönetiyor; görünen
  sürüm `app.json`'dan geliyor. 1.0.0 yayında, treni kapalı.
- **Etki:** App Store Connect yüklemeyi reddeder.
- **Düzeltme:** `"version": "1.0.1"`. Sürümü sabitleyen test yok
  (`grep "1.0.0" tests/*.mjs` → 0); istenirse 1.0.0'dan büyük olduğunu
  kilitleyen bir test.

## 2 · 🔴 Sunucu ücretli kalemde adeti ve katalog dışı kalemi kabul etsin · M + `staff-api` deploy + masaüstü

- [x] Alt soru cevaplandı — **ücretli türde katalog dışı kapalı**, yalnız malzeme (2026-10-16)
- [x] Sunucu · [x] Telefon Kasa'sı · [x] Masaüstü Kasa · [x] Cümleler · [ ] Deploy · [ ] Telefonda denendi

> **2026-10-16 uygulama.** Sunucunun kalem kuralı `staff-api/visitItems.ts`e
> çıktı (Node çalıştırabiliyor): ek hizmet + satılan ürün `qty` 1–20,
> katalog dışı MALZEME `free:<ad>` (≤60, 1.0'ın biçimi dahil), stok izlemeyen
> sarf malzeme olarak kabul; stok düşümü ikisini atlıyor. Ücretli katalog
> dışı kalem reddediliyor; kumanda yalnız "MALZEME OLARAK EKLE" sunuyor, arama
> kutusu 60'ta duruyor. Telefon `adisyonLines` ve masaüstü (`BeautyCashRegister`
> satır adedi + `balanceOf`, `usePendingBills`, `MobileKasa`, Berber/Estetik/
> Güzellik panoları) `adisyonExtras` ile fiyat × adet. `errorLine` varsayılanı
> "Sunucu adisyonu kabul etmedi"; otomatik kaydın kalıcı hatası şeritte
> ("kaydedilmedi"). Kilit: `tests/d2-kalem-sozlesmesi.test.mjs` — kumandanın
> gönderdiğini (`addLine` → `sendableOf`) gerçek sunucu kuralından geçiriyor.

- **Kanıt (kod + saf fonksiyonlar çalıştırıldı):**
  - İstemci her türde adedi 20'ye kadar artırıyor: `mobile/src/lib/adisyon.ts:169`
    (ikinci dokunuş ×2), satır paneli − / + her türde açık
    (`mobile/src/components/AdisyonSade.tsx:764-771`).
  - Sunucu ek hizmette (`supabase/functions/staff-api/index.ts:1770`) ve
    satılan üründe (`:1806`) `qty !== 1` → `invalid_catalog_item` 400:
    tek satır yüzünden **bütün liste** reddediliyor.
  - Katalog dışı kalem ("“X” diye ekle", `kumanda.tsx:1278`) kimliği
    `free:X` ile gidiyor; UUID kapısı (`:1731`) reddediyor.
  - Stok izlemeyen sarf da reddediliyor (`:1791`); istemci onu süzmeden
    malzeme diye listeliyor (`mobile/src/lib/catalogMap.ts:22`).
  - Çalıştırılan kanıt (gerçek modüller, `addOutcome` + `sendableOf`):
    ```
    sunucuya giden visit.items: [{"kind":"product","productId":"3f2b…","qty":2}]
    ekrandaki Toplam (hizmet 1000 + kalem 450×2): 1900
    katalog dışı kalem giden: {"items":[{"kind":"product","productId":"free:Keratin ampul","qty":1}]}
    sunucunun UUID kapısı free kimliği geçer mi: false
    ```
- **Etki:**
  - Tek kişilik: otomatik kayıt sessizce düşüyor (kalem kaydedilmiyor, geri
    çıkınca gidiyor); "Nakit tahsil et" → "Tahsilat kaydedilmedi. Kasaya bir
    şey yazılmadı." — sebep yok, "Tekrar dene" de çalışmıyor (3. madde).
    Ekrandaki Toplam sunucunun asla tahsil edemeyeceği bir rakam.
  - Ekip personeli: "Adisyonu kasaya gönder" → kırmızı "Bu adisyon kasada
    zaten açık" (`mobile/src/lib/sendToCash.ts:212`, bilinmeyen kodun
    varsayılanı) — yanlış cümle, düğme yok.
  - 1.0'da da vardı (ekip gönderiminde). Yeni olan: anında kayıt sessizce
    düşüyor ve tek kişilik tahsilat buna takılıyor.
- **Parçalar:**
  1. `visit.items`: ek hizmet ve satılan ürün için `qty` 1–20 (malzemedeki
     kural); kimliksiz kalem `{ name, kind, price: 0 }` olarak kabul (ad
     kırpılır, uzunluk sınırı, sayı sınırı 40 aynen).
  2. Stok: satılan ürün kasada ADET kadar düşsün (masaüstü `sale` hareketi);
     malzemede bugünkü kural aynı.
  3. Telefon Kasa'sı `mobile/src/lib/cashBuild.ts:215` `adisyonLines` fiyat
     × adet — G4 kartı ve turuncu şerit `visit.collect`'le aynı rakamı
     söylesin. (Yorumu "masaüstü çarpmıyor" diyor; o da değişiyor.)
  4. Masaüstü Kasa `src/pages/BeautyCashRegister.tsx:549` `balanceOf` fiyat ×
     adet. §9'daki "masaüstünün kendi borcu" ve §52-16 burada kapanır.
     Masaüstü Coolify'dan elle deploy (kullanıcı).
  5. Cümleler: `invalid_catalog_item` için doğru söz (`errorLine`,
     `collectErrorLine`); otomatik kayıt kalıcı hata alırsa ekranda görünsün.
  6. Katalog: stok izlemeyen sarf ya listelenmesin ya kabul edilsin.
- **Alt soru:** katalog dışı ÜCRETLİ kalemin (ek hizmet / ürün) fiyatını tek
  kişilikte kim yazacak? Bugünkü metin "tutarını kasada müdür yazıyor"
  (`CatalogSearch.tsx:111-114`), ama tek kişilikte masaüstü yok. Seçenekler:
  telefonda fiyat alanı · ücretli türde katalog dışı kapalı (yalnız malzeme).
- **Sıra:** önce `staff-api` (geriye uyumlu: mağazadaki 1.0 da `qty`
  gönderiyor ve reddediliyordu), sonra istemci ve masaüstü.
- **Not:** §7 kuralları korunuyor — tutarı yine sunucu hesaplıyor, istemci
  rakam göndermiyor.

## 3 · 🟠 "Tekrar dene" ölü düğme, "Sonra tahsil et" boşa · S

- [x] Yapıldı (2026-10-16) · [ ] Telefonda denendi (📱 P3)

> `collectSendStep`: `error`/`queued` → yeniden gönderim; önce kuyruk
> boşaltılıyor, kuyruk hâlâ doluysa yeni istek yok ("sırada"), boşsa damga
> taze okunup gönderiliyor (`prepareResend`). "Sonra tahsil et" de aynı yoldan;
> gönderimi düşerse `send_failed` görünüyor (`collectAfterSend`). **Ek bulgu,
> düzeltildi:** ekipte kalemler kuyruğa girince `visit.finish` hiç
> kuyruğa girmiyordu — "Sinyal gelince kendisi gidecek" yanlıştı. Kumanda
> açıkken kuyruk boşalınca gönderim kendiliğinden yeniden kuruluyor (tek
> kişilikte YOK: orada para var).

- **Kanıt:** `send` `error` / `queued` olunca hiçbir yerde `idle`a dönmüyor
  (atamalar yalnız `kumanda.tsx:482, 524, 642, 1191, 1196, 1209, 1212`).
  `onCollect` gönderimi yalnız `send === 'idle' | 'window'` iken başlatıyor
  (`:1191`); aksi hâlde etki doğrudan `send_failed` yazıyor (`:559-562`).
  `CollectBar` düğmeyi ETKİN çiziyor (`CollectBar.tsx:258-261`,
  "Tekrar dene · nakit tahsil et") ve "Sonra tahsil et"i gösteriyor (`:135`);
  ona basınca `collectStage = 'pending'`, istek gitmiyor
  (`kumanda.tsx:1193-1197`).
- **Etki:** uçak modu / bodrum → "bağlantı yok" → sinyal geldi → "Tekrar dene"
  ağ isteği bile atmıyor. Ev kuralı 2 ("dokunulan her kontrol bir iş yapar").
  Kurtuluş yalnız kumandadan çıkıp yeniden girmek. Para çift yazılmıyor
  (§7 kural 5 ve 7 sağlam).
- **Düzeltme:** `send === 'error'` ise gönderimi yeniden başlat; `queued` ise
  önce ziyareti yeniden oku — kuyruk kapanışı sunucuya düşürdüyse doğrudan
  tahsilata geç, düşürmediyse "hâlâ sırada" de. "Sonra tahsil et" de aynı
  kuralla. Test (`tests/tek-tahsilat.test.mjs`): send_failed → Tekrar dene
  bir istek doğurur.

## 4 · 🟠 Kalem kaybı: çıkışta bekleyen yazma ve silme penceresi iptal · S

- [x] Yapıldı (2026-10-16) · [ ] Telefonda denendi (📱 P4)

> Ekran sökülürken ve uygulama arka plana geçerken bekleyen liste hemen
> yazılıyor, açık silme o anda uygulanıyor (`shouldFlushItems`). Yoldaki yazma
> bitmeden yenisi başlamıyor, onun yeni damgasıyla gidiyor (`chainedStamp`).
> **Ek bulgu, düzeltildi:** bodrum katında art arda eklenen her kalem kuyruğa
> ayrı bir liste koyuyordu, hepsi aynı eski damgayla — sinyal gelince ilki
> yazılıp sonrakiler `items_stale` ile atılıyordu. Aynı ziyaretin yeni listesi
> kuyruktakinin yerine geçiyor; doğrudan yazılan liste de kuyruktaki eskisini
> siliyor (`supersedes`). **Açık kalan (1.0.2):** çevrimdışı BAŞLATMA da
> kuyruktaysa damgayı ilerletiyor ve sonraki kalem yazması yine `items_stale`
> alıyor — kumandadan gönderimde liste tekrar yazıldığı için kayıp yalnız
> "çevrimdışı başlat + kalem ekle + göndermeden çık" yolunda.

- **Kanıt:** otomatik yazma 0,7 sn'lik zamanlayıcıyla gidiyor; ekran
  kapanınca zamanlayıcı İPTAL ediliyor, gönderilmiyor (`kumanda.tsx:431-444`,
  `clearTimeout`; `beforeRemove` / flush yok). Silme penceresi açıkken yazma
  tamamen kapalı (`mobile/src/lib/itemsAutosave.ts:48`) ve pencerenin
  kapanışı da ekran kapanınca iptal (`kumanda.tsx:594-601`).
- **Etki (telefonda doğrulanmadı):** (a) kalem ekleyip 0,7 sn içinde "Geri"
  → kalem kayıp. (b) Bir kalemi Kaldır'a basıp 6 sn dolmadan başka kalem
  ekleyip çıkan kişi: eklediği kayıp, sildiği geri geliyor. Kullanıcının
  14 Ekim notu 2'nin dar hâli.
- **Düzeltme:** ekran ayrılırken (`navigation` `beforeRemove`) ve arka plana
  geçerken (`AppState`) bekleyen listeyi hemen yaz, açık silmeyi o anda
  uygula. `write` kuyruğa alabildiği için çevrimdışında da kaybolmaz.
- **Aynı turda (🟡, doğrulanmadı):** yavaş ağda (gidiş-dönüş > 0,7 sn) iki
  yazma üst üste biniyor — ikincisi birincinin damgasına çarpıp `items_stale`
  alıyor, `savedKey` yüzünden yeniden denenmiyor ve kısa süre sahte "başka
  cihazda değişti" şeridi çıkıyor (`kumanda.tsx:431-440`). Düzeltme: yoldaki
  yazma bitmeden yenisini başlatma, sıraya koy.

## 5 · 🔴 Yapay zekâya müşteri adı gitmesin + hakem notu · S + `remind`, `draft-messages` deploy

- [x] Sunucu (2026-10-16) · [ ] Deploy · [ ] Hakem notu · [ ] Gizlilik metninin yapay zekâ paragrafı

> `remind`'in dört istemi ve `draft-messages` adı almıyor; istemde `{AD}`,
> dönen metne ön ad sunucuda konuyor (`aiName.ts`, iki klasörde birebir —
> `_shared`e dokunulmadı). Yer tutucu yoksa / birden fazlaysa şablon;
> `draft-messages`e şablon taslak eklendi. Kilit: `tests/d5-yapay-zeka-ad.test.mjs`.

- **Durum (§52 B7/B8, doğrulandı):** canlı `gizlilik.html` (200) yapay
  zekâdan hiç söz etmiyor; depodaki yayımlanmamış sürüm söz ediyor. Bugün
  veri akışı pratikte sıfır: `remind` cron'u yalnız hattı bağlı işletmeleri
  dolaşıyor (`supabase/functions/remind/index.ts:155` `linkedOrgs`), elle geri
  çağırma `connected` hat istiyor (`:112`) ve hiçbir hat bağlı değil.
  *(Sunucuda hat durumu ve `GEMINI_API_KEY` okunmadı.)*
- **Yeni gözlem:** `docs/apple-notes-alani-SON.txt:47` hakeme "No analytics,
  no advertising, no tracking, **no AI service**." diyor; arka uç Gemini/Groq
  kullanıyor. 1.0.1 aynı notla giderse Apple'a yanlış beyan.
- **Karar ve gerekçe (Claude, kullanıcı bıraktı):** Apple 5.1.2(i)
  (developer.apple.com'dan doğrulandı): *"You must clearly disclose where
  personal data will be shared with third parties, including with third-party
  AI, and obtain explicit permission before doing so."* Yükümlülüğü tetikleyen
  KİŞİSEL VERİ. Ad gitmezse onay ekranı gerekmez. "Metni yayımla" KVKK standart
  sözleşme imzası ister (§40, hukuk kararı kullanıcıda); "kapalı tut" işlevi
  öldürür ve hat bağlanınca (C12) sorun geri gelir. Yer tutucu ikisinin de
  dışında ve KVKK açısından da adı yurt dışındaki yapay zekâya aktarmaz.
- **Bugün kişisel veri gönderen uçlar:**
  - `remind` → Gemini: ön ad + hizmet + saat + salon adı (`remind/index.ts:787`).
  - `draft-messages` → Groq: ön ad + son hizmet + gün (`draft-messages/index.ts:16, 54`).
  - `whatsapp-booking` asistanı → müşterinin mesaj metni; varsayılan KAPALI
    (`whatsapp-booking/index.ts:265`). Kapalı kalıyor; açılması ayrı bir
    onay işi olarak §52'ye yazılacak.
  - `insight` → yalnız toplu sayı (`insight/index.ts:86`) — dokunulmuyor.
- **Uygulama:** istemde ad yerine sabit bir yer tutucu (ör. `{AD}`); dönen
  metinde yer tutucu yoksa ya da birden fazlaysa şablona düşülür; sonra gerçek
  ön ad yerine konur. `_shared` değişirse §6 dersi: argümansız deploy.
- **Hakem notu satır 47 yerine:** "Reminder wording may be drafted on our
  server by Google Gemini or Groq from non-personal inputs only (service type,
  time, salon name). Customer names, phone numbers and messages are never sent
  to any AI service. The optional WhatsApp assistant is off." (Not alanı 4000
  karakter, 3930'u dolu — tamamı yeniden yazılır; 9. maddenin kararıyla
  birlikte.)
- **Gizlilik metni:** yapay zekâ paragrafı "kişisel veri gönderilmez" diye
  sadeleşir. B8'in yurt dışı aktarım kararı (Hostinger, Expo) ayrı kalır;
  1.0.1 için engel değil (1.0 aynı canlı metinle geçti).

## 6 · 🟠 Paket / indirim / kısmi ödeme / grup: Gün ≠ kumanda ≠ kasa · M + `staff-api` deploy

- [x] Karar verildi — **telefon "Kasa'dan tahsil edin" der** · [x] Yapıldı (2026-10-16)

> Kural (`kasaOnlyReason`) sunucuda (`visitItems.ts`) ve telefonda
> (`cashBuild.ts`) aynı, testler aynı girdilerle koşturuyor: grup ·
> `paket_plan_id` · `cash_discount_amount` · canlı önceki tahsilat.
> `visit.collect` bunlarda `collect_in_kasa` (409) dönüyor, para yazmıyor;
> Kasa kapattıysa (`is_paid`) "zaten alındı"; var olan tahsilat tutarı
> karşılamıyorsa kısmi = Kasa. `visit.charge` ve `fetchServiceCharge` sebebi
> taşıyor; kumanda tutarı "—" yazıyor, kadran "TUTARI KASA HESAPLIYOR",
> güvertenin üstünde sebep cümlesi; tek kişilikte güverte kasaya gönderime
> dönüyor (`SendToCash`).

- **Kanıt:** G4 kartının tutarı Kasa'nın bekleyen tutarı
  (`mobile/src/lib/flowBuild.ts:254, 310` → `soloDay.ts:405`). O tutar
  paketli seansta hizmeti 0 sayıyor (`cashBuild.ts:294`), `cash_discount_amount`
  indirimini düşüyor (`:301`), randevuya bağlı önceki ödemeleri düşüyor
  (`:305`), grubu tek adisyon sayıyor (`:272-290`). `visit.collect` bunların
  HİÇBİRİNİ yapmıyor (`staff-api/index.ts:2241-2282`) ve randevuya bağlı
  herhangi bir ödeme varsa hiç yazmadan `alreadyCollected` dönüyor
  (`:2201-2220`). Kumandanın Toplam'ı (`fetchServiceCharge` / `visit.charge`)
  da paketi ve indirimi saymıyor.
- **Etki:** tek kişilik sahip masaüstünden paket seansı bağladıysa Gün
  "₺300" der, kumanda ve kasa paket hizmetini YENİDEN tahsil eder (çift
  tahsilat). Kısmi ödemede "Nakit tahsil edildi" ✓ görünür ama kalan borç
  yazılmaz. Paket bağı ve indirim yalnız masaüstünde kurulabildiği için erişim
  dar. Ekipte para yazılmıyor ama personelin Toplam'ı masaüstü Kasa'dan farklı.
- **Karar gerekli:** sunucu Kasa'nın kuralını (paket, indirim, ödenen, grup)
  mı uygulasın, yoksa bu durumlarda telefon tahsil etmeyip "Kasa'dan tahsil
  edin" mi desin? §7 kural 1 (tutarı sunucu hesaplar) iki yolda da korunur.
  2. maddenin `staff-api` deploy'una bağlanabilir.

## 7 · 🟡 `alreadyCollected` dalı `is_paid` basmıyor · XS (2. maddenin deploy'una)

- [x] Yapıldı (2026-10-16) — var olan tahsilat tutarı karşılıyorsa bayrak orada basılıyor.

- **Kanıt:** `staff-api/index.ts:2218-2220`; yorum (`:2306`) "bir sonraki
  çağrı `existing` görüp düzeltir" diyor ama o dal bayrağa dokunmuyor.
- **Etki:** bayrak yazımı bir kez düşerse Gün satırı sonsuza dek "adisyon
  açık" der (para kaydı doğru).
- **Düzeltme:** `existing` dalında da `is_paid = true`.

## 8 · 🟡 Lint: `CashSheets` render içinde bileşen · XS

- [x] Yapıldı (2026-10-16) — `Row` dosya düzeyinde; dosyada lint 4 → 0.

- **Kanıt:** `mobile/src/components/CashSheets.tsx:190, 227, 236, 241`
  `react-hooks/static-components` — 1.0'dan sonra gelen tek yeni kural ihlali
  (değişen 122 dosyada toplam 349 → 312; kumanda 24 → 16).
- **Düzeltme:** `Row` / `Section`'ı dosya düzeyine taşı.

## 9 · 🟠 Tek kişilik giriş kararı + mağaza metni ve görüntüler · konuşma + S

- [x] Karar verildi — **A** (2026-10-16) · [x] Uygulandı · [ ] "Bu sürümde" metni · [ ] Görüntüler · [ ] Hakem notu

> Karşılama 1.0'daki üç girişe döndü (iki kapı + "Yeni işletme oluştur");
> mod kaydın sonundaki "Yalnız ben / Ekibim var" sorusuyla seçiliyor.

- **Bugün:** karşılamada dört giriş — "İşletmemi yönetiyorum", "Burada
  çalışıyorum", "**Solo** · Tek kişilik işletme kurun", "Yeni işletme oluştur"
  (`mobile/app/(auth)/welcome.tsx:212-281`) — ve kayıt sonunda "Bu işletmede
  işi kim yapıyor? · Yalnız ben / Ekibim var"
  (`mobile/app/(auth)/signup/ready.tsx:178-204`; Solo'dan gelene sorulmuyor).
  İkisi de bir bayrağa bağlı DEĞİL.
- **Konuşulacak seçenekler:**
  - **A · Solo kapısı kalkar, soru kalır** — tek giriş "Yeni işletme
    oluştur", modu kayıt sonundaki soru belirler. Karşılama 1.0'daki üç
    girişe döner; hakem notundaki kayıt yolu değişmez. S.
  - **B · Kapı da soru da kalkar** — herkes ekip açar; İşletme'de "Tek kişilik
    çalışıyorum" geçişi (115'in `end_team`'i hazır). Kayıt en sade, ama mod
    keşfedilmesi zor. M.
  - **C · Bugünkü gibi** — iki giriş de kalır.
  - **D · Bayrakla gizle** — 1.0.1'de tek kişilik yok. S.
- **Karardan sonra:** "Bu sürümde" metni; 7. ekran görüntüsü
  (`docs/app-store-connect-metinleri.md:191`, personel adisyonu) eski
  adisyonu gösteriyor; mod açıksa bir tek kişilik görüntüsü; hakem notunda
  kayıt yolu (5. maddeyle birlikte tek yeniden yazım).

## 10 · 🟡 Sunucu fonksiyonlarının özeti · XS (kullanıcı)

- [ ] Komut çalıştırıldı · [ ] Karşılaştırıldı

1.0'dan beri yalnız 4 fonksiyon yoklandı (`staff-api`, `remind`,
`booking-manage`, `whatsapp-booking`, 2026-10-15). Salt okuma:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'cd /data/coolify/services/t6yi63jbebvj6c7oo7yjofnt/volumes/functions && find . -name "*.ts" | sort | xargs sha256sum | sed "s#  \./#  #"' > ~/Desktop/sunucu-fonksiyon-ozet.txt && wc -l ~/Desktop/sunucu-fonksiyon-ozet.txt
```

## 11 · 📱 Telefon turu → derleme

- [ ] P0 · [ ] P1 · [ ] P2 · [ ] P3 · [ ] P4 · [ ] P5 · [ ] EAS üretim derlemesi · [ ] TestFlight · [ ] ASC

- **P0 · Üretim paketi — ZORUNLU, her şeyden önce:** `cd mobile && npm run
  start:prod` (kullanıcı başlatır) → uygulamayı tamamen kapat, aç → demo
  müdür, tek kişilik hesap ve personel telefonuyla soğuk giriş → Gün / Akış /
  kumanda / Kasa / İşletme açılıyor; kırmızı LogBox yok (`--no-dev`'de konsol
  Metro'ya akmaz, hata yalnız telefonda görünür).
- **P1 · Hakem yolu, yeni hesap:** Yeni işletme oluştur → (9. maddenin
  kararına göre) tek kişilik kayıt → hizmet + ilk randevu → Başlat → BİTİR →
  Nakit tahsil et → İşletme › Hesap › "Hesabımı sil" → "Hesabınız silindi".
- **P2 · Adet / katalog dışı (2. madde sonrası):** ürüne iki kez dokun (×2)
  → BİTİR → tahsil et → Kasa'da TEK kayıt, tutar = ekrandaki Toplam;
  "Katalogda ara" → olmayan ad → ekle → geri çık, yeniden aç → kalem duruyor;
  ekip personelinde "kasaya gönder" geçiyor.
- **P3 · Tekrar dene (3. madde sonrası):** uçak modu → BİTİR → tahsil et →
  "bağlantı yok" → uçak modunu kapat → Tekrar dene → tahsil edildi.
- **P4 · Kalem kaybı (4. madde sonrası):** kalem ekle → hemen Geri → aç →
  kalem duruyor; Kaldır → 6 sn dolmadan başka kalem ekle → Geri → aç →
  silinen gitmiş, eklenen duruyor.
- **P5 · Devirde "telefonda denenmedi" kalanlar** (§50'nin 2–5 ve 9–11'i
  kullanıcı beyanıyla yapıldı):
  - §51 · masaüstünden personele YARINA randevu → personel bildirime dokunur
    → Takvim o günde, randevuya kaymış.
  - §50 son · ekip Kasa'sında "n adisyon tahsil edilmedi" şeridi → liste →
    birini seç → Akış'ta kendi satırı.
  - §36 · deneme hesabında Ekip ekle → kişi › "Çıkar ve tek kişiliğe dön" → Gün.
  - §38 · Personel sayfası + → ad, meslek → liste kendiliğinden güncellenir.
  - §34 · randevu kartı → "Hizmeti değiştir" / "Notu düzenle" → aşağı çek →
    kapanır, kayıt bozulmaz.
  - §32 · tamamlanan randevuda saat/hizmet değiştir yok; tahsil edilmişte
    "Sil" yerine "önce Kasa'dan geri alın".
  - §29 · Kasa › hareket › Düzelt → klavye açıkken "Kaydet" görünür.
  - §28 · tek kişilik Takvim: tek sütun, yazı okunur.
  - §20 / §24 · yarınki randevu kartında "Müşteriyi ara" ve "Mesajla
    hatırlat" → WhatsApp hazır metinle açılır (göndermeden kapat).
  - WhatsApp "görüşmek istiyor" → hat bağlanmadan denenemez.
- **Derleme:** P0–P5 geçince `eas build --profile production --platform ios`
  → TestFlight'ta soğuk açılış → ASC (sürüm 1.0.1, "Bu sürümde", not,
  görüntüler). Xcode / derleme yalnız kullanıcının açık yayın emriyle.

---

## Ek · denetimin temiz çıkardıkları (kanıt özeti)

| Kontrol | Sonuç | Nasıl |
|---|---|---|
| Test paketi | 3046 test · 3039 geçti · 0 kırık · 7 atlandı | `npm test` |
| TypeScript | temiz, çıkış 0 | `cd mobile && npx tsc --noEmit` |
| Lint | değişen 122 dosyada 349 → 312; yeni yalnız 8. madde; `tek/_layout` 4 ikon `require`'ı (müdür kabuğuyla aynı, zararsız) | `eslint` HEAD ↔ `git show 9993086:<dosya>` |
| Tanı satırı / `console.log` | 0 / 0 | `grep` |
| Dinamik `import()` / `__DEV__` dalı | yok / yalnız yorum | `grep` |
| Sır taraması | temiz; `mobile/.env` `.gitignore`'da | `git ls-files`, `git grep` |
| Native yapılandırma | `mobile/package.json`, `app.json`, `eas.json` 1.0'dan beri değişmedi | `git diff --stat 9993086 HEAD` |
| EAS production | `AUTH_MODE=live`, `APP_URL`, `SUPABASE_URL` doğru; anon anahtar yerelle birebir, `"role":"anon"` | `eas env:list production` (anahtar basılmadan karşılaştırıldı) |
| Push (fetch'siz) | `tek-kisilik` origin'in 1 önünde (belge), `main` = `origin/main` | `git rev-list` |
| Canlı sunucu | son fonksiyon commit'i `f670bc6` deploy edildi; göç 108–118 canlıda | devir §6 |
| §7'nin on kuralı | yerinde: `visitCollect` `call` ve yalnız yöntem gönderiyor; anahtar dokunuşa ait; iki başarısızlık ayrı | kod |
| §50 yarış düzeltmesi | dallar doğru (yazma yok → `lockStamp`; yolda → taze damga; başka cihaz → `null`, kilit korur); tek açık 4. maddedeki çarpışma | kod |
| Hizmet ücreti iki yol | `fetchServiceCharge` (tek) ↔ `visit.charge` (ekip) ↔ `visit.collect` aynı zincir | kod |
| 5.1.1(v) hesap silme | `account-delete` değişmedi; 108–118 FK'leri `CASCADE`/`SET NULL`; tek kişilikte İşletme › Hesap › Hesabımı sil açık | kod |
| 3.1.1 | satın alma çağrısı yok; dış bağlantı yalnız gizlilik, destek, `wa.me`; test kilitli | `grep` |
| App Privacy | hâlâ doğru (`staff_devices` sunucu kimliği Device ID altında; tahsilat Financial Info) | `docs/app-store-connect-metinleri.md` §2 |
| `app.json` | şifreleme `false`, privacy manifest 4 kategori, Face ID metni, `supportsTablet: false` — tek eksik sürüm (1. madde) | okuma |

### §52 bilinenlerin durumu (yeni bulgu değil)

| §52 | Durum | Yayın engeli |
|---|---|---|
| A2 personel başka gün bildirimi, WhatsApp "görüşmek istiyor" | telefonda denenmedi (📱 P5) | hayır |
| A3 giriş ekranı | şifre sıfırlama 1.0'daki dürüst ekran (`EMAIL_RECOVERY_READY = false`) | hayır |
| B5 `--no-dev` | yapılmadı | **evet — 📱 P0** |
| B6 tek kişilik açık mı | 9. madde | karar |
| B7 / B8 | 5. madde (B8'in yurt dışı kararı ayrı) | B7 evet, B8 hayır |
| B9 Sentry · B10 personel girişi · B11 dinamik yazı | değişmedi | hayır |
| C12 WhatsApp hattı | bağlı değil | hayır |
| C13 `info@` | şifre unutanın tek yolu, kutu denenmedi | hayır — yayından önce bir deneme e-postası önerilir |
| C16 Kasa adet | 2. maddede kapanır | — |
| D Dodo / Core | değişmedi | hayır |
