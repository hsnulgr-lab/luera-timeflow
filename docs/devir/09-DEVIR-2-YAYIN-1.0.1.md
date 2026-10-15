# DEVİR 2 · MOBİL 1.0.1 YAYINI

**Yazıldı:** 2026-10-15 gece · **Hedef:** 2026-10-16'da (yarın) bütün
düzeltmeler bitsin, 1.0.1 Apple'a gönderilsin.
**Dal:** `tek-kisilik` (`e89d4c3` + bu gecenin commit'lenmemiş belgeleri) ·
`main` = `origin/main` = `817b2c9` (bir belge commit'i geride).
**Testler:** 3046 · **3039 geçti · 0 kırık · 7 atlandı** · `tsc` temiz.

Bu belge tek başına yeterli olmak için yazıldı. Önceki devir
(`08-TEK-KISILIK-DEVIR.md`, 2650+ satır) tek kişilik kabuğun tarihi; bu
belge ondan YAYIN için gereken her şeyi alıyor. Ayrıntı gerekince ona
bölüm numarasıyla bakılır (§7, §9, §52 gibi).

---

## 00 · KULLANICI İÇİN · YARIN NASIL BAŞLANIR

Basit sürümü, kutulu: `docs/1.0.1-yayin-gunu-ADIM-ADIM.md`.

| Ne | Seçim | Neden |
|---|---|---|
| Oturum | **Yeni oturum**, Code sekmesi, klasör `~/Projects/luera-timeflow` | Bu belge tek başına yeter; dünkü uzun konuşmayı taşımaya gerek yok |
| Worktree | **YOK — doğrudan proje klasörü** | Bu üç belge commit'lenmedi; worktree yalnız commit'lenmiş dosyaları görür. (Önce commit'lenirse worktree de olur.) |
| Mod | Başta **Plan modu** → sorular cevaplanıp plan onaylanınca **Auto** (ya da her düzenlemeyi görmek isterseniz **Accept edits**) | Açılış okuma + karar; ondan sonrası kod. ssh / deploy / EAS komutlarını yine siz çalıştırırsınız |
| Model · efor | **Opus 5.5 · xhigh** (Faz 1–3: para yolu ve sunucu) · Faz 5'in metinleri için **high** yeter | Para yazan akış ve iki taraflı sözleşme hatası (D2) dikkat istiyor |
| Hazırlık | Telefon şarjlı, Expo Go açık, Mac ile aynı ağda · bir terminal sekmesi (ssh / deploy) · `eas` girişi açık · App Store Connect erişimi · demo hesabın şifresi elinizde | Faz 3–6 bunları istiyor |

İlk mesaj (kopyalayıp yapıştırın):

```text
docs/devir/09-DEVIR-2-YAYIN-1.0.1.md'yi oku ve §0'daki sırayla başla. Önce §2'deki dört kararı tek seferde sor, cevaplardan sonra Faz 1'e geç. Hedef: bugün hepsini bitirip 1.0.1'i Apple'a göndermek.
```

Akış tek oturumda Faz 1 → 6 gider; düzeltilecekler belgesindeki kutular
işaretlendikçe ilerleme kayıtta kalır. Oturum çok uzarsa ya da yarıda
kalırsa yeni oturuma aynı ilk mesaj verilir — kutular nerede kalındığını
söyler. **Aynı dosyalara (kumanda, `staff-api`) iki oturum birden
yazmamalı.** İstenirse kararlar verildikten sonra Faz 5'in metinleri (hakem
notu, "Bu sürümde") ayrı bir oturumda paralel yazılabilir — onlar kod
dosyalarına dokunmuyor.

Zaman: EAS derlemesi ~20–30 dk, Apple incelemesi genelde 24–48 saat.

---

## 0 · OTURUMA BAŞLARKEN (sırayla, atlama)

1. **Bu belgeyi baştan sona oku.** Sonra
   `docs/yayin-oncesi-duzeltilecekler-1.0.1.md` — bulguların kanıtı (dosya:
   satır), parçaları ve kutuları orada. Bu belge SIRAYI veriyor, o belge
   AYRINTIYI.
2. `mobile/AGENTS.md` — kod yazmadan önce zorunlu (Expo SDK 57, kurulu tipler
   bağlayıcı, gesture-handler YOK).
3. Durum yoklaması (salt okuma):
   ```bash
   cd /Users/furkanulger/Projects/luera-timeflow && git status --short && git log --oneline -3 && npm test 2>&1 | tail -8
   ```
   Beklenen: `tests 3046 · pass 3039 · fail 0 · skipped 7`. `site/` izlenmeyen
   klasörü bu işle ilgisiz — DOKUNMA.
4. **Dört kararı TEK seferde sor** (AskUserQuestion, işe başlamadan — §2'deki
   "Yarın sorulacaklar"). Cevaplar gelmeden ilgili maddeye girme; cevap
   beklemeyen maddelerle başla (§3 · Faz 1'in ilk üç adımı karar beklemiyor).

---

## 1 · DEĞİŞMEZ KURALLAR (her şeyin üstünde)

### Kullanıcının duran emirleri
- **"Tasarım bel kemiği":** doğru veri + bozuk görünüm = iş bitmemiş.
- **"Ekran yalan söylemez"** (sunucu kabul etmeden ekran değişmez) ·
  **"Dokunulan her kontrol bir iş yapar"** (süs düğme yok) · **"Yazma önce
  sunucuya gider"** (iyimser yazma yok). Kaynak metni eşleyen testler koruyor.
- v4 ve Personel 15 tasarımları birebir; "yaklaşık aynı" kabul edilmiyor.

### Çalışma kuralları
- **ssh, deploy ve göç komutlarını KULLANICI çalıştırır.** Claude komutu
  verir, çıktıyı ister, sonra uçları kendisi yoklar (curl, kimliksiz).
- **Simülatör YASAK.** Doğrulama fiziksel telefonda Expo Go. **Xcode / EAS
  derlemesi yalnız kullanıcının açık yayın emriyle** — yarın için emir
  verildi ("yarın … apple'a gönderelim"), ama derleme komutunu yine kullanıcı
  çalıştırır ya da tek tek onaylar.
- **Yayın öncesi `--no-dev` üretim paketi testi ZORUNLU** (bir kez mağaza
  derlemesi açılmaz hâle gelmişti — dinamik `import()`).
- **Commit / push yalnız kullanıcı isteyince.** Push SSH ile çalışıyor.
- **Edge function deploy'u:** `./scripts/deploy-functions.sh <ad…>`;
  `supabase functions deploy` KULLANILMAZ. `_shared` değiştiyse ARGÜMANSIZ
  koş (hepsi) — tek fonksiyon deploy'u `remind`'ı bir kez öldürmüştü.
  Deploy betiği ÇALIŞMA AĞACINI kopyalıyor, dala bakmıyor: deploy'dan sonra
  `main`'i aynı noktaya getir (canlı sunucu kodu = `main` kuralı).
- **Deploy sonrası log tail kanıt değildir;** ucu çağır.
- Göçler önce PGlite'ta (`yayin` hafızası: `yerel_postgres_pglite`), sonra
  üretimde kuru koşu → göç → test. 1.0.1 için YENİ GÖÇ BEKLENMİYOR.

### Yeniden önerilmeyecekler
- **İptal edilenler:** T2 takvim · kumandanın komşu iş şeridi · Gün hapının
  üç önerisi · kumandanın öteki alt sayfalarına sade görünüm.
- **Bilinçli ayrışmalar (08 · §9):** `hourRange` → DOKUNMA; G3 etiketi yalnız
  "BEKLEMEDE"; `VoidBlock`/`DayHeader` birkaç pt farkı; R2 düğme metni.
- **Kullanıcı kararları:** adisyonda picker YOK; tek kişilikte ve ekipte
  tutar maskesi KALKTI (açık); silme fitili "kalsın".
- **VPS root SSH şifre sertleştirmesi:** kullanıcı yapmama kararı verdi —
  gündeme getirme.
- Claude Design'a `Durumlar.html` ve `Hareket Sözleşmesi.html` VERİLMEZ.

### Para yolu (08 · §7) — tek kuralı bile gevşetme
Tutarı sunucu hesaplar · yöntem seçilmeden düğme kapalı · düğme yöntemle
adlanır · `send_failed` ≠ `collect_failed` · para çevrimdışı kuyruğa girmez
(`call`, `write` değil) · para kaydı önce `is_paid` sonra · iki kapı
(idempotens anahtarı dokunuşa ait + var olan ödeme sorgusu) · sıfır tutarda
"tekrar dene" yok · tahsilat gönderimden sonra · kuyruğa giren gönderim
"olmuş" sayılmaz. Kilit: `tests/tek-tahsilat.test.mjs`.

---

## 2 · KARARLAR

### Verilenler (2026-10-15 gece)
| Konu | Karar | Kim |
|---|---|---|
| Ücretli kalemde adet / katalog dışı kalem | **Sunucu kabul etsin**; telefon ve masaüstü Kasa fiyat × adet | kullanıcı |
| Yapay zekâ (§52 B7) | **Müşteri adı yapay zekâya hiç gitmesin — yer tutucu** | kullanıcı Claude'a bıraktı; gerekçe düzeltilecekler belgesi 5. madde |
| Sıra | Bütün bulgular ayrı belgede, sırayla, yarın bitecek, Apple'a gidecek | kullanıcı |

### Yarın oturum başında TEK soruda sorulacaklar
1. **Tek kişilik giriş (düzeltilecekler 9):** A · Solo kapısı kalkar, kayıt
   sonundaki soru kalır (önerilen sade yol, S) · B · kapı da soru da kalkar,
   İşletme'de geçiş (M) · C · bugünkü gibi · D · bayrakla gizle. Kullanıcı:
   "belki Solo kapısını kaldırıp alternatif buluruz."
2. **Katalog dışı ÜCRETLİ kalemin fiyatı (düzeltilecekler 2, alt soru):**
   telefonda fiyat alanı mı, yoksa ücretli türde katalog dışı kapalı mı
   (yalnız malzeme serbest)?
3. **Paket / indirim / kısmi ödeme / grup (düzeltilecekler 6):** sunucu
   Kasa'nın kuralını mı uygulasın (M), yoksa bu durumlarda telefon "Kasa'dan
   tahsil edin" mi desin (S)?
4. **Giriş ekranı (§52 · A3) 1.0.1'e girmiyor** — onay iste (aşağıda gerekçe).
5. *(Faz 6'da sorulur)* **Kademeli yayın (Phased Release) açılsın mı?** Öneri:
   evet — OTA güncelleme yok, kırık çıkarsa duraklatmanın tek yolu bu.

### Neden A3 (Apple/Google ile giriş, kodla şifre sıfırlama) 1.0.1'de DEĞİL
`docs/giris-yeniden-plan.md`: önkoşul SMTP sağlayıcısı + `lueratech.com` DNS
(SPF/DKIM/DMARC) + Coolify'da GoTrue ortamı (Restart = yedek + sakin saat);
Apple ile giriş yeni native yetenek ve `.p8` anahtarı, hesap silmede belge
iptali (TN3194); Google native modül; ikisi Expo Go'da tam denenemez. Bir
günde bitip incelemeye girmesi gerçekçi değil ve 1.0'daki dürüst "şifre
bağlantısı şu an gönderilemiyor" ekranı incelemeden geçti. **Öneri: 1.0.1
gönderildikten sonra ilk iş (1.0.2).** Kullanıcı aksini derse sıra baştan
kurulur.

---

## 3 · YARININ SIRASI (2026-10-16)

Madde numaraları (`D1`…`D11`) `docs/yayin-oncesi-duzeltilecekler-1.0.1.md`
başlıklarıdır; kanıt, parçalar ve kutular orada. Her adımdan sonra:
yeni test eski kodda kırılır → `npm test` → `cd mobile && npx tsc --noEmit` →
değişen dosyada lint artmaz.

### Faz 1 · İstemci ve sunucu kodu (Claude)
| Sıra | İş | Madde | Büyüklük | Karar bekler mi |
|---|---|---|---|---|
| 1 | Sürüm `1.0.0` → `1.0.1` (`mobile/app.json:5`) | D1 | XS | hayır |
| 2 | "Tekrar dene" ve "Sonra tahsil et" gerçekten yeniden göndersin | D3 | S | hayır |
| 3 | Kalem kaybı: çıkışta / arka planda bekleyen yazmayı hemen yaz, açık silmeyi uygula; yoldaki yazmayı sıraya koy | D4 | S | hayır |
| 4 | `staff-api` `visit.items`: ek hizmet + satılan ürün `qty` 1–20; kimliksiz kalem (cevap 2'ye göre); stok izlemeyen sarf | D2 · 1, 6 | M | evet (2) |
| 5 | Aynı dosyada: `alreadyCollected` dalı `is_paid` bassın | D7 | XS | hayır |
| 6 | Aynı dosyada: paket / indirim / kısmi / grup (cevap 3'e göre) | D6 | S–M | evet (3) |
| 7 | Telefon Kasa'sı `cashBuild.adisyonLines` fiyat × adet; `invalid_catalog_item` ve otomatik kayıt hatası için doğru cümle | D2 · 3, 5 | S | hayır |
| 8 | Yapay zekâ: `remind` ve `draft-messages` istemde ad yerine yer tutucu, dönüşte geri koy; yer tutucu yoksa şablon | D5 | S | hayır |
| 9 | Tek kişilik giriş (cevap 1'e göre) | D9 | S–M | evet (1) |
| 10 | Lint: `CashSheets` `Row`/`Section` dosya düzeyine | D8 | XS | hayır |

**Sıranın sebebi:** karar beklemeyen ve para akışını kilitleyen işler önce
(1–3); `staff-api` değişiklikleri (4–6) TEK deploy'da toplansın; yapay zekâ
ve giriş kararı birbirinden bağımsız, sona doğru.

### Faz 2 · Masaüstü (Claude) — D2 · 2, 4
Masaüstü ücretli kalemi bugün ADETSİZ topluyor. Değişecek yerler (hepsi
`src/`, tek kaynak hazır: `src/utils/reservationServices.ts:87`
`adisyonExtras` zaten fiyat × adet):
- `src/pages/BeautyCashRegister.tsx:415-427` Kasa satırı `quantity: 1` →
  kalemin adedi (stok düşümü `deductSoldStock` `:733-746` `line.quantity`'yi
  zaten kullanıyor — satış adet kadar düşer).
- `:549-566` `balanceOf` → `adisyonExtras`.
- `src/hooks/usePendingBills.ts:75`, `src/mobile/pages/MobileKasa.tsx:132`,
  `src/components/dashboard/{Berber:199, Estetik:256, Guzellik:106}Dashboard.tsx`
  → `adisyonExtras`.
- Toplamın satırlardan nasıl hesaplandığını (fiyat × miktar mı) kodda
  doğrula; çift çarpma olmasın.
- Yerelde `npm run build` geçmeli (masaüstü bozuksa `main`'e dokunmadan
  bilinir).

### Faz 3 · Commit ve deploy (kullanıcı çalıştırır, Claude yoklar)
1. Claude commit'ler (kullanıcı "commit'le" deyince) — iş başına bir commit.
2. **`staff-api` deploy** (Faz 1 · 4–6). `_shared` değişmediyse:
   ```bash
   cd ~/Projects/luera-timeflow && ./scripts/deploy-functions.sh staff-api
   ```
   Geriye uyumlu: mağazadaki 1.0 da `qty` gönderiyordu ve reddediliyordu.
3. **`remind` + `draft-messages` deploy** (Faz 1 · 8). `_shared`e
   dokunulduysa ARGÜMANSIZ:
   ```bash
   cd ~/Projects/luera-timeflow && ./scripts/deploy-functions.sh remind draft-messages
   ```
4. **Yoklama (Claude):** 18 fonksiyon `OPTIONS` → 200; `staff-api` jetonsuz →
   `invalid_token`; `remind` POST `{}` → kendi 401 metni ("yalnız
   zamanlayıcı…"). Kalem adedi jetonun arkasında — kanıtı telefon (P2).
5. **Masaüstü:** push → `main` ileri al → Coolify'dan ELLE deploy (kullanıcı).
   Ön kontrol sırası (hafıza `masaustu_canli_geride`): göçlerin varlığı →
   tam yedek → yerelde `npm run build` → deploy → canlı pakette yeni kodun
   izini doğrula.

### Faz 4 · Telefon (kullanıcı, Expo Go) — D11
Sıra zorunlu: **P0 önce.** Adımlar düzeltilecekler belgesinin 11. maddesinde.
- **P0** `cd mobile && npm run start:prod` → tamamen kapat, aç → üç kabuk
  soğuk giriş, kırmızı ekran yok. *(`--no-dev`'de hata yalnız telefonda
  görünür, Metro'ya akmaz.)*
- **P1** yeni hesapla hakem yolu (kayıt → ilk randevu → tahsil → hesap sil).
- **P2** ×2 ürün ve katalog dışı kalem → tahsil → Kasa'da tek kayıt, tutar =
  ekrandaki Toplam; ekip personelinde "kasaya gönder" geçiyor.
- **P3** uçak modu → Tekrar dene çalışıyor. **P4** kalem kaybı yok.
- **P5** devirde denenmemiş kalanlar (§51 personel başka gün bildirimi, §50
  ekip Kasa şeridi, §36, §38, §34, §32, §29, §28, §20/§24).
Bir kırık çıkarsa: düzelt → test → (sunucuysa) deploy → aynı P adımı.

### Faz 5 · Mağaza hazırlığı (Claude yazar, kullanıcı girer)
1. **Hakem notu** — `docs/apple-notes-alani-SON.txt` yeniden yazılır (tamamı;
   4000 sınır, bugün 3930 dolu): satır 47 "no AI service" yerine yer tutucu
   cümlesi (düzeltilecekler 5); kayıt yolu ve tek kişilik (cevap 1'e göre);
   video satırı "1.0.0 (4)" diyor — 1.0.1'de video zorunlu değil, satır
   çıkarılır ya da "earlier recording" denir. Kimlik bilgileri nota YAZILMAZ
   (Sign-In Information alanında).
2. **"Bu sürümde" (What's New) metni** — `docs/app-store-connect-metinleri.md`
   içine yeni başlık `## 1.0.1 · Bu sürümde` olarak yazılır. Türkçe, kısa: tek kişilik işletme
   (karar C/A/B ise), sade adisyon, Kasa'da düzelt / geri al, bildirime
   dokununca doğru ekran, kayıp telefonun bağını koparma, hata düzeltmeleri.
   Satın alma / fiyat / abonelik sözü YOK (3.1.1, `apple-yonlendirme-yasagi`).
3. **Ekran görüntüleri** — 7. görüntü (personel adisyonu) eski tasarım:
   yenisi telefondan çekilir. Tek kişilik açıksa bir görüntü eklenir.
   Telefondan çek (Mac görüntüsü alfa taşır, Apple reddeder). Demo tohumu
   10:30–17:00 arası canlı kipte. iPhone Air 1260×2736 6.9″ yuvasında kabul.
4. **`info@lueratech.com`'a deneme e-postası** — şifre unutanın tek yolu bu
   kutu (§52 C13); kullanıcı başka bir adresten yazıp geldiğini görsün.
5. Gizlilik metni (B8) bu sürüm için yayımlanmıyor; 1.0 aynı canlı metinle
   geçti ve yer tutucuyla yapay zekâya kişisel veri gitmiyor.

### Faz 6 · APPLE / EAS — derleme ve gönderim (DİKKATLE, kullanıcının açık emriyle)

Bu fazda geri dönüş pahalı: telefonda OTA güncelleme yok (`expo-updates`
kurulu değil). Mağazaya çıkan her kırık ancak YENİ derleme + YENİ incelemeyle
düzelir. O yüzden her kapı tek tek geçilir; biri bile geçmezse sonraki adıma
gidilmez. Komutları kullanıcı çalıştırır; Claude çıktıyı okuyup "geçti /
geçmedi" der.

**Bugünkü ölçüm (2026-10-15 gece, salt okuma):** `eas-cli 24.14.0` · giriş
`luera` (hsnulgr@gmail.com) · uzak iOS derleme numarası **4** (bir sonraki
**5**) · son mağaza derlemeleri 3 ve 4, ikisi de `9993086`'dan, öncelik
NORMAL, 36 dk arayla · production ortamında 4 değişken
(`APP_URL`, `AUTH_MODE=live`, `SUPABASE_ANON_KEY` [`role: anon`, yerelle
birebir], `SUPABASE_URL`).

#### 6A · Derlemeden ÖNCE — kapılar (hepsi ✓ olmadan derleme YOK)
1. [ ] Düzeltilecekler belgesinde D1–D10'un kutuları işaretli; D9 kararı uygulandı.
2. [ ] `npm test` → 0 kırık · `cd mobile && npx tsc --noEmit` → temiz.
3. [ ] Telefonda **P0 (üretim paketi)** ve P1–P5 geçti.
4. [ ] Sürüm ve Info.plist doğru (Claude çalıştırır):
   ```bash
   cd ~/Projects/luera-timeflow/mobile && npx expo config --type introspect | grep -E "CFBundleShortVersionString|ITSAppUsesNonExemptEncryption|NSFaceIDUsageDescription|CFBundleDisplayName"
   ```
   Beklenen: `1.0.1` · `false` · Face ID metni · `TimeFlow`.
5. [ ] Mağaza JS paketi yerelde tek parça derleniyor (Claude çalıştırır; EAS
   dakikası harcamadan Metro hatasını yakalar):
   ```bash
   cd ~/Projects/luera-timeflow/mobile && npx expo export --platform ios --output-dir /tmp/luera-export-1.0.1
   ```
6. [ ] **Çalışma ağacı temiz:** her şey commit'li, `tek-kisilik` ve `main`
   aynı noktada ve push'lu (`git status` boş — yalnız `site/` kalabilir).
   EAS commit'lenmemiş değişikliği de yükler; derlenen şey bir commit'e
   karşılık gelmezse sonra neyin yayında olduğunu kimse bilemez.
7. [ ] EAS kimliği ve ortamı (Claude çalıştırabilir, salt okuma):
   ```bash
   cd ~/Projects/luera-timeflow/mobile && npx -y eas-cli@latest whoami && npx -y eas-cli@latest build:version:get -p ios && npx -y eas-cli@latest env:list production
   ```
   Beklenen: `luera` · `buildNumber - 4` · 4 değişken, `AUTH_MODE=live`.
8. [ ] Demo hesabı mağazadaki 1.0 ile girilebiliyor (şifre App Store
   Connect › Sign-In Information'dakiyle aynı; DEĞİŞTİRME).

#### 6B · Derleme (kullanıcı çalıştırır)
```bash
cd ~/Projects/luera-timeflow/mobile && npx -y eas-cli@latest build --profile production --platform ios
```
- Günlüğün başında "loaded from the production environment" satırı dört
  değişkeni saymalı; sürüm `1.0.1`, derleme `5` görünmeli.
- Apple hesabına girmesi istenirse girin. Sertifika ve profil Eylül 2026'da
  oluşturuldu (bir yıl geçerli) — **yenisini üretme**, var olanı kullan.
- Push bildirimi sorulursa: **var olan APNs anahtarını kullan** (geliştirme
  derlemesinde push bu anahtarla çalıştı), yeni anahtar üretme.
- Süre 20–30 dk. Bitince durum `FINISHED`. Hata verirse günlüğün son 40
  satırını Claude'a yapıştırın; tekrar derlemeden önce sebep bulunur
  (her deneme derleme numarasını bir artırır — zararsız ama karışıklık).

#### 6C · App Store Connect'e yükleme (kullanıcı çalıştırır)
```bash
cd ~/Projects/luera-timeflow/mobile && npx -y eas-cli@latest submit --platform ios --latest
```
- `--latest` en son derlemeyi seçer — ekranda `1.0.1 (5)` yazdığını doğrula.
- `eas.json`'da `ascAppId: 6816258771`; ASC API anahtarı (`35NB9733H6`,
  APP_MANAGER) EAS'ta kayıtlı.
- Apple tarafında işlenmesi 5–30 dk; "has completed processing" e-postası gelir.
- Şifreleme sorusu ÇIKMAMALI (Info.plist'te `ITSAppUsesNonExemptEncryption = false`).

#### 6D · TestFlight — GÖNDERMEDEN ÖNCE gerçek paketle (kullanıcı, telefonda)
1. [ ] TestFlight uygulaması → Luera TimeFlow `1.0.1 (5)` → Yükle.
2. [ ] Mac'te Metro KAPALI. Uygulamayı tamamen kapatıp aç → soğuk açılış.
3. [ ] Demo müdür girişi → Akış, Takvim, Kasa, kumanda açılıyor.
4. [ ] Kendi tek kişilik hesabınızla bir iş → BİTİR → tahsil et → Kasa'da tek kayıt.
5. [ ] Profil › Yasal ekranında sürüm `1.0.1 (5)`.
6. [ ] **Uzaktan bildirim** — mağaza paketinde ilk kez sınanıyor (Eylül'de
   yalnız geliştirme derlemesinde doğrulandı). Kendi hesabınıza
   rezervasyon sayfasından randevu alın → bildirim gelmeli → dokununca
   randevu kartı açılmalı. Gelmezse DUR, Claude'a söyle (APNs'in üretim
   tarafı `eas credentials`'ta yoklanır). Demo salona deneme randevusu
   ATMAYIN — hakemin verisi.
7. [ ] Yeni bir deneme hesabı aç → hemen sil → "Hesabınız silindi" (hakem bunu
   mutlaka dener).

#### 6E · App Store Connect — ekran ekran (kullanıcı)
1. **My Apps → Luera TimeFlow** → sol üstte **iOS App** yanında **+** →
   `1.0.1` → **Create**. (Önceki sürümün metinleri ve görüntüleri kopyalanır.)
2. **What's New in This Version** — ZORUNLU. `docs/app-store-connect-metinleri.md`
   › "1.0.1 · Bu sürümde" metni. Satın alma / fiyat / abonelik sözü yok.
3. **Screenshots** — değiştirmek ZORUNLU DEĞİL. Değiştirilecekse telefondan
   çekilmiş görüntü (Mac görüntüsü alfa taşır, reddedilir); aynı yuvadaki
   öteki görüntülerle boyut uyumunu ASC gösterir — reddederse eskisi kalsın.
   *(Karışık boyut kabulü doğrulanmadı.)*
4. **Build** → **Add Build** → `1.0.1 (5)` seç. Kutuda sürüm ve derleme
   numarası ayrı yazar; 1.0.0'ın 2/3/4'ünü seçme.
5. **App Review Information:** Sign-in required ✓ (demo kullanıcı ve şifre
   DEĞİŞMEDİ) · **Notes** → içini tamamen sil, `docs/apple-notes-alani-SON.txt`
   yapıştır, sayaç eksiye düşmesin · Attachment'taki eski video kalabilir
   (notta "earlier build" denir) · iletişim bilgileri aynı.
6. **Version Release:** "Manually release this version" ✓.
7. **Phased Release for Automatic Updates — ÖNERİ: AÇ.** Güncelleme 7 günde
   kademeli iner; kırık çıkarsa **duraklatılır**. OTA olmadığı için tek
   emniyet kemeri bu. (Karar kullanıcıda; kapalı da gönderilebilir.)
8. Sağ üstte **Save** (kaydedilmemiş değişiklik varken "Add for Review" gri
   kalır) → **Add for Review** → açılan gönderim sayfasında **Submit for Review**.
9. Sorular çıkarsa: üçüncü taraf içerik → **No** · IDFA → **No**.
10. Durum **Waiting for Review** olmalı. Ekran görüntüsünü Claude'a atın;
    Devir 2'ye işlenir.

#### 6F · İnceleme sürerken ve sonra
- **DOKUNMA:** Cancel Submission, yeni derleme yükleme, metadata değiştirme
  incelemeyi sıfırlar. Sürüm sayfasındaki "cancel this release" bağlantısı
  sürümü sıradan çeker.
- **Ret gelirse:** panikle yeni derleme ATMA. Metni oku, hangi yönergeyi
  gösteriyor bak, Claude'a getir. Hazır cevaplar: `docs/apple-2.1-bilgi-talebi-cevabi.md`
  (3.2 ve 5.1.1(ix)). Reply alanı da 4000 karakter.
- **Onay gelince:** durum "Pending Developer Release" → **Release This
  Version** (kullanıcı). Kademeli yayın açıksa ilk gün kullanıcıların küçük
  bir kısmına gider.
- Yayından sonra: mağaza sayfasında "Sürüm 1.0.1" görünüyor mu; kendi
  telefonunuzu App Store'dan güncelleyip soğuk açın.

#### 6G · Tuzaklar (bir kez yaşandı ya da kolayca yaşanır)
- **`.easignore` OLUŞTURMA.** Varsa EAS `.gitignore`'u yok sayar → `mobile/.env`
  ve başka gizli dosyalar Expo'ya yüklenebilir. Bugün yok; `site/` (3,2 MB,
  izlenmeyen statik site) arşive girer ama zararsız.
- **Kirli ağaçla derleme** — derlenen paket hiçbir commit'e denk gelmez (6A·6).
- **Üretim paketi testi atlanırsa** mağaza paketi açılmayabilir (Eylül'de
  dinamik `import()` yüzünden oldu). P0 ve 6D·2 ZORUNLU.
- **Mac ekran görüntüsü** alfa kanalı taşır, Apple reddeder.
- **Notes ve Reply** alanları 4000 karakter; ekleme yapılmaz, tamamı yeniden yazılır.
- **Add Build** kutusunda 1.0.0'ın eski derlemeleri de görünür — sürüm + numara.
- **Demo şifresini değiştirme** — Sign-In Information'daki ile aynı kalmalı.
- **"Add for Review" gri** → önce Save.

---

## 4 · 1.0.1 GÖNDERİLDİKTEN SONRA (sırayla)

| Sıra | İş | Kaynak |
|---|---|---|
| 1 | **Giriş ekranı (A3)** — e-posta sağlayıcısı seçimi (SES / Resend / Brevo) → SMTP + DNS + Türkçe şablonlar → kodla şifre sıfırlama + kayıt doğrulaması (otomatik onay kapanır) → tasarım (`docs/giris-claude-design-prompt.md`) → Apple ile giriş (+ hesap silmede belge iptali, "E-postamı gizle" alan adı kaydı) → Google (native) → masaüstü. 1.0.2 | `docs/giris-yeniden-plan.md` |
| 2 | **Gizlilik metni yayını (B8)** — yurt dışı aktarım kararı: standart sözleşme mi, sunucu Türkiye'ye mi. Yapay zekâ paragrafı yer tutucuya göre sadeleşir. `gizlilik.html` ve `destek.html` İKİSİ birden | 08 · §40, hafıza `gizlilik_destek_tasarim_borcu` |
| 3 | **WhatsApp hattı (C12)** — hiçbir hat bağlı değil, hatırlatmalar gitmiyor; Evolution API ile "dokunmadan otomasyon" konuşulacak. Asistan (müşteri mesajı yapay zekâya gider) açılacaksa önce açık onay akışı | 08 · §12, §52 |
| 4 | **Sentry (B9)** — mağazadaki çökmeyi görmenin yolu yok | §52 |
| 5 | Personel girişinden kalan dört kalem (B10, doğrulanmalı): çevrimdışı sarı şerit, "Erişim kapalı" metni, 375×667, reduceMotion | §52 |
| 6 | Dinamik yazı boyutu + açık tema ölçümü (B11) — hiç ölçülmedi | §52 |
| 7 | Yedeklerin dış kopyası (C14), demo satırları "Fu Ni" org'unda (C15) | §52 |
| 8 | Masaüstü ↔ telefon ayrışmaları (C17: "Onay Bekliyor", 500 satır), telefonda "Onayla" (C18), oturum kapatınca hangi ekran (C19), KVKK salon aydınlatma metni (C20) — hepsi "doğrulanmalı" | §52 |
| 9 | Sunucudaki 18 fonksiyonun depo özetiyle karşılaştırılması (D10) — salt okuma komutu düzeltilecekler belgesinde | D10 |
| 10 | Ayrı oturumlar (kullanıcı kararı): 🔴 Dodo + abonelik yenileme arızası (Core'a ulaşılamıyor) · Dodo fiyat farkı (₺599 ↔ ₺611,62) · Core entegrasyonu · Luera sitesi (Framer) · Instagram planı | §52 · D |
| — | Bilerek ertelenenler: şube mimarisi · finans maddeleri · güzellikte mobil paket birliği · diş periodontal/röntgen | §52 · E |

---

## 5 · DURUM ANLIK GÖRÜNTÜSÜ (2026-10-15 gece)

| Konu | Durum |
|---|---|
| Mağaza | 1.0 (derleme 4, `9993086`) yayında, 2026-10-07. App ID `6816258771`, bundle `ai.luera.timeflow`, Apple Team bireysel (HASAN ULGER), yalnız Türkiye, ücretsiz |
| 1.0'dan beri | 127 commit; native yapılandırma (`package.json`, `app.json`, `eas.json`) DEĞİŞMEDİ — yalnız JS + sunucu |
| Göçler | 108–118 canlıda; deploy borcu yok |
| Sunucu fonksiyonları | son kod değişikliği `f670bc6` (`visit.charge`) deploy edildi ve yoklandı |
| EAS production | `EXPO_PUBLIC_AUTH_MODE=live`, `APP_URL`, `SUPABASE_URL`; anon anahtar yerelle birebir, `"role":"anon"` |
| Kod sağlığı | testler 3039/0/7 · `tsc` temiz · lint değişen 122 dosyada 349 → 312 (kumanda 16) · tanı satırı yok · sır yok |
| Commit'lenmemiş | `docs/devir/08-TEK-KISILIK-DEVIR.md` (§0 ve §52 işaret), `docs/yayin-oncesi-duzeltilecekler-1.0.1.md`, bu belge |
| Hakem hesabı | `demo@lueratech.com` (şifre kullanıcıda), demo salon ekip düzeninde, güzellik; tohum cron'da (11:00 / 13:00 / 15:00 / 00:10 İstanbul) — hakemin saatinde gün dolu |
| Şifre sıfırlama | SMTP yok; ekran dürüst ("şu an gönderilemiyor", `info@`'a yaz) |
| WhatsApp | hiçbir hat bağlı değil → `remind` yapay zekâya bugün hiç ulaşmıyor |

---

## 6 · DENETİMİN BULGULARI (özet — ayrıntı düzeltilecekler belgesinde)

| # | Önem | Başlık |
|---|---|---|
| D1 | 🔴 | Sürüm `1.0.0` — yükleme reddedilir |
| D2 | 🔴 | Ücretli kalemde ×2 ve katalog dışı kalem `visit.items`'ta reddediliyor → otomatik kayıt sessizce düşüyor, tek kişilik tahsilat kilitleniyor, ekipte yanlış "kasada zaten açık" |
| D3 | 🟠 | "Tekrar dene" ölü, "Sonra tahsil et" istek atmıyor |
| D4 | 🟠 | Kalem kaybı: çıkışta bekleyen yazma ve silme penceresi iptal; yavaş ağda iki yazma çarpışıyor |
| D5 | 🔴 | Yapay zekâya müşteri adı gidiyor + hakem notu "no AI service" diyor |
| D6 | 🟠 | Paket / indirim / kısmi ödeme / grup: Gün, kumanda ve kasa farklı rakam; paketli seansta çift tahsilat mümkün |
| D7 | 🟡 | `alreadyCollected` `is_paid` basmıyor |
| D8 | 🟡 | `CashSheets` render içinde bileşen (yeni lint) |
| D9 | 🟠 | Tek kişilik giriş kararı + mağaza metni / görüntüler |
| D10 | 🟡 | Sunucu fonksiyon özetleri karşılaştırılmadı |
| D11 | — | Telefon turu (P0 zorunlu) → derleme |

Temiz çıkanlar: 5.1.1(v) hesap silme (FK'ler `CASCADE`/`SET NULL`,
`account-delete` değişmedi) · 3.1.1 (çağrı yok, test kilitli) · App Privacy
hâlâ doğru · §7'nin on kuralı · §50 tahsilat yarışı düzeltmesi · tek
kişilik ile ekibin hizmet ücreti aynı zincir.

---

## 7 · DERSLER (yarın tekrar etmemek için)

- **Kaynak metnine bakan test ölü dalı yakalamaz.** D2 tam bu: istemci testi
  ×2'yi, sunucu testi `qty !== 1`'i ayrı ayrı doğru buluyordu; ikisini birlikte
  koşturan yoktu. Düzeltmenin testi istemcinin gönderdiğini sunucunun
  kuralından geçirmeli.
- **Bilinmeyen hata kodu varsayılan cümleye düşmesin.** `errorLine` varsayılanı
  "Bu adisyon kasada zaten açık" — yanlış. Bilinmeyene genel ve dürüst söz.
- **Ölü düğme, durum makinesinde dönüşü olmayan hâlden doğar.** D3: `send`
  `error`/`queued`'dan hiç `idle`a dönmüyordu. Yeni hâl eklerken çıkışını da yaz.
- **Zamanlayıcıyla yazılan veri, ekran kapanınca iptal edilen zamanlayıcıyla
  kaybolur.** D4: `useEffect` temizliği `clearTimeout` ise ayrılırken flush şart.
- **Hakeme yazılan her cümle bir beyan.** D5: "no AI service" 1.0'da da yanlıştı.
- `--no-dev` ile Expo Go iki ayrı uygulama gibi davranıyor: biri dinamik
  `import()`la, öteki `__DEV__` doğrulamalarıyla çöküyor. İkisi de denenir.
- Deploy betiği çalışma ağacını kopyalar; `_shared` değişince argümansız.

---

## 8 · KOMUTLAR

```bash
cd /Users/furkanulger/Projects/luera-timeflow && npm test
```
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx tsc --noEmit
```
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx expo start --go
```
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npm run start:prod
```
Değişen dosyalarda lint (önce/sonra karşılaştır):
```bash
cd /Users/furkanulger/Projects/luera-timeflow && npx eslint <dosyalar>
```
Edge fonksiyon yoklaması (Claude çalıştırabilir, yan etkisiz):
```bash
for f in staff-api remind draft-messages; do curl -s -o /dev/null -w "$f %{http_code}\n" -X OPTIONS https://supabase.timeflow.lueratech.com/functions/v1/$f; done
```

---

## 9 · GERİ ALMA

- Kod: her iş ayrı commit → `git revert <commit>`.
- `staff-api`: önceki commit'e dön, aynı deploy komutu (göç yok, şema değişmiyor).
- Yapay zekâ yer tutucusu: `remind` / `draft-messages` önceki commit + deploy;
  yer tutucu yoksa zaten şablona düşüyor.
- Mağaza: "Version Release: Manually" seçili; onay gelse bile yayın düğmesine
  basılmadıkça 1.0 mağazada kalır. Gönderimden önce vazgeçmek serbest.
- Tek kişilik kabuğun bütünü: `tek-oncesi` etiketi (`b4bc585`), `origin`'de —
  yalnız son çare (127 commit'i geri alır).
