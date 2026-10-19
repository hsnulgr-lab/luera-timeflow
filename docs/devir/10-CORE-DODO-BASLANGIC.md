# Devir 10 · Core + Dodo abonelik oturumu — başlangıç notu

**Yazıldı:** 2026-10-18 gece, önceki oturumun sonunda. Bu oturum YENİ ve temiz
başlıyor; önce bu dosyayı, sonra aşağıdaki hafıza notlarını oku.

## 0 · Neden şimdi

🔴 **İlk ödeyen salondan ÖNCE bitmeli.** Para hattı bugün yenileme gününde
ödeyen her salonu kilitliyor ve hesap silme Core'a bağımlı (Apple riski).
Giriş ekranı (Apple/Google ile kayıt) yeni kayıt kapıları açacağı için ondan
önce yapılıyor — kullanıcı kararı 2026-10-18.

> **Sıra değişti (kullanıcı, 2026-10-18 gece):** giriş ekranı (Apple + Google)
> bu oturumdan ÖNCE yapılıyor. O iş `account-delete`'e Apple belge iptali
> (TN3194) ekleyecek — Core'a yeni bağımlılık EKLEMEDEN. Bu oturum başlarken
> `account-delete/index.ts`'in son hâline bak; §2.2 önerisi onun üstüne kurulur.

## 1 · Bugünkü durum (2026-10-18)

- **1.0.1 ONAYLANDI** (17 Ekim 22:00), `Pending Developer Release`. Release
  **Salı 20 / Çarşamba 21 Ekim 09:00–11:00**, kademeli 7 gün. Bu oturum
  release'i beklemez; yalnız sunucu işi, mobil derleme gerekmez.
- **Dış izleme canlı:** Cloudflare Worker `luera-izleme` + Pushover. Giriş,
  veri, personel servisi, masaüstü 2 dk'da bir yoklanıyor. Edge function
  deploy'u sırasında kısa bir alarm gelebilir — beklenen.
