# 1.0.1 · Kusur ve borç listesi

**Derlendi:** 2026-09-27, 1.0 (derleme 4) incelemeye gönderildikten hemen sonra.
**Yöntem:** Her madde bugün koddan ya da ölçümden doğrulandı. Hafızadan gelip
kodda karşılığı kalmayanlar §6'da "kapanmış" diye ayrıldı — liste onlarla
şişmesin.

**Taban:** 2702 test · 0 hata · 7 atlanıyor (bugün çalıştırıldı).

Sıra **öneme göre**: önce kullanıcıyı kilitleyen ya da ekranda yalan söyleyen,
sonra para, sonra görünürlük, en sonda ürün borcu.

---

## 1 · Kullanıcıyı kilitleyen / ekranda yalan söyleyen

### 1.1 🔴 Şifre sıfırlama ölü ama uygulama "gönderildi" diyor

Sunucuda SMTP yok (`GOTRUE_SMTP_HOST` boş). `recoverManagerPassword` hesap
sızdırmamak için her durumda başarı dönüyor. Şifresini unutan **mevcut
müşteri hesabına bir daha giremiyor** — destek hattı bile yok, çünkü
sıfırlamayı yapacak kişi de aynı e-postaya bakıyor.

Kayıt tarafı `ENABLE_EMAIL_AUTOCONFIRM` ile kurtarıldı (2026-09-25); sıfırlama
kurtarılamadı, çünkü autoconfirm sıfırlama bağlantısı üretmiyor.

Üstüne binen ikinci hata: `GOTRUE_SITE_URL` Supabase'in kendi adresini
gösteriyor (`supabase.timeflow.lueratech.com`). SMTP kurulduğu gün doğrulama
ve sıfırlama bağlantıları **yanlış yere** gider; `timeflow.lueratech.com`
olmalı.

- **Çözüm:** SMTP sağlayıcı + SPF/DKIM (lueratech.com) + `GOTRUE_SITE_URL`
  düzeltmesi. Kimlik bilgilerini kullanıcı girer.
- **Bedeli:** Coolify Restart → yedek + sakin saat kuralı geçerli.
- **Tahmin:** yarım gün (DNS yayılması dahil).

### 1.2 🔴 Kayıp/çalınan personel telefonu koparılamıyor

`staff-api`'de cihaz bağını koparan hiçbir action yok — yalnız `device.pair`,
`device.code.create`, `device.code.redeem`. `staff.pin.reset` şifreyi siliyor
ve oturumu düşürüyor, **ama telefon işletmeye bağlı kalıyor**; 099 akışında
"şifresi yoksa kendisi belirler" kuralı geçerli olduğu için telefonu bulan
kişi yeni şifre belirleyip salona giriyor.

- **Çözüm:** owner kapılı `device.revoke` ucu + müdür telefonunda
  Profil → Personel'de eylem.
- **Yan iş:** bitince `public/gizlilik.html` ve `destek.html`'deki
  "Telefonumu kaybettim" SSS'i gerçek adımla güncellenir (iki dosya aynı
  kalmalı).
- **Tahmin:** 2–3 saat.

### 1.3 🟠 Silinmiş işletmeye bağlı telefon çıkışsız kalıyor

`staff-api` yalnız **imza ya da süre** bozuksa `invalid_token` dönüyor
(`index.ts:540`); istemci onu `not_paired`'e çeviriyor ve eşleştirme ekranına
gidiyor (`auth.ts:85`). Ama org silinmişse jeton hâlâ geçerli imzalı —
sorgular boş dönüyor, ekran duruyor. `who.tsx:51`'deki `not_paired` dalı bu
durumda **hiç çalışmıyor**.

Hakem riski yok (taze cihaz), gerçek kullanıcıda var.

- **Çözüm:** sunucu, jetonun org'u yoksa ya da erişimi bittiyse `not_paired`
  dönsün — istemci tarafı zaten hazır.
- **Tahmin:** 1 saat.

---

## 2 · Para

### 2.1 🔴 Dodo → Core hattı kopuk; abonelik aynası her ay elle onarılıyor

`dodo-webhook` abonelik olayını Core'a aynalamaya çalışıyor
(`index.ts:105 · ensureCoreOrg`) ve Core cevap vermiyor:

    [Error] org mirror { message: "no available server" }

Sonuç `500 core_write_failed` → `org_entitlement` hiç yazılmıyor → Dodo olayı
başarısız sayıyor. `furkan@luera.ai` org'u 2026-09-13'te tam da bu yüzden
uygulamadan kilitlendi; ayna elle onarıldı (`last_event =
'manual_mirror_repair'`).

**Bu her ödeyen müşteriyi yenileme gününde aynı duvara çarptırır.**

- **Kazmaya nereden:** Core'un Postgres'i ve bağlantı havuzu ayakta mı;
  edge function'dan `CORE_SUPABASE_URL`e basit bir istek; `app_secrets`taki
  url/key hâlâ geçerli mi.
