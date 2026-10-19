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