- **E-posta (Resend) canlı:** giriş servisi `no-reply@lueratech.com`'dan
  Türkçe kod e-postası gönderiyor (2026-10-18 01:27 uçtan uca doğrulandı).
  Otomatik onay hâlâ AÇIK (1.0.2'ye kadar).
- **ENTITLEMENT_ENFORCE tanımlı değil → abonelik kapısı AÇIK** (herkes içeride).

## 2 · Bilinen arızalar (kodla doğrulandı 2026-10-18)

1. **Yenileme günü duvarı.** `supabase/functions/dodo-webhook/index.ts`:
   `ensureCoreOrg` (≈104) Core'a yazamazsa `core_write_failed` 500 dönüyor —
   ayna (`mirror`, ≈130) HİÇ yazılmıyor. Core erişilemezken gelen
   `subscription.renewed` kayboluyor → `org_entitlement.expires_at` geçince
   salon kilitleniyor. 13 Eylül'de furkan@luera.ai org'u böyle kilitlendi,
   ayna elle onarıldı. Öneri: **ayna ÖNCE** (erişimi o belirliyor), Core sonra
   + yeniden deneme kuyruğu; Dodo'nun kendi yeniden denemesine güvenme.
2. **Hesap silme Core'a bağımlı.** `account-delete/index.ts · cancelSubscription`
   (≈155–175): Core sorgusu düşerse `core_lookup_failed` → silme DURUR (Apple
   5.1.1(v)). Öneri: yerel aynada ödeyen abonelik yoksa Core'a hiç gitme.
   (119 ile "tahsilatlı işletme silinemiyor" kapatılmıştı — bkz. hafıza.)
3. **Fiyat farkı.** Sayfa ₺599, Dodo ₺611,62 çekiyor: Dodo ürünleri USD
   ($12.33), anlık kurla çevriliyor. Çözüm: Dodo'da ürünleri TRY olarak yeniden
   aç, `app_secrets.DODO_PRODUCT_MAP`'i güncelle (`dodo-checkout` ≈111).
4. **Core erişimi belirsiz.** `core.lueratech.com` 401 (ayakta, kimlik
   istiyor); `supabase.lueratech.com` (VPS 2, LeadFlow/CallFlow) 503. İLK SORU:
   `app_secrets.CORE_SUPABASE_URL` hangisini gösteriyor? (14 Eylül "no
   available server" bununla açıklanabilir.)

## 3 · Karar bekleyen (kullanıcıya sorulacak)

- **Mimari:** tek canlı modül varken TimeFlow Core'a çalışma anında bağımlı
  olmasın, Core aşağı akış kopyası olsun mu? (Eski "abonelik verisi Core'da"
  kararını değiştirir — `timeflow_core_debt` 2026-10-16 bakışı.)
- Dodo **Live Mode** geçişi ve `ENTITLEMENT_ENFORCE=true` ne zaman.
- Mobilde kilitli kullanıcıya ne denecek (Apple 3.1.1: uygulama içinden ödeme
  ve ödeme sayfasına yönlendirme YOK).

## 4 · İlk adımlar (salt okunur, sırayla)

1. `app_secrets`'ta `CORE_SUPABASE_URL`, `CORE_SERVICE_KEY`, `DODO_*`,
   `ENTITLEMENT_ENFORCE` — DEĞERLERİ BASMADAN: yalnız var mı, URL'nin host'u ne.
2. `org_entitlement` satırları: `state`, `expires_at`, `updated_at`,
   `last_event` — hangisi yakında duvara çarpacak?
3. Core'da `billing_events` son kayıtlar (webhook gerçekten geliyor mu?).
4. Dodo panelinde webhook teslim kayıtları (kullanıcı bakar): başarısız
   teslimler, yanıt kodları.

## 5 · Kurallar

- ssh/deploy komutlarını KULLANICI çalıştırır; Claude komutu hazırlar.
- **Coolify Restart YOK.** Ortam değişkeni gerekiyorsa: Coolify'da kaydet +
  `.env`'e yaz + yalnız ilgili kabı `compose up --no-deps --pull never`
  (2026-10-18 giriş servisinde böyle yapıldı, bkz. `kayit_smtp_kirik`).
- Edge function deploy: `scripts/deploy-functions.sh`. **`_shared` değiştiyse
  ARGÜMANSIZ (hepsi)** — tek fonksiyon deploy'u ötekileri kırar
  (`whatsapp_connecting_tuzagi` dersi). `supabase functions deploy` YOK.
- Para yolu kuralları gevşetilmez (061 ödeme tetikleyicisi vb.).
- Demo salonun aboneliği `active` + `expires_at = NULL` kalmalı — kapı
  açılınca Apple hakemi kapalı kapıya çarpmasın (`demo_salon`).
- Commit/push yalnız kullanıcı isteyince.

## 6 · Hafıza notları (oku)

`billing_design_pending` · `timeflow_core_debt` · `roadmap_faz_karari` ·
`hesap_silme_odeme_izi` · `demo_salon` · `oturum_plani_2026_10_13` ·
`whatsapp_connecting_tuzagi` (deploy dersi) · `dis_izleme`.

## 7 · Denetim · 2026-10-19 (kod okundu, kapı mantığı PGlite'ta çalıştırıldı)

**Hüküm: bugün zarar yok (ENFORCE kapalı, Dodo test kipi) — ama gerçek para
almaya HAZIR DEĞİL.** Salt okunur sunucu kontrolü: `ops/abonelik/kontrol-oku.sql`.

Dışarıdan yoklama (2026-10-19): `supabase.lueratech.com` → **503 "no available
server"** (14 Eylül webhook hatasının BİREBİR metni) · `core.lueratech.com` →
401 (ayakta). ~~Şüphe: `CORE_SUPABASE_URL` ölü host'u gösteriyor~~ — YANLIŞ
çıktı: kontrol-oku §1 → `https://core.lueratech.com` (ayakta olan). Sonuçlar
§9'da.

🔴 Para / erişim:
1. **Ayna Core'a rehin** (`dodo-webhook`): `active`'de `ensureCoreOrg` önce;
   `renewed / on_hold / cancelled / payment.succeeded` aynayı ancak Core'da
   abonelik BULUNURSA yazıyor ve `findSub` Core hatasını yutup "yok" diyor →
   Core düşükken yenileme aynaya hiç ulaşmaz → ENFORCE açıkken her ödeyen
   salon yenileme gününde kilitlenir.
2. **Ayna hatası sessiz** (`mirrorEntitlement`): yalnız log, webhook 200 →
   Dodo yeniden denemez. Koddaki "500 dönüp retry ettirir" yorumu YANLIŞ.
3. **SQL kapısı ≠ uygulama kapısı (ek sürede).** `has_timeflow_access` grace'te
   `expires_at > now()` da istiyor; `computeAccess` istemiyor (testi bunu
   açıkça söylüyor). PGlite: `grace, expires -1g, grace_until +1g` → SQL
   **false**, TS **true**. Sonuç: on_hold geç gelirse RLS yazmayı keser,
   ekran "ek süre" der, WhatsApp/hatırlatma (edge = TS) çalışmaya devam eder.
4. **Hesap silme Core'a rehin** (`account-delete · cancelSubscription`): Core
   sorgusu düşerse silme DURUR (5.1.1(v)). Not (başka oturumun commit'siz
   işi): Apple adımı abonelik iptalinden ÖNCE — iptal düşerse hesap kalır ama
   Apple bağı iptal edilmiş olur; sıra ters olmalı.
5. **Fiyat** USD ürün → ₺611,62 (bilinen; §2.3).
6. **ENFORCE açılınca yeni kayıt anında kilitli:** kayıt / köprü
   (`create_own_business`) / telefon kaydı `org_entitlement` satırı YAZMIYOR.
   Masaüstünde tasarım gereği `/abonelik`; ama TELEFONDAN (Apple/Google
   dahil) kaydolan kapalı kapıya düşer ve App Store kuralı gereği ödeme yolu
   gösterilemez — hakem yeni hesap açarsa duvar. ENFORCE'tan ÖNCE karar.

🟠 Orta:
7. `billing-status` Core hatasını "abonelik yok" (200) diye dönüyor →
   ödeyene "satın al" görünür; `dodo-checkout` var olan aboneliği
   denetlemiyor → **çift abonelik / çift tahsilat** riski.
8. Checkout / iptal / durum org'u `organization_members … limit(1)` (sırasız)
   ile seçiyor → çok işletmeli kullanıcıda yanlış işletme.
9. Deneme algısı `trial_period_days > 0` (aboneliğin KALICI alanı) → on_hold
   sonrası yeniden `subscription.active` gelirse ödeyen "deneme"ye düşer
   (erişim etkilenmez, görünüm ve hatırlatma yanlış). Dodo davranışı doğrulanmalı.
10. `payment.succeeded` aynayı yalnız olayın metadata'sında
    `organization_id` varsa düzeltiyor; yoksa kartını güncelleyenin ek süresi
    kalkmaz. Dodo ödeme olayı yükü doğrulanmalı.

🟢 Sağlam: imza (Standard Webhooks, sabit zamanlı, 5 dk) · idempotency · kapı
zaman tabanlı · edge kapıları YEREL aynaya bakıyor (çalışma anında Core yok)
· ödeme yolu kapanmıyor · deneme beyaz listede · kimlik JWT'den · Dodo
anahtarı istemciye inmiyor · istemci aynaya yazamıyor · ENFORCE iki bayrak
(sunucu + `VITE_`) varsayılan kapalı.

**Önerilen onarım sırası** (kullanıcı onayıyla): (a) ayna ÖNCE, hatası 500 →
Dodo yeniden dener; Core yazımı sonra (b) aynaya Dodo abonelik kimliği →
iptal / silme / durum Core'suz çalışır (Core = aşağı akış kopyası, §3 kararı)
(c) SQL'i `computeAccess`'e eşitleyen göç + iki tarafı AYNI örneklerle
koşturan test (d) checkout: var olan aktif abonelikte reddet; org'u istemciden
al + sahiplik doğrula (e) `billing-status` aynadan oku, Core hatasını "yok"
diye yutma (f) mobil kayıt + ENFORCE kararı (g) TRY ürünler + Dodo Live.

## 8 · Hazırlık paketi (2026-10-19) — yeni oturum BUNLARIN çıktısıyla başlar

Yeri: `core.lueratech.com` (ayakta, 401) ve `supabase.lueratech.com` (503 "no
available server") İKİSİ DE **VPS 2 · 187.124.161.110**. TimeFlow VPS 1'de.

Üç salt okunur komut (kullanıcı çalıştırır, hiçbiri yazmaz ve sır basmaz):

1. TimeFlow veritabanı — sırlar (host/uzunluk), ayna, kapı açılsa kim kilitlenir:
   `ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/ops/abonelik/kontrol-oku.sql`
2. Webhook Core'a ulaşabiliyor mu (kayıtlı adres + anahtarla, ayrıca
   `core.lueratech.com`'a) + son 3 gün webhook izleri:
   `ssh -i ~/.ssh/luera_vps root@76.13.4.164 'bash -s' < ~/Projects/luera-timeflow/ops/abonelik/core-baglanti.sh`
3. VPS 2 keşfi — yığınlar, hangi alan adı hangi yığın, Core tabloları,
   TimeFlow abonelikleri, son 20 Dodo olayı, bellek/disk:
   `ssh -i ~/.ssh/luera_vps root@187.124.161.110 'bash -s' < ~/Projects/luera-timeflow/ops/abonelik/core-kesif.sh`
   (anahtar VPS 2'de geçmezse: Coolify → VPS 2 → Terminal, betiğin içeriği.)

Panelden (ekran görüntüsü):

- **Dodo** · Developer → Webhooks: uç adresi (TimeFlow'un
  `…/functions/v1/dodo-webhook`'u mu) + son teslimler (kod, tarih) · Products:
  6 ürünün para birimi (USD mi TRY mi) · sol üst Test/Live anahtarı · Live
  Mode doğrulama durumu (Business verification).
- **Coolify** · VPS 2'deki kaynaklar: Core ve LeadFlow/CallFlow Supabase'i
  hangi adla duruyor, durumları (Running / Exited / Degraded).

Okunacak sonuçlar: §1 host = `supabase.lueratech.com` ise kök sebep doğrulanır;
`core-baglanti` 401 ise anahtar başka yığının → Core'un service key'i Coolify'dan
(kullanıcı, sohbete yapıştırmadan doğrudan `app_secrets`'a yazılacak komutla).

## 9 · Sunucu sonuçları (2026-10-19)

**kontrol-oku.sql (TimeFlow DB):**
- Sırların hepsi var. `CORE_SUPABASE_URL` = **core.lueratech.com** (ayakta) ·
  `DODO_API_BASE` = **test.dodopayments.com** (Dodo hâlâ TEST) · ürün haritası
  6 anahtar · ENFORCE satırı yok (kapı kapalı).
- Ayna 5 satır, hepsi iç hesap + demo: furkanhasan@ (bitiş 2026-09-12),
  nisanur@ (2026-09-29), furkan@ (2026-10-13, elle onarılmıştı) → **üçü SÜRESİ
  GEÇMİŞ**, kapı açılsa kilitli · nisa@ 2027-08-09 · Demo süresiz ✓.
- Ayna satırı OLMAYAN 3 işletme, üçü de son 30 günde açılmış (Apple deneme
  hesabı dahil) → kapı açılsa anında kilitli.
- **Dodo en son 2026-08-25'te aynaya yazdı** — 8 haftadır tek bildirim
  işlenmemiş (yenilemeler gelmiş olmalıydı).

Sonuç: adres doğru; kopukluk anahtarda, Core tablolarında ya da Dodo'nun
gönderiminde. `core-baglanti.sh` (anahtarla okuma) ve Dodo teslim kayıtları
ayıracak.

**core-baglanti.sh (VPS 1, 2026-10-19):** ortamda Core değişkeni YOK (app_secrets
geçerli) · kayıtlı adres + anahtarla Core'un `subscriptions`,
`billing_events`, `organizations` okumaları **200** → bağlantı bugün sağlam.
Son 3 günde `dodo-webhook` 2 kez çağrılmış, ardından hiç hata/uyarı satırı
YOK ve ayna güncellenmemiş → sessiz yollar şüpheli: imza/zaman damgası
reddi (401, log yazmaz), `renewed`'da Core'da eşleşen abonelik yok (yalnız
uyarı), ya da tekrar (duplicate). Ayırt etmek: Core `billing_events` + Dodo
teslim kayıtları.

**Core'un yeri (Coolify, kullanıcının ekranı):** VPS 2 · proje "LUERA Core
Supabase" · servis `supabase-q5zfott8yoplwoiu76vlzblm` · alan
`core.lueratech.com` · durum **Degraded** + **Changes pending** (Restart
current version'a BASILMAZ). Veritabanı kabı adı:
`supabase-db-q5zfott8yoplwoiu76vlzblm`.

**Erişim:** `~/.ssh/luera_vps` VPS 2'de GEÇMİYOR (şifre istiyor). Şifresiz yol:
Coolify → Terminal → localhost. 5432/6543 dışarıya KAPALI (2026-10-19 denendi);
Coolify paneli `http://187.124.161.110:8000` — HTTPS değil.

⚠️ **Sohbete düşen sırlar (2026-10-19, kullanıcının ekran görüntüleri):** Core'un
Studio panel parolası, MinIO parolası, Postgres parolası ve VPS 2 için
yazılan yeni kök şifresi. Postgres dışarı kapalı; ama **Studio parolası
core.lueratech.com'dan kullanılabilir** → Core oturumunda değiştirilmeli
(.env + yalnız Kong kabı, Restart YOK). Kök şifresi kaydedildiyse başka biriyle
değiştirilmeli.

**Webhook günlüğü (VPS 1, kabın günlüğü 2026-10-10 22:16'dan beri):** 9
"dodo-webhook" çağrısının HEPSİ, ardından 0,3 sn arayla `draft-messages →
gateway → generate-recurring…` geliyor = deploy sonrası duman testi
(`scripts/deploy-functions.sh` her fonksiyona sırayla kimliksiz istek atıyor).
**Yani 10 Ekim'den beri Dodo'dan TEK gerçek bildirim gelmemiş.** Uç dışarıdan
açık: `POST …/functions/v1/dodo-webhook` → 401 `missing_signature_headers`
(fonksiyon cevap veriyor).

**Güçlü şüphe:** Dodo'nun webhook altyapısı (Standard Webhooks / Svix deseni)
bir ucu ~5 gün boyunca hep başarısız olunca KAPATIR. Eylül'de Core düşükken
webhook günlerce 500 döndü → uç Dodo'da devre dışı kalmış olabilir; son
başarılı yazım 2026-08-25. Doğrulama: Dodo → Developer → Webhooks → ucun
durumu (Enabled/Disabled), adresi, son denemeler · Dodo → Subscriptions (test)
→ 4 aboneliğin durumu.

**Core (VPS 2, Hostinger web terminali, 2026-10-19 12:45 UTC — saat doğru):**
- Kaplar 43 saattir ayakta, hepsi `healthy`; yalnız `supabase-rest`'in sağlık
  kontrolü yok (Coolify'ın "Degraded"i büyük ihtimalle bundan).
- `subscriptions` (timeflow): 4795b1ce (furkanhasan@) growth bitiş 09-11 ·
  ad8d9dc9 (nisanur@) **starter** bitiş 09-28 · 108fa88a (furkan@) growth
  bitiş 09-12 · ec37417b (Core Pilot Test) süresiz. Hepsi `active` yazıyor,
  üçünün süresi geçmiş.
- **`billing_events` son kayıt 2026-08-25 22:27** — Core'da da 8 haftadır TEK
  olay yok. Uçtan uca hüküm: kod ve Core bağlantısı bugün çalışıyor; **Dodo
  25 Ağustos'tan sonra (en azından işlenebilir) bildirim göndermemiş.**
  Şüphe: Eylül'deki 500'ler yüzünden uç Dodo'da kapatıldı — Dodo panelinde
  doğrulanacak.
- Fiyat kayması kanıtı: pro aylık **611,63 TL** (sayfa 599) · başlangıç ayda
  303,28 → 308,16 TL (USD kuru oynadıkça her ay farklı).
- Ayna tutarsızlığı: nisanur@ aynada `plan=pro`, Core'da `starter` — ayna
  `renewed`/`updated`'da planı hiç güncellemiyor (+ 086'daki elle tohum `pro`
  yazmış). Görünüm/limit konusu, küçük.

**✅ KÖK SEBEP KESİN (Dodo paneli, 2026-10-19 15:47 TR, Test kipi):** tek uç
`https://supabase.timeflow.lueratech.com/functions/v1/dodo-webhook` ("TimeFlow
abonelik senkronu → LUERA Core", oluşturulma 10 Ağu) → **Durum: Devre dışı.**
Dodo, Eylül'deki kesintide uç günlerce 500 dönünce ucu KAPATMIŞ; o günden
beri hiçbir bildirim gönderilmiyor. Adres doğru, sır doğru, Core ayakta —
eksik olan yalnız Dodo'nun gönderimi.

Ders: Dodo ucu kendi kendine kapatabiliyor ve bunu kimse görmüyor →
onarımda (a) "ayna önce" + (b) dış izlemeye "son Dodo olayı N günden eski"
yoklaması (yalnız gerçek abonelik varken anlamlı) eklenmeli.

## 10 · KARAR + ONARIM (2026-10-19 akşam)

**Kullanıcı kararı:** abonelik gerçeği **TimeFlow'da**, LUERA Core **aşağı akış
kopyası**. Erişim, iptal, hesap silme, abonelik ekranı Core'a çalışma anında
HİÇ gitmez. (Eski "abonelik verisi Core'da" kararı geçersiz; ikinci modül
ödeyen kullanıcıyla canlıya çıkınca yeniden konuşulur.) Dodo ucu kullanıcı
tarafından yeniden açılıyor (Test kipi).

**Dodo belgelerinden (2026-10-19 okundu):** yanıt süresi 30 sn; 8 deneme
(~27 sa); her abonelik olayının `data`'sı aboneliğin TAMAMI ("teslim anındaki
son durum"); yeni `subscription.past_due` (+`past_due_ends_at`); ödeme
nesnesinde `subscription_id` ve `card_last_four` var; `GET /webhooks` →
`disabled` alanı; panelde **e-posta uyarısı** (Webhooks → Settings) ve toplu
"Recover failed / Replay missing"; müşteri portalı API'si
(`POST /customers/{id}/customer-portal/session`).

**Dodo uç sayfası kanıtı (2026-10-19 17:27, kullanıcının ekranı):** uç
`ep_3Hix9YQghozhoiO8YzO8EpLKjNc`. Son 10 mesaj denemesinin HEPSİ 13 Eylül
(06:16–23:34), hepsi **500** ve her biri **16–26 sn** — webhook Core'u Dodo'nun
30 sn sınırına kadar bekleyip hata dönmüş. Uç AYNI GÜN kapanmış ("Son
güncelleme 13 Sept 23:34") — Dodo günlerce değil, birkaç saatlik sürekli
hatada kapatıyor. Abone olunan olaylar: payment.processing/succeeded/failed,
subscription.updated, subscription.plan_changed + 7 tane daha. O günün
mesajları 2 haftalık toplu kurtarma penceresinin dışında; tek tek "Yeniden
gönder" ESKİ yükü yollar (ayna eskir) → gönderilmeyecek, yeni kodla gelen
ilk olay anlık durumu getirir.

### Yapılan (KODDA — commit yok, canlı değil)

- **Göç 123** `supabase/123_abonelik_yerel_kaynak.sql`: aynaya
  `dodo_subscription_id` (UNIQUE), `dodo_customer_id`, `cancel_at_period_end`,
  `cancelled_at`, `dodo_event_at` · yerel olay defteri `dodo_events` (tekrar
  denetimi + fatura geçmişi + Core kuyruğu; istemci rollerine KAPALI) ·
  `has_timeflow_access` = `computeAccess` (§7 madde 3 kapandı).
- **dodo-webhook** baştan: imza → deftere yaz → aynayı aboneliğin ANLIK
  GÖRÜNTÜSÜNDEN türet (`dodo-webhook/durum.ts`, saf) → yaz → 200. Ayna
  yazılamazsa 500 (Dodo yeniden dener); bütünlük hatası, silinmiş işletme,
  işletmesiz/örnek olay 200 (sonsuz deneme ucu kapattırırdı). Eski olay aynayı
  geri sarmaz; başka aboneliğin olayı kilitlemez; yeni abonelik etkinleşince
  eskisi Dodo'da iptal edilir; deneme tarihten anlaşılır (madde 9); ödeme
  olayında işletme abonelik kimliğinden bulunur (madde 10); ek süredeki salon
  ödeyince abonelik Dodo'dan okunur.
- **Core kopyası** `dodo-webhook/core.ts`: aynanın şimdiki hâlini basar (sıradan
  bağımsız), 8 sn bütçe, ASLA hata dönmez; aktarılamayan olay
  `core_synced_at` boş kalır, sonraki her webhook en eski 10'u yeniden dener.
- **account-delete**: abonelik kimliği aynadan, Core yok (madde 4). İptal
  `_shared/dodo.ts · cancelNow`: Dodo reddederse durumu okur, zaten
  kapanmışsa silme sürer.
- **dodo-checkout**: işletme `resolveOrg` + yalnız sahip/yönetici (madde 8) ·
  süren aboneliğe ikinci checkout 409 `already_subscribed` (madde 7) · iptal
  bekleyen salon aynı planı seçerse iptalden vazgeçme · `action: 'portal'` →
  Dodo müşteri portalı.
- **billing-status**: aynadan + defterden; okunamazsa 500, "abonelik yok"
  DEMEZ (madde 7). Süresi dolmuş satır `expired` döner.
- **Masaüstü**: `useBilling` her çağrıda `orgId` gönderiyor; **"Kartı güncelle"
  artık portalı açıyor** (eskiden YENİ checkout açıp ikinci abonelik
  yaratıyordu); 409'da "Plan değişikliği için destek@…" mesajı.
- Testler: `tests/abonelik-yerel.test.mjs` (19; SQL≡TS PGlite'ta, 086
  ayrışmasını kontrol olarak yakalıyor; 7 koruma tek tek söküldü, hepsi
  düştü) + 4 eski sözleşme testi yeni yapıya göre. Takım: 3295 test, 0 hata.

### Bilinçli bırakılan

- **Apple adımı iptalden önce** (§7 madde 4 notu): değiştirilmedi. Core
  çıktığı için iptal yalnız Dodo API'si düşerse başarısız olur; o durumda
  Apple bağı kopmuş ama hesap duruyor olur — kişi Apple ile yeniden girince
  AYNI hesaba düşer (`sub` sabit), zarar yok. Tersi (iptal önce) Apple kodu
  geçersizse aboneliği iptal edilmiş ama hesabı duran bir salon bırakırdı.
- **İç hesapların Dodo kimliği elle aktarılmadı:** her abonelik olayı
  `metadata.organization_id` taşıyor; uç açıldıktan sonraki ilk yenilemede
  ayna kendiliğinden dolar. ENFORCE kapalı → o güne kadar zarar yok.
- Core kuyruğu yalnız webhook çağrılarında ilerler (cron yok) — Core artık
  hiçbir kararın kaynağı olmadığı için yeterli.
- "Sonraki tahsilat" tarihi dönem sonu + 3 gün tolerans gösteriyor (ÖNCEDEN
  de böyleydi) — küçük ekran düzeltmesi, ayrı iş.
- Plan değişikliği (Dodo Change Plan + proration) yok → şimdilik destek.

### Canlıya çıkış SIRASI (komutları kullanıcı çalıştırır)

**Durum 2026-10-19 ~18:15 TR:** 1–3 ✅ — kuru koşu temiz (ROLLBACK), göç 123
UYGULANDI (COMMIT), doğrulama: 5 kolon · defter var, istemci izni 0 ·
`kapi_123 = t` · kilitli 0/7 · demo süresiz. Not: terminal aracı `… < dosya`
yönlendirmesini reddediyor → `cat dosya | ssh …` biçimi kullanıldı.
Sırada: 4 (fonksiyonlar).

**✅ HEPSİ CANLIDA (2026-10-19 ~19:00 TR):** fonksiyonlar argümansız yüklendi
(dördü de kimliksiz 401 = kod açılıyor) · Dodo Test sekmesinden imzalı
`subscription.renewed` → **200, 1156 ms** (13 Eylül'de 500 / 16–26 sn) ·
`dodo_events`: outcome `no_org`, işlendi, Core kopyası tamam · commit
`36f0f02` main + tek-kisilik'e gönderildi (site/ hariç) · Coolify Deploy →
masaüstü paketi `index-ChC88xwG.js` → `index-BMK1B8IO.js`, portal / 409 /
iptalden vazgeçme metinleri pakette. Kalan: "Sonra" listesi.

1. Kuru koşu (yazmaz; sonunda ROLLBACK):
   `{ echo 'BEGIN;'; grep -vx -e 'BEGIN;' -e 'COMMIT;' ~/Projects/luera-timeflow/supabase/123_abonelik_yerel_kaynak.sql; cat ~/Projects/luera-timeflow/ops/abonelik/123-dogrula.sql; echo 'ROLLBACK;'; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'`
   Beklenen: 5 kolon · defter var · izin satırı 0 · `kapi_123 = t` · kilitli 0.
2. Göç: aynı ssh, `-f -' < ~/Projects/luera-timeflow/supabase/123_abonelik_yerel_kaynak.sql`
3. Doğrula: aynı ssh, `-f -' < ~/Projects/luera-timeflow/ops/abonelik/123-dogrula.sql`
4. Fonksiyonlar: `scripts/deploy-functions.sh` **ARGÜMANSIZ** (`_shared` değişti).
   Göçten ÖNCE yapılmaz (yeni kod yeni tabloyu okuyor).
5. Masaüstü (Coolify) — fonksiyonlardan SONRA. Eski masaüstü yeni
   fonksiyonlarla tek işletmeli kullanıcıda çalışır.
6. Dodo paneli: Webhooks → uç → **Testing** → örnek olay gönder → 200 +
   `"outcome":"no_org"` beklenir; `dodo_events`'te satır. **Settings → e-posta
   uyarısı**na adres yaz (uç kapanırsa haber gelsin).

### ✅ TRY fiyatları (2026-10-19 ~19:30 TR, Dodo TEST kipi)

Yöntem: ürünler DEĞİŞMEDİ (kimlikler aynı → `DODO_PRODUCT_MAP` ve kod
dokunulmadı); her ürüne **Yerelleştirilmiş Fiyatlandırma → Para Birimine Göre
→ TRY** sabit kuralı eklendi. "Vergi dahil" altısında da zaten açıktı (KDV
fiyatın içinde), ürün düzeyi deneme kapalı (deneme checkout'tan). Yıllık
ürünler yıllık TEK çekim (PaywallPage `yearly × 12`).

| Ürün | Kimlik | Taban (değişmedi) | TRY kuralı | Test ödeme sayfası |
|---|---|---|---|---|
| Başlangıç aylık | pdt_0NiGkpMZyOewFEb2fCfTc | $6,16 | ₺299 | TRY 299.00 /ay ✓ |
| Pro aylık | pdt_0NiGkueSxjrBUI5Ogfqgc | $12,33 | ₺599 | TRY 599.00 /ay ✓ |
| İşletme aylık | pdt_0NiGl0Tkf7gJ4novp8MRI | $24,69 | ₺1.199 | TRY 1,199.00 /ay ✓ |
| Başlangıç yıllık | pdt_0NiGl8gulPxln2G4gwVtd | $59,06 | ₺2.868 | TRY 2,868.00 /yıl ✓ |
| Pro yıllık | pdt_0NiGlBJIuAek8jq5RksNe | $118,40 | ₺5.748 | TRY 5,748.00 /yıl ✓ |
| İşletme yıllık | pdt_0NiGlFFrDjNDFsC6dRA9L | $237,00 | ₺11.508 | TRY 11,508.00 /yıl ✓ |

Hepsi "(satış vergisi dahil.)". Kanıt: `test.checkout…/buy/<ürün>` sayfası
(ödeme yapılmadı). Mevcut abonelikler eski (USD'den çevrilen) fiyatta
yenilenir — yalnız iç test hesapları.

Görülenler: (1) Ekim test yenilemeleri ₺632,33/632,73 çekmişti (Eylül
611,63) — kayma büyüyordu. (2) `furkan@luera.ai` adına 3 AKTİF test aboneliği
(sub_…Ka0M, …zSF4, …pqkSe) her ay çekiyor — çift abonelik açığının izi; yeni
webhook aynı işletmeninkileri yenilendikçe teke indirir. (3) **CANLI kipteki 6
ürün yanlış:** aylık $10/$30/$75, yıllık $100/$300/$750 (Pro aylık ≈ ₺1.450!).
Live'a geçerken taban fiyatlar + TRY kuralları canlıda da kurulmalı (Dodo'da
"Testten İçe Aktar" var) ve `DODO_PRODUCT_MAP` canlı kimliklerle değişir.

### Sonra (sırayla)

- ✅ **Dodo ucu YENİDEN ETKİN** (2026-10-19 17:29 TR, Test kipi; Düzenle →
  "Etkin" anahtarı — ⋮ menüsünde yok). Eski mesajlar yeniden gönderilmedi.
  DİKKAT: canlıda hâlâ ESKİ (Core-önce) webhook var — Core yeniden düşerse uç
  birkaç saatte yine kapanır; onarımın canlıya çıkışı bu yüzden acele.
- ✅ KODDA ve YEREL DOĞRULANDI (2026-10-19): dış izlemeye "Dodo ucu kapalı mı" yoklaması —
  `ops/izleme` (30 dk'da bir, salt okunur anahtar, Pushover 1; Dodo kesintisi
  alarm değil). Salt okunur anahtar (yalnız Webhooks: Okuma) `~/.luera-izleme.env`'de;
  `dene.mjs` uç kapalıyken ✗, açınca ✓ verdi. **Worker'a YÜKLENDİ**
  (2026-10-19 18:02 TR: wrangler yeniden giriş + 3 sır + deploy). İlk Dodo
  yoklaması 18:30 turunda; sabah 09:00 mesajı "6/6 · Dodo bildirim ucu açık"
  demeli.
- (f) mobil kayıt + ENFORCE kararı (§7 madde 6) · (g) ~~TRY ürünler~~ ✅ (test) + Dodo Live.
- ⚠️ Core Studio parolası değişecek (§9).