- **Tahmin:** bilinmiyor — önce teşhis. Kullanıcı "bir gün full bunu
  düzeltelim" dedi.

### 2.2 🟠 Fiyat uyuşmazlığı: sayfa ₺599, Dodo ₺611.62 çekiyor

Dodo ürünleri **USD** cinsinden ($12.33) ve anlık kurdan çeviriyor. Kur
oynadıkça fark büyür.

- **Çözüm:** Dodo'da 6 ürünü TRY olarak yeniden açıp `DODO_PRODUCT_MAP`
  güncellenir.
- **Kural:** bu kapanmadan `ENTITLEMENT_ENFORCE` açılmamalı ve `/fiyatlar`
  linki paylaşılmamalı.

### 2.3 🟡 Kart son 4 hanesi saklanmıyor · fatura bilgisi (VKN) hiç toplanmıyor

Tasarımdaki "Kart •••• 4417" kartı bu yüzden gizli. Dodo webhook'unda veri
geliyor; bir kolon + bir webhook satırı yetiyor.

---

## 3 · Hatırlatma hattı

### 3.1 🟠 WhatsApp: düzeltme yazıldı, DEPLOY EDİLMEDİ; hiçbir hat bağlı değil

İki ayrı şey üst üste:

1. **Kod:** `wa.ts · connectedOrgs` → `linkedOrgs`, süzgeç artık
   `['connected','connecting']`. `_shared/wa.ts` + `remind/index.ts` canlıya
   **çıkmadı** — Faz B'de "tek bilinçli fark" olarak ölçüldü.
2. **Hat:** Evolution API'de iki org'un da durumu `close`. **7 haftadır
   hiçbir müşteriye WhatsApp hatırlatması gitmemiş.** Kod düzeltmesi durumu
   doğru göstermeyi sağlar; çalışması için **QR ile yeniden eşleştirme**
   gerekiyor.

- **Tahmin:** deploy 10 dk + QR eşleştirme (kullanıcı telefonuyla).

---

## 4 · Görünürlük ve işletim

### 4.1 🟠 Mağazadaki çökmeyi kimse görmüyor (Sentry yok)

`ErrorBoundary` var ve çalışıyor — ama sessiz. Kullanıcı "Bir şey ters gitti"
görüyor, biz hiçbir şey görmüyoruz. Bugün bulunan kesirli-saniye çökmesi
tesadüfen, kullanıcının ekran görüntüsüyle bulundu; mağazada o tesadüf
olmayacak.

- **Tahmin:** 1–2 saat (`sentry-expo` + kaynak haritası yükleme).

### 4.2 🟡 `issuePairCode` insert hatasını yutuyor

5 kez deniyor, hepsi başarısızsa `null` dönüyor → istemci `code_unavailable`
(503) görüyor, **gerçek sebep hiçbir yere yazılmıyor**. Aynı dosyadaki
`audit()` de `insert`in `error`una hiç bakmıyor — denetim satırı sessizce
düşebilir.

- **Tahmin:** 30 dk (`console.error` + son hatayı döndürme).

### 4.3 🟠 Yedek VPS'in kendisinde duruyor

`scripts/vps-backup.sh` cron'da 04:00, 91 tablo, dar ortamda kanıtlandı
(2026-09-24). Ama kopya **aynı makinede**. Sunucu giderse yedek de gider.

- **Tahmin:** 1 saat (dışarı kopyalama hedefi kararı + rsync/S3).

### 4.4 🟠 VPS kapasite sınırında

İki tam Supabase yığını + Coolify + n8n + soketi + Next + iki logflare
(~960 MB, kimsenin bakmadığı bir özellik). 2026-09-11'de bellek tükenmesinden
dondu; 8 GB takas eklendi — artık yavaşlıyor, donmuyor. `evolution-api`
çocuk işlem topluyor (62 günde 338 zombie).

**Gerçek müşteri gelmeden ya RAM artmalı ya yığınlar ayrılmalı.** Zemin
uygulamadan kırılgan.

### 4.5 🔴 SSH şifreyle root girişi açık (kullanıcı kararıyla ertelendi)

İfşa root şifresi hâlâ çalışıyor. `scripts/vps-ssh-kapat.sh` hazır ve
sözdizimi test edildi. Kullanıcı 2026-09-24'te "proje bitene kadar bekleyelim"
dedi — **karar onun, bu satır yalnız listeyi eksik bırakmamak için burada.**

---

## 5 · Ürün borçları

