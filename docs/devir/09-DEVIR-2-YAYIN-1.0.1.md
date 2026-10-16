# DEVİR 2 · MOBİL 1.0.1 YAYINI

**Yazıldı:** 2026-10-15 gece · **Hedef:** 2026-10-16'da (yarın) bütün
düzeltmeler bitsin, 1.0.1 Apple'a gönderilsin.
**Dal:** `tek-kisilik` (`e89d4c3` + bu gecenin commit'lenmemiş belgeleri) ·
`main` = `origin/main` = `817b2c9` (bir belge commit'i geride).
**Testler:** 3046 · **3039 geçti · 0 kırık · 7 atlandı** · `tsc` temiz.

> ## ⚠️ 2026-10-16 · KAPILARDAN SONRA YENİ İŞ — ÖNCE §10'U OKU
> 6A kapıları 01:39'da geçti (`55226b7`). **Sonra** kullanıcı kararıyla
> "paket tek kişilikte telefonda" işi yapıldı (§10). **2026-10-16: para yolu
> gözden geçirildi (engel yok), `staff-api` deploy edildi ve yoklandı (18/18
> `OPTIONS` 200), telefonda paket turu geçti, commit + push edildi
> (`c4ae5a1` + `a216ba5`, `tek-kisilik` = `main` = origin).** Testler
> 3112 · 3105 geçti · 0 kırık, `tsc` temiz.
> **6A yeniden (2026-10-16):** 2 · 4 · 5 · 6 ✓ (Claude) · D10 ✓ (03:04,
> 41/41 birebir). **03:10 — P0 sırasında kullanıcı yeni iş istedi: Profil'de
> "Paketler" + bekleme metni + "İşlemi aç" (§11, 1.0.1'e).** Commit + push:
> `413378b` · `4862ed8` · `b1f6f23` (`tek-kisilik` = `main` = origin).
> Bu ağaçla 6A yeniden: 2 ✓ (3131 · 0 kırık, `tsc` temiz) · 4 ✓ · 5 ✓ (tek
> `.hbc` 6.346.994 bayt, yeni metinler içinde, eskileri yok) · 6 ✓ · D10 ✓
> (sunucu değişmedi). P0 ✓ (kullanıcı). **6B ✓ — EAS derlemesi `1.0.1 (5)`
> bitti** (2026-10-16, `dbe0265`; günlük
> https://expo.dev/accounts/luera/projects/luera-timeflow/builds/6a7442fb-5382-4148-9f33-ee0dfff4fcdd).
> **6C ✓ — App Store Connect'e yüklendi** (submission
> https://expo.dev/accounts/luera/projects/luera-timeflow/submissions/d57f67de-1bd7-46da-b9cf-097f329fe079;
> API anahtarı `35NB9733H6`). Apple işledi (04:01, "1.0.1 (5) is ready to test").
> Sıradaki: 6D (TestFlight) → 6E (ASC). **04:10 — kullanıcı durdurdu: TestFlight'ta
> iki kart kusuru bulundu, "yarın yaparız" → §12'yi OKU, oradan başla.** Önceki oturum devri yazamadan limite
> takıldı; bu bölüm onun yerine yazıldı (oturum kaydından).

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
   **2026-10-16 ✓** — `ed0ccef` deploy edildi (staff-api remind
   draft-messages); 18/18 `OPTIONS` 200; `staff-api` `invalid_token`,
   `remind` kendi 401'i, `draft-messages` "oturum açmanız gerekiyor" — üçü de
   yeni modülleriyle (`visitItems.ts`, `aiName.ts`) yükleniyor.
5. **Masaüstü:** push → `main` ileri al → Coolify'dan ELLE deploy (kullanıcı).
   Ön kontrol sırası (hafıza `masaustu_canli_geride`): göçlerin varlığı →
   tam yedek → yerelde `npm run build` → deploy → canlı pakette yeni kodun
   izini doğrula.
   **2026-10-16 ✓** — ilk deploy iptal edildi (yayımlanmamış gizlilik metni
   `public/`teydi, `049284d` ile docs/'a taşındı). Yeniden deploy `049284d`:
   canlı `index-MRZ9AGH9.js` yerel derlemeyle ifade ifade aynı (tek fark
   `VITE_ENTITLEMENT_ENFORCE` canlıda boş, yerelde `"false"` — ikisi de
   kapalı), `quantity:Math.max(1,Math.round(` izi var; `gizlilik.html` ve
   `destek.html` `5699942` ile birebir.

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
1. [x] Düzeltilecekler belgesinde D1–D10'un kutuları işaretli; D9 kararı uygulandı (2026-10-16; D10: sunucu = depo).
2. [x] `npm test` → 0 kırık · `cd mobile && npx tsc --noEmit` → temiz (2026-10-16: 3080 / 0 kırık · **paketten sonra yeniden: 3112 · 3105 geçti · 0 kırık · 7 atlandı, `tsc` temiz**).
3. [x] **YENİDEN ✓ (2026-10-16, kullanıcı: "p0 geçti")** — telefonda **P0 (üretim paketi)**. İlk tur ve P1–P5 geçmişti (2026-10-16 · §50 hariç; yol üstünde yedi kusur düzeltildi — düzeltilecekler belgesi D11); paket kodu (§10) ondan SONRA girdi ve paket turu Expo Go'nun geliştirme kipindeydi. `start:prod` + soğuk açılış + üç kabuk + bir paket ekranı.
4. [x] Sürüm ve Info.plist doğru (Claude çalıştırır) — 2026-10-16: `1.0.1` · `false` · Face ID metni · `TimeFlow`:
   ```bash
   cd ~/Projects/luera-timeflow/mobile && npx expo config --type introspect | grep -E "CFBundleShortVersionString|ITSAppUsesNonExemptEncryption|NSFaceIDUsageDescription|CFBundleDisplayName"
   ```
   Beklenen: `1.0.1` · `false` · Face ID metni · `TimeFlow`.
5. [x] Mağaza JS paketi yerelde tek parça derleniyor (Claude çalıştırır; EAS
   dakikası harcamadan Metro hatasını yakalar) — 2026-10-16: tek `.hbc`
   6,3 MB, yeni kod içinde, dinamik `import(` yok. **Paketten sonra yeniden
   (2026-10-16):** tek `.hbc` 6.311.062 bayt, kaynakta `import(` yok; paket
   kodu içinde (`collect_amount_changed`, `paket_plan_id`, `planPayment`;
   "pakete dahil" ×2, "Paketten seans", "Ödeme al", "Hesabı kapat"). Not:
   Hermes ASCII dışı yazıyı UTF-16 saklıyor — `strings | grep "pakete
   dahil"` 0 der, yanıltır; Türkçe metni UTF-16 olarak ara:
   ```bash
   cd ~/Projects/luera-timeflow/mobile && npx expo export --platform ios --output-dir /tmp/luera-export-1.0.1
   ```
6. [x] **Çalışma ağacı temiz:** (2026-10-16, derlemeden hemen önce yeniden bakılır · paketten sonra yeniden ✓: `a216ba5`, 0/0, yalnız `site/`) her şey commit'li, `tek-kisilik` ve `main`
   aynı noktada ve push'lu (`git status` boş — yalnız `site/` kalabilir).
   EAS commit'lenmemiş değişikliği de yükler; derlenen şey bir commit'e
   karşılık gelmezse sonra neyin yayında olduğunu kimse bilemez.
7. [x] EAS kimliği ve ortamı (Claude çalıştırabilir, salt okuma) — 2026-10-16: `luera` · buildNumber 4 · 4 değişken, `AUTH_MODE=live`:
   ```bash
   cd ~/Projects/luera-timeflow/mobile && npx -y eas-cli@latest whoami && npx -y eas-cli@latest build:version:get -p ios && npx -y eas-cli@latest env:list production
   ```
   Beklenen: `luera` · `buildNumber - 4` · 4 değişken, `AUTH_MODE=live`.
8. [x] Demo hesabı mağazadaki 1.0 ile girilebiliyor (2026-10-16 ✓) (şifre App Store
   Connect › Sign-In Information'dakiyle aynı; DEĞİŞTİRME).
9. [x] **Demo personeli temiz** (2026-10-16 ✓) (2026-10-15, telefon turu Derya Toprak ile
   yapıldı): demo müdür → Profil → Personel → Derya Toprak → "Şifreyi
   sıfırla" ve "Telefonun bağlantısını kopar". Hakem notu "pick a name > set
   a password" diyor; şifresi olan bir demo personel o yolu "şifre gir"e
   çevirir. Öteki iki demo personelde de şifre/telefon kalmadığını yokla.

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
- ✅ **2026-10-16: `1.0.1 (5)` bitti** — dört değişken yüklendi, buildNumber
  4 → 5, sertifika `438C8BA5…` ve profil `TZ976K6Q8N` (2027-09-23'e dek)
  yeniden kullanıldı, push kurulu. Paket `dbe0265`ten.
- Süre 20–30 dk. Bitince durum `FINISHED`. Hata verirse günlüğün son 40
  satırını Claude'a yapıştırın; tekrar derlemeden önce sebep bulunur
  (her deneme derleme numarasını bir artırır — zararsız ama karışıklık).

#### 6C · App Store Connect'e yükleme (kullanıcı çalıştırır)
```bash
cd ~/Projects/luera-timeflow/mobile && npx -y eas-cli@latest submit --platform ios --latest
```
- ✅ **2026-10-16: yüklendi** — Build ID `6a7442fb…`, `1.0.1 (5)`, ASC App ID
  `6816258771`; "Submitted your app to Apple App Store Connect!".
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
| 2 | **Gizlilik metni yayını (B8)** — yurt dışı aktarım kararı: standart sözleşme mi, sunucu Türkiye'ye mi. Yapay zekâ paragrafı yer tutucuya göre sadeleşir. `gizlilik.html` ve `destek.html` İKİSİ birden. Taslak `docs/gizlilik-destek-taslak/` (2026-10-16'da public/'ten çıkarıldı, `049284d`; canlı = `5699942`) | 08 · §40, hafıza `gizlilik_destek_tasarim_borcu` |
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

---

## 10 · PAKET TEK KİŞİLİKTE TELEFONDA (2026-10-16 gece · COMMİT'LENMEDİ)

### Neden (kullanıcı, telefon turunda)
- 22:44 · Bulgu: "paket oluşturuyoruz, sonra randevu veriyoruz ama paketin
  sayısından düşmüyor" — telefonda randevu pakete BAĞLANMIYORDU (1.0'da da
  vardı). Karar: **"1.0.1'i beklet, şimdi yap."**
- 23:13 · "Tek kişilik işletmenin bilgisayarı olmayacak; paket tahsilatı
  masaüstünden değil telefondan komple tamamlanmalı." Bu, 23:02'deki
  "paketli adisyon masaüstü Kasa'da kapansın" kararını tek kişilik için
  DEĞİŞTİRDİ ve D6'nın "Kasa'dan tahsil edin"ini paketli seansta kaldırdı.

### Kararlar (soru-cevapla)
| Konu | Karar |
|---|---|
| Ne zaman | 1.0.1'e girsin (derleme ertelendi) |
| Randevu kurarken müşterinin paketi | **Görünsün ama SEÇİLİ GELMESİN** — "müşteri o gün başka işlem için gelmiş olabilir" |
| Paket bedelinin ödemesi | **Kart + satış sonu:** paket oluşturulunca "Peşinat al" (bir kez kendiliğinden, "Sonra" ile geçilir); sonradan müşteri kartındaki paket satırında "Ödeme al" — yalnız TEK KİŞİLİKTE |
| Paketli seansın adisyonu | Paket motoru olan sektörde (güzellik/kuaför) hizmet ₺0; yalnız ürün/ekstra tahsil; toplam ₺0 ise **"Hesabı kapat · pakete dahil"** (ödeme kaydı YAZILMAZ). Paket motoru olmayan sektörde eskisi gibi Kasa'nın |
| Ekip | Değişmedi: Kasa masaüstünde, metinler aynı |

### Kodda ne var (ağaçta, 25 değişen + 4 yeni dosya)
- **Paketten seans** (`CreateFlow.tsx`, `createFlow.ts`, `managerCreate.ts`,
  `createLive.ts`, `ApptParts.tsx`, yeni `lib/createPackage.ts`): müşteri
  seçilince hakkı kalan paketler hizmet listesinin üstünde, "Paketten · kalan
  4 seans · ₺0"; başkasının paketi düşer; randevu pakete bağlanır
  (`custom_fields.paket_plan_id`), bitince hak düşer. Telefonda görüldü
  (23:09): "Pınar satırında paketi var yazıyor, Paketten bölümü çıktı ve
  seçili gelmedi."
- **Paket ödemesi** (yeni `components/PackagePaymentSheet.tsx`, yeni
  `lib/planPayment.ts`, `managerWrite.ts`, `CustomerCard.tsx`,
  `(staff-flow)/customer.tsx`, `paket-sat.tsx`): masaüstü Kasa'nın paket
  biletiyle AYNI `payments` satırı; tutar kalan borçla dolu, düzenlenebilir;
  yöntem seçilmeden düğme kapalı; borcu aşan tutarı veritabanı (061) da
  reddediyor; kimlik istemcide üretiliyor — çift dokunuşta ikinci kayıt yok
  (23505 → satır okunup başarı sayılıyor).
- **Kumanda tahsilatı** (`kumanda.tsx`, `CollectBar.tsx`, `collect.ts`,
  `cashBuild.ts`, `adisyonSade.ts`, `AdisyonSade.tsx`, `managerSource.ts`,
  `api/staff.ts`): hizmet satırı "Paketten · ücret alınmaz · ₺0"; toplam ₺0
  ise yöntem seçici ve "Sonra tahsil et" yok, tek düğme "Hesabı kapat ·
  pakete dahil".
- **Sunucu** (`staff-api/index.ts`, `staff-api/visitItems.ts`): `visit.collect`
  paketi öğrendi — `package` bir para yöntemi DEĞİL, "pakete dahil, kapat";
  yalnız hizmeti paketten ve BAŞKA TUTARI OLMAYAN adisyonda geçer, ödeme
  satırı yazmaz (`is_paid` + bağ, masaüstünün "Hesabı kapat (pakete
  dahil)"ı); ekran ₺0 görürken araya ücretli kalem girdiyse REDDEDER
  (istemci tazeleyip yöntem sordurur). Paket motoru sahibin `settings`
  satırından (sektör). `kasaOnlyReason` istemci ve sunucuda aynı kural,
  testler ikisini aynı girdilerle koşturuyor.
- **Testler:** yeni `tests/paketten-randevu.test.mjs` (17, eski kodda
  yüklenirken kırılıyor) + altı eski test yeni sözleşmeye taşındı.

### ⚠️ Para yolu — deploy'dan ÖNCE gözden geçir
`visit.collect`e dokunuldu (§1 · para yolu). Tek kuralı bile gevşetmediğini
doğrula: tutarı sunucu hesaplıyor mu, "pakete dahil" kapanışı tutarı OLAN
adisyonda reddediliyor mu, idempotens ve var olan ödeme sorgusu duruyor mu,
`is_paid` yalnız gerçek kapanışta mı. Eski istemci (mağazadaki 1.0) yeni
sunucuyla sorunsuz mu (geriye uyum).

### Sıradaki adımlar (sırayla)
1. ✅ Para yolu gözden geçirmesi (2026-10-16, Claude): engel yok. Tutarı
   sunucu hesaplıyor; "pakete dahil" yalnız tutar ₺0 iken, araya ücretli kalem
   girerse `collect_amount_changed` (istemci tazeliyor); `call` (kuyruk yok);
   idempotens + var olan ödeme sorgusu duruyor; `not_finished` önce;
   masaüstü de ₺0'da ödeme yazmıyor (`part.amount <= 0` atlanıyor) — yalnız
   `isPaid`. Paket ödemesi: masaüstünün paket biletiyle aynı satır, yöntem
   değerleri aynı (`pmMap`), `created_by` sütunu var (057/061), 23505 =
   başarı, üst sınır 061'de. Audit kısıtı yalnız `event`te; `_shared`e
   dokunulmadı. Mağazadaki 1.0'da tahsilat ekranı yok — geriye uyum sorunu yok.
2. ✅ **Deploy (kullanıcı, 2026-10-16):** 18/18 `OPTIONS` 200, `staff-api`
   jetonsuz `invalid_token`. Kanıt telefon: eski sunucu `package`i reddederdi.
   Komut: `cd ~/Projects/luera-timeflow && ./scripts/deploy-functions.sh staff-api`
   → Claude yoklar: `OPTIONS` 200, jetonsuz `invalid_token`.
3. ✅ **Telefon (Expo Go, kullanıcı 2026-10-16: "paket testi yapıldı"):**
   - **a · Vildan Ay'ın açık paketli adisyonu:** hizmet satırında yeşil
     "Paketten · ücret alınmaz" ve ₺0; turuncu uyarı ve yöntem seçici yok; tek
     düğme "Hesabı kapat · pakete dahil" → basınca "Hesap kapandı · pakete
     dahil"; Kasa'dan kalkar, ₺0'lık hareket YAZILMAZ; paket 1 seans düşer.
   - **b · Tuğçe Erden · Ağda paketi:** "Paketi oluştur" → "PEŞİNAT AL · Ağda
     paketi" kendiliğinden, ₺3.600 dolu → 1000 · Nakit → "₺1.000 nakit tahsil
     et" → kartta "₺2.600 ödenmedi" + **Ödeme al** → kalanı Kart'la al →
     Kasa'da iki "Paket tahsilatı · Ağda".
   - **c ·** Paketli seansa ürün ekle → yalnız ürün tutarı tahsil edilir.
   - **d · Ekip** (demo müdür): paket ekranları ve Kasa eskisi gibi.
4. ✅ Commit'ler + push: `c4ae5a1` (kod) + `a216ba5` (bu bölüm).
5. **6A kapılarını yeniden geç:** ✅ 2 (3112 · 0 kırık, `tsc`), ✅ 4, ✅ 5
   (`expo export`, paket kodu içinde), ✅ 6 (ağaç temiz, push'lu) ·
   ⏳ 3 (P0 `start:prod`, kullanıcı) · ✅ D10 (03:04 özeti: depodaki 41
   dosyanın 41'i sunucuda birebir — `staff-api/index.ts` `cd30d2117d68…`,
   `staff-api/visitItems.ts` `dc65ae27729c…`; fazladan yalnız edge-runtime'ın
   `main/` ve `hello/` dosyaları).
   Sonra 6B (EAS) → 6C → 6D → 6E.

### Bu gece ayrıca (commit'li)
- `a78296b` "luera" markası kırpılmıyordu → düzeldi; `c05bc9a` devam ekranında
  karşılamanın hareketli markası (kullanıcı onayladı).
- 22:19 · Kullanıcı: demo hesap mağazadaki 1.0 ile giriyor (6A·8 ✓).
- **Core hatırlatması:** kullanıcı istedi ("core için hatırlatma yap"), saat
  **16 Ekim 10:00** seçildi — ama zamanlanmış görev listesinde YOK
  (2026-10-16 yoklandı: "No scheduled tasks"). Kurulmamış; kullanıcıya sor.
  Core bağlantısı 1.0.1 gönderildikten sonra, ayrı oturum.
- 1.0.2 adayları (kayıtta): giriş ekranı (A3) · çevrimdışı BAŞLAT + kalem →
  `items_stale` · personel oturumu düşünce ekranın cümlesi · **Dinamik Ada
  geri sayımı + bekleme kurarken izin sorusu (§11)**.

---

## 11 · PAKETLER EKRANI (2026-10-16 03:10 · 1.0.1'e · COMMİT'LENMEDİ)

### Neden
P0 sırasında demo müdür Profil'inde kullanıcı: "buraya bir paketler butonu
koysak nasıl olur müşterilerin üzerine". Kararlar (soru-cevapla):
**1.0.1'e ekle** (Claude 1.0.2 önermişti) · **İkisi de** — satılan paketler
+ paket türleri.

### Ne yapıldı (yalnız mobil, sunucu ve göç YOK)
- **Profil satırı** `mobile/app/mudur/profile.tsx` — "Paketler", Müşteriler'in
  ÜSTÜNDE; yalnız `sellsPackages(sector)` (güzellik, kuaför). Tek kişilikte
  aynı satır (İşletme = aynı dosya). Alt yazı "6 açık · 2 ödenmedi";
  sektör okunamazsa satır yok, paketler okunamazsa satır özetsiz.
- **Paketler** `app/(manager-flow)/paketler.tsx` — satılmış paketler (iptal
  hariç, 500 tavan): ad · "Ağda · 6 seans · 2 kaldı" · sağda amber
  "₺2.600 ÖDENMEDİ" ya da turuncu "SON SEANS". Sıra: ödenmeyen → son seans
  → öteki (en yeni üstte). Seansı bitmiş + ödenmiş olanlar "Bitenler · n"
  katlı. Altta "Paket türleri" satırı. **Para almaz:** satır müşteri kartını
  açar (`/(staff-flow)/customer`), "Ödeme al" orada.
- **Paket türleri** `app/(manager-flow)/profil/paket-turleri.tsx` — hizmetler
  sayfasının kalıbı; `package_templates` (069, masaüstünün "Paket
  tanımları"). Ad · seans (1–50, çipler 4/6/8/10) · bedel (zorunlu, > 0).
  Renk/geçerlilik YAZILMAZ. Kaldır = `is_active: false` (masaüstü gibi).
  Dikkat: tür VARSA satış yalnız türlerden (`saleOptions`) — sayfa bunu söylüyor.
- Kurallar `mobile/src/lib/packageBook.ts` (saf); okuma `managerSource.ts`
  (`fetchPackageBook`, `fetchPackageGlance`, `fetchPackageTypes`; ad
  `customer:customers(name)` gömülü, ödemeler `not(treatment_plan_id is null)`
  — 500 kimlik adrese sığmazdı); yazma `managerWrite.ts`
  (`savePackageType`, `removePackageType`, vana + iyimser "stale").
- Sayılar müşteri kartıyla AYNI (kalan = toplam − kullanılan; masaüstünün
  "rezerve" ayrımı yok — dokununca açılan kart başka sayı demesin).
- Test: `tests/mobile-paketler.test.mjs` (17) + canlı zil denetimine iki ekran.
  Lint: değişen dosyalarda yalnız eski 4 hata (`ProfileSheets` efektleri).

### Sıradaki adımlar
1. Telefon (P0 ile birlikte, `start:prod`): demo müdür → Profil → Paketler
   satırı Müşteriler'in üstünde, alt yazı → Paketler listesi → bir satıra
   dokun = müşteri kartı → geri → Paket türleri → tür ekle / düzenle / kaldır
   (demo salonda kalıcı değişiklik bırakmadan: eklenen deneme türünü kaldır).
   Tek kişilik kabukta İşletme'de aynı satır.
2. ✅ Commit + push (`413378b`, `4862ed8`, `b1f6f23`).
3. ✅ 6A yeniden: 2 (3131 · 0 kırık, `tsc`), 5 (`expo export`), 6 (ağaç
   temiz). Kalan P0 → sonra 6B (EAS).
4. ✅ Mağaza "Bu sürümde" metnine iki paket satırı eklendi (kullanıcı:
   "İkisini de ekle"; 1055 karakter).

### Aynı gece · küçük metin
- Tek kişilik Gün kartı: süren işin hapı "Kumandayı aç" → **"İşlemi aç"**
  (kullanıcı kararı; `soloDay.ts` `soloPickItems`, iki test). Personel
  kabuğuna dokunulmadı. Testler 3130 · 0 kırık.
- **Bekleme sayfası (iki kabuk, kumanda):** metin YANLIŞTI — "Bu sayaç
  sunucuya yazılmaz. Uygulama kapalıyken ses çalmaz" (112 beklemeyi sunucuya
  yazıyor, `waitAlarm` 13 Ekim'den beri kapalıyken de bildirim kuruyor;
  "sunucu" yasak kelime). Yeni: "Süre dolunca bu telefon haber verir —
  uygulama kapalıyken ya da ekran kilitliyken de. Telefonun bildirimleri
  kapalıysa kalan süre yalnız bu ekranda görünür." Üst not "bitince haber
  verir", simge zil.
- **Halkanın altındaki ad:** "Boya · 25 dk" her hizmette yazıyordu (cilt
  bakımında da) → "25 dk bekleme". Testler 3131 · 0 kırık.
- **1.0.2'ye (kullanıcı kararı):** (a) **Dinamik Ada / kilit ekranında geri
  sayım** (Live Activity) — yerli iOS parçası (SwiftUI + ActivityKit, config
  plugin), Expo Go'da DENENEMEZ → test derlemesi/TestFlight; geri sayım
  `Text(timerInterval:)` ile kendi kendine ilerler, sunucu gerekmez, bitişi
  mevcut `waitAlarm` söyler. (b) **Bekleme kurarken bildirim izni sor** —
  tek kişilikte izin yalnız İşletme › Bildirimler'den isteniyor; hiç
  girilmediyse bekleme bildirimi sessizce gelmez. İlk "Bekleme kur"da ön
  soru (`PushPrompt` kalıbı).

---

## 12 · YARIN BURADAN BAŞLA (2026-10-16 04:10 · TestFlight `1.0.1 (5)`)

**Durum:** `1.0.1 (5)` derlendi (`dbe0265`), App Store Connect'e yüklendi,
Apple işledi, TestFlight'ta telefonda AÇIK. 6D (TestFlight turu) yarım —
demo müdür Akış'ına bakılırken iki kusur bulundu. Kullanıcı: "bunu kayıt et
yarın yaparız". Kullanıcı ayrıca **kart tasarımını analiz ediyor** — yarın
kendi listesini getirebilir; hepsi TEK derlemede toplanacak.

### Bulgu 1 · Paket satırında üç kez aynı bilgi
- Görünen: Vildan Ay kartı (Akış) "PAKET · Lazer Epilasyon · 6 Seans · 6
  seans · 0/6".
- Sebep: demo türünün adı zaten "Lazer Epilasyon · 6 Seans"
  (`supabase/DEMO_salon.sql:257`); satış başlığa bir daha " · 6 seans"
  ekliyor — telefon `packageSale.ts` `planTitle`, masaüstü
  `src/pages/BeautyPackages.tsx:898` aynı kural; kart sonuna `used/total`
  koyuyor (`mobile/src/lib/managerSource.ts:1551`).
- Çözüm taslağı: (a) ad seans sayısını zaten içeriyorsa (`/\b6\s*seans/i`,
  TR küçültmeyle) ek yapılmasın — telefon + masaüstü, yeni satışlar;
  (b) gösterimde tekrar ayıklansın — var olan kayıtlar (kart, Paketler
  ekranı `packageLine`, müşteri kartı). Para yoluna dokunmaz. S.

### Bulgu 2 · Kart durum satırı kesiliyor
- Görünen: Uğur Şen'in krem "GİRMESİNE" kartında "Personelin bildirimi
  kapalı · gönd…" — "Yönet" düğmesi yazının sonunu örtüyor.
- Yer: `mobile/src/components/FlowParts.tsx:1193-1212` (son hamle satırı,
  `record.text`); aynı satırın iki eşi `:758` ve `:2387` — üçüne de bak.
- Çözüm taslağı: satır yalnız sol sütunun genişliğinde kalsın ya da düğme
  sütununun ALTINA insin; iki satıra kırılabilsin. Demo personelin push'u
  yok → hakem "Personeli çağır"a basarsa görür. Ret sebebi değil, özensiz. S.

### 2026-10-16 11:40 · YAPILDI (kullanıcıyla birlikte analiz; "sadece müdür sayfasındaki kartlar")
Karar: **düzelt + `1.0.1 (6)`**. Seçilen dört düzeltme kodda (commit bekliyor):
1. **Başlık tekrarı** — `packageSale.planTitle` + masaüstü `src/lib/packageTitle.ts`
   (`BeautyPackages.tsx` satışı): ad sayıyı söylüyorsa eklenmez. Var olan
   kayıtlar için `tidyPlanTitle` gösterimde (`fetchPackageRows` → kart/Akış,
   `fetchPackagePlans` → Paketler). **Masaüstü değişti → Coolify deploy (kullanıcı).**
2. **Kesik durum satırı** — A1 (`EtaPanel`) ve `PanelRecord`: `Num fit` +
   `flex: 1` (sütunda kalır, sığmazsa küçülür; kart 118'de). Metinler ≤ 30
   harf: "Personelin bildirimi kapalı", "Personel atanmamış", "Kuyrukta ·
   bağlanınca gider". İki satıra kırmak kart yüksekliğini (dokunulmaz) bozardı.
3. **"0/6" → kalan** — Akış paket satırı `packageLine`: "… · 6 seans kaldı" /
   "son seans"; Paketler ekranı da "N seans kaldı".
4. **Tek birim** — A1 paneli `durationBadge` ("1 sa", "08 dk") yerine üst satırla
   aynı düz dakika ("60 dk", "90 dk", "8 dk").
- Bilinçli bırakılanlar (dokunulmaz liste / tasarım): A1 krem ↔ A2 koyu ayrımı
  (bağlam verisi seçiyor), A2'de turuncu geri sayım, 10 saat önceden kahraman
  geri sayım, PAKET satırının randevuyla ilgisiz paketi göstermesi (müşteriyi
  anlatıyor).
- Test: `tests/mobile-akis-kart-1-0-1.test.mjs` (5) + üç test güncellendi
  (`mobil-personele-soyle`, `mobile-eylem-hapi-v2`, `mobil-paket-sat`).
  3136 · 3129 geçti · 0 kırık · `tsc` (mobil + masaüstü) temiz · lint artmadı
  (FlowParts 73 = önce) · `expo export` tek `.hbc` 6.347.695 bayt.

- **12:10 · telefonda görüldü ve bir tur daha:** "6 Seans · 6 / seans kaldı"
  (sayı iki kez, satır ortadan bölünüyor) → `packageLine` başlığın
  "· N seans" parçasını atar, "6 seans kaldı" bölünmez boşlukla tek parça:
  `PAKET · Lazer Epilasyon · 6 seans kaldı` (telefonda doğrulandı). Demo
  salon sıfırlandığı için paketi kullanıcı yeniden sattı — yeni satışın
  başlığı tekrarsız yazıldı (1. düzeltme canlı satışta çalışıyor).

### 12:20 · KARAR: 1.0.1 BEKLİYOR — önce Müdür 36 tasarımı
Kullanıcı kutuyu "sade kalmış" buldu: "renkleri iyi, kalan seans halka içinde
mi olsa, alanı iyi kullansak, Claude Design 5 alternatif". Brief:
`docs/mudur-36-baglam-kutusu-claude-design-prompt.md` (A2 bağlam kutusu
yalnız; 5 yol × 8 hâl; ekler Müdür 34 v2 + Müdür 23 + telefon görüntüleri;
Durumlar / Hareket Sözleşmesi YOK). Kullanıcı "1.0.1'i bekletelim" dedi
(öneri 1.0.2 idi). Sıra: Claude Design → kullanıcı yol seçer → uygulama
(veri: `ApptContext.package` bugün DÜZ METİN; halka/levha için yapılı paket
gerekir — `managerSource.fetchDayContext` satırında `total/used/owed` zaten var) → testler
→ commit → P0 → `(6)` → TestFlight → gönderim. **Yayın planı kayar:**
gönderim en erken yarın; onay Pazartesi–Salı gelirse Release Çarşamba 21
Ekim 09:00–11:00, gelmezse sonraki Salı (28–29 Ekim bayram — kaçın).

### 14:30 · Müdür 36 geldi → YOL 1 (halka) + iki ayar · KODDA (commit bekliyor)
Tasarım: `docs/design-reference/Luera Mobil - Mudur 36 Baglam Kutusu.html` +
`m36.js` (Downloads/paket'ten kopyalandı). Kullanıcı Yol 1 ile Yol 2 arasında
kaldı; ölçüm (tasarım dosyasında): Yol 2 son seans/ödenmedide kutu 50 → 73–75
(72 bütçesini aşıyor, ödeme gelince kart 25 pt zıplar) ve randevu kartında
ad kırpılıyordu; Yol 1 60 / 69 / 95 sabit. Karar: **Yol 1 + iki ayar** —
(1) son seansta yalnız "Son seans" (etiket + "1 seans kaldı" yok),
(2) 16'dan çok seansta dilimsiz düz yay.
- Kurallar `mobile/src/lib/sessionRing.ts` (`ringStrokes`, `remainingHead`,
  `RING_SLICE_MAX = 16`); çizim `mobile/src/components/SessionRing.tsx`
  (react-native-svg, durağan; ilk çizimde opacity + scale 180 ms, yerli sürücü).
- **Akış A2:** `FlowParts` `PackageRingRow` — Ø40 halka (krem), "6 seans
  kaldı" 15/700, ad + "· N seans" (ad kırpılır), ödenmedi amber nokta + mürekkep.
  Uyarı/bakiye amber nokta + cümle; "NOT / PAKET" etiket sütunu kalktı.
  Veri: `ApptContext.pkg {name,total,left,owed}` (`fetchDayContext`).
- **Randevu kartı:** başlık `packageLine` ("Lazer Epilasyon · 6 seans kaldı")
  + Ø18 rakamsız halka (`VisitSummary.ring`).
- **Müşteri kartı:** "0/6" → Ø36 rakamlı halka; borç rengi noktada.
- Test `tests/mobile-mudur-36-halka.test.mjs` (7) + `mobile-mudur-detay`
  güncellendi. 3143 · 3136 geçti · 0 kırık · `tsc` temiz · lint artmadı ·
  `expo export` tek `.hbc` 6.355.016 bayt.
- Sıradaki: telefonda bak (Metro'da `r`) → commit + push → masaüstü deploy →
  P0 → `(6)` → TestFlight → gönderim.

### Yarın sıra
1. ✅ Kullanıcının kart tasarımı analizini al → listeyi birleştir.
2. ✅ Karar: düzelt + `1.0.1 (6)`.
3. Düzeltilirse: kod → testler + `tsc` → commit/push (kullanıcı onayıyla) →
   6A·5 (`expo export`) → P0 (`start:prod`) → 6B (EAS, `(6)`) → 6C
   (`eas submit --latest`) → 6D TestFlight turu (6 madde, özellikle
   **uzaktan bildirim**) → 6E App Store Connect (Build `1.0.1 (6)` seç).
4. 6A·9: P0'da personel Derya ile girildiyse demo müdür › Personel › Derya
   Toprak → "Şifreyi sıfırla" + "Telefonun bağlantısını kopar".
5. Masaüstü değişirse (Bulgu 1a) Coolify deploy kullanıcıda.

### Gönderim ve yayın zamanı (kullanıcıyla konuşuldu, 04:15)
- **Apple'a gönderim YAPILMADI** — `(5)` yalnız TestFlight'ta; ASC'de 1.0.1
  sürümü açılmadı, "Add for Review"a basılmadı. Gönderim düzeltilmiş `(6)` ile.
- Gönderim: TestFlight geçer geçmez (gün/saat incelemeyi belirgin etkilemez;
  "Manually release" seçili olduğu için onay yayına çıkarmaz).
- **Release: Salı ya da Çarşamba 09:00–11:00 (TR)**, Phased Release AÇIK.
  Cuma öğleden sonra / hafta sonu / gece / 28–29 Ekim (Cumhuriyet Bayramı)
  YOK. Hedef: 20 Ekim Salı sabahı; onay Pazartesi'den geç gelirse Çarşamba,
  Perşembe'den sonraya kalırsa bir sonraki Salı.

Not: bu bölüm ve 6C/işlenme satırları COMMİT'LENMEDİ (belge; derlemeyi
etkilemez). Yarın ilk commit'e girer.