| # | Madde | Not |
|---|---|---|
| 5.1 | **Müdür oturumu AsyncStorage'da** (`supabase.ts:25`), personel anahtarı Keychain'de | Müdür anahtarı sağlık notları dahil bütün salona erişiyor. Supabase'in kendi RN dokümanı bu kurulumu öneriyor; ret riski düşük. Düzeltme SecureStore adaptörü + 2048 bayt parçalama |
| 5.2 | **13 Expo paketi yama sürümü geride** | 1.0 test edilmiş sürümlerle çıktı. Güncelleme YENİ dev client derlemesiyle birlikte yapılmalı, yoksa telefondaki dev client eskir |
| 5.3 | **Demo müşteri telefonları gerçek hat biçiminde** (`0532 100 00 00`…) | Hakem "Ara"ya basabilir; WhatsApp bağlanırsa hatırlatma gerçek numaraya gider. `DEMO_salon.sql:194,243` |
| 5.4 | **Onay akışı rafta** (`APPROVAL_FLOW_ENABLED=false`) | Kök sebep masaüstü: `CalendarPage.tsx:575` elle açılan HER randevuyu `pending` yazıyor. Onay akışı geri istenirse ÖNCE bu düzeltilmeli, yoksa müdür kendi randevusunu onaylar |
| 5.5 | **`visit.arrive` bilerek kapalı** | Personel "geldi" yazamıyor, yalnız görüyor. 043'ün "resepsiyonda kim varsa" kuralı. Genişletme istenirse bu karar hatırlatılmalı |
| 5.6 | **Mobil Kasa salt okunur** | Karar (2026-09-16, 2026-09-22'de yeniden onaylandı): düzeltme ve iptal masaüstünden. `VoidDialog`/`applyVoid` kodda duruyor, bağlı değil |
| 5.7 | **`ENTITLEMENT_ENFORCE` açılınca mobil kayıt** | Telefondan kaydolan kişi ödeme yapmadan kullanamayan bir hesaba düşer → sonraki incelemede 3.1 sorusu. Strateji kararı |
| 5.8 | **`account-delete` Core'a ulaşamazsa 502** | Core bir kez erişilemez oldu (§2.1). O an hakem hesabını silemez |
| 5.9 | **Dinamik yazı boyutu ölçülmedi** | 715 `<Text>` tavansız, 75 sabit yükseklikli kap, 181 `numberOfLines`. Apple zorunlu tutmuyor. İlk adım kod değil ÖLÇÜM (sistem yazısı en büyüğe, beş ekran) |
| 5.10 | **Açık tema turu yapılmadı** | Aynı kararla ertelendi |
| 5.11 | **Kullanım Koşulları sayfası yok** | Kayıt ekranından çıkarıldı (214aea3) — hukuken bir gün gerekecek |
| 5.12 | **Gizlilik metni avukat onayı bekliyor** | 3 cümle. KVKK metni org bazında, en sona bırakıldı |
| 5.13 | **Personel tasarım borçları** | B3 belirsizlik işareti (`.big.q`), B4 komşu iş sabit "Zeynep Kaya · boya · 24 dk" |
| 5.14 | **D3 · Takvimin dört hâli çizilmedi** | Boş gün, yüklenme iskeleti, ay ızgarası, toplanan başlık — testleri `skip`te bekliyor (7 atlanan testin kaynağı) |
| 5.15 | **Sekme çubuğu küçülmesi doğrulanamadı** | iOS 26 `minimizeBehavior`; Expo Go'da etki yok, sebep kanıtlanmadı. Dev build'de "Lab" sekmesiyle ölçülecek |

---

## 6 · Hafızada açık duruyordu, KODDA KAPANMIŞ (2026-09-27'de doğrulandı)

Bunlar listeden çıkarıldı; not bayatlamıştı.

- **`app/(staff-flow)/` ölü ekranlar** (appointment/visit/finish/sent, 1592
  satır) — dosyalar yok, silinmiş
- **Ölü kontrol kalmadı** — `onPress={() => undefined}` taraması boş;
  "PIN'i değiştir" ve profil ölü satırları gitmiş
- **Vardiya/izin ucu yazıldı** — `staff-api · action === 'shift'`
  (`index.ts:2047`); `demoSource` yalnız stub kipinde
- **`102_payment_void_log` CANLIDA** — Faz B şema kontrolü "10/10 VAR" dedi
- **Masaüstü kayıt artık yalan söylemiyor** — `AuthContext.tsx:117`
  `needsConfirmation: !data.session` dönüyor
- **Gün sayısı okunamayınca "sıfır randevu" çizilmiyor** —
  `mudur/index.tsx:514` eldeki listeyi bozmuyor
- **TODO/FIXME yok** — `mobile/app` ve `mobile/src` taraması temiz

---

## 7 · Önerilen sıra

1. **§1.1 SMTP** — tek başına bir müşteriyi kalıcı olarak dışarıda bırakan
   şey bu
2. **§2.1 Core hattı** — ödeyen ilk müşterinin yenileme günü bir tarih, onu
   beklemek pahalı
3. **§4.1 Sentry** — sonraki kusuru tesadüfe bırakmamak için; kendisi kusur
   değil ama kusur bulma aracı
4. **§1.2 telefon koparma** + **§1.3 not_paired** — ikisi de aynı dosyada,
   birlikte yapılır
5. **§3.1 WhatsApp deploy + QR** — kısa, ölçülebilir
6. **§4.3 dış yedek**, **§4.4 kapasite** — gerçek müşteriden önce
7. Gerisi sürüm planına
