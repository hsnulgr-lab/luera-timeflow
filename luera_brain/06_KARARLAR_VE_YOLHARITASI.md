# 06 — Kararlar Defteri ve Yol Haritası

> Bu dosya "bunu daha önce konuştuk mu?" sorusunun cevabıdır.
> Bir öneri vermeden önce buraya bak.

---

## A. TEKRAR TARTIŞILMAYACAK KARARLAR

Aşağıdakiler karara bağlandı. Aksini önerme; öneri gelirse **hatırlat ve karşı çık**.

| # | Karar | Tarih | Gerekçe |
|---|---|---|---|
| 1 | Her sektörün **sabit, özel tasarlanmış** dashboard'u olur. Kullanıcının widget seçtiği yaklaşım **iptal**. | 2026-07-12 | Tüm diş klinikleri aynı yüzü görmeli; kombinasyon karmaşası istenmedi |
| 2 | `customers.balance` kolonu **açılmaz**. Bakiye `treatment_plans − payments`'tan hesaplanır. | 2026-07-13 | Denormalizasyon; tek kaynak `patientBalance.ts` |
| 3 | Bakiye **yalnız** `computePatientFinance`, tahsilat dağıtımı **yalnız** `allocatePayment.ts` (FIFO, otomatik). | 2026-07-18 | Önceden 3 ekran 3 farklı rakam gösteriyordu |
| 4 | Tahsilatta personelden plan seçmesi **istenmez** — otomatik FIFO. | 2026-07-18 | "Tahsilat kolay olsun" gereksinimi |
| 5 | 1 şube = 1 org. `branch_id` mimarisi **ertelendi** (ödeyen müşteri çıkınca). | — | Erken karmaşıklık |
| 6 | Dodo = **yalnız SaaS aboneliği**. İşletmenin kendi müşteri tahsilatı değil. | 2026-07-02 | Kapsam netliği |
| 7 | Abonelik verisi **LUERA Core'da** tutulur, TimeFlow'da değil. | 2026-07-02 | Omurga mimarisi |
| 8 | WhatsApp hatırlatma için **n8n'e gidilmedi** — mevcut `remind` edge function cron'u kullanıldı. | 2026-07-17 | Altyapı zaten yeterliydi |
| 9 | Sektör iletişim dili **tek kaynak**: `SectorProfile.comms` → `settings.comms` JSONB (066). Edge tarafında ikinci tablo yok. | 2026-07-18 | Eski `SECTOR_HINTS` kopyası 8 sektörü ıskalıyordu |
| 10 | Mobilde faturalandırma / WhatsApp ayarı / widget kodu **yok** — eksik değil, bilinçli. | 2026-07-02 | Bunlar masaüstü kurucu işleri |
| 11 | Personel veri izolasyonu şu an **client-side** — kabul edilmiş risk. | 2026-07-02 | Personel sayısı artınca staff-scoped RLS yapılacak |
| 12 | Bot müşteriye randevu + kalan seans + bakiye + ödeme geçmişini söyleyebilir; **tedavi detayı asla** (sağlık sektörleri). | 2026-07-25 | Gizlilik |
| 13 | WhatsApp instance adı org id'den türetilir (`tf_<orgid>`); kullanıcı elle ad yazmaz. | 2026-07-25 | Multi-tenant |
| 14 | İlk müşteriler **manuel sözleşme + elle faturalama**. Self-serve ödeme en son adım. | 2026-07-31 | Payments eksikliği satışı bloklamaz — bloker olarak raporlama |
| 15 | Diş kasası ortak premium kasaya (`BeautyCashRegister`) taşındı; eski `KasaPage` yalnız restorana kaldı. | 2026-08-02 | Tek kasa deseni |
| 16 | Diş StaffPage yeniden tasarımı **iptal** — mevcut tasarım beğenildi. | 2026-08-02 | — |
| 17 | Mobil diş yüzeyi (disFace mobili) **ikinci faz**. Masaüstü öncelikli. | 2026-08-02 | — |
| 18 | WhatsApp mesaj ekranı (sidebar'da gönderilenler/planlananlar) **ertelendi**. | 2026-07-26 | ~yarım günlük iş, tasarımı hazır |
| 19 | Evolution'ı ayrı sunucuya taşımak **ertelendi** — 10. müşteriden önce gündeme gelmeli. | 2026-07-26 | VPS 1'de 1.3 GB boş RAM |
| 20 | `generate-recurring` bilinçli **korumasız** bırakıldı. | 2026-07-26 | Veri sızdırmıyor, mesaj atmıyor; çağıranı bulunmadan sır eklenirse tekrar eden randevular sessizce durur |

### Diş modülünde bilinçli ertelenenler
Röntgen arşivi (storage sprint'i) · `customers.balance` kolonu · süt dişleri
(FDI 51–85, pedodonti) · reçete · ICD-10 · sesli not · imzalı onam.
**Bu listeye yeni özellik önerisi geldiğinde önce buraya bak.**

---

## B. BEKLEME LİSTESİ (öncelik sırasıyla)

### Operasyonel (Furkan'ın elle yapacağı)
1. **`remind` + `whatsapp-booking` edge function'larının VPS deploy'u** ← EN ACİL.
   Deploy olmadan 2026-08-02'de yerelde düzeltilen 5 diş bug'ı **canlıda etkisiz**.
   Yedekler VPS'te alındı (`index.ts.bak-*`).
2. Coolify frontend redeploy + canlı doğrulama.
3. VPS root şifrelerini değiştir (oturumda paylaşıldı) + git `user.email` düzelt.
4. Dodo Branding (panel, logo/renk).

### Birlikte karar/iş
5. Gateway **SHADOW → ENFORCE**: önce gerçek müşterilere Core'da abonelik/trial satırı,
   birkaç gün log izle, sonra `CORE_SUBSCRIPTION_ENFORCE=true`.
6. Dodo **Live Mode** geçişi: verification + live'da 6 ürün/webhook/key → `app_secrets`.
7. Kur takibi: USD fiyatlar ~48,5 TL/$ kurundan sabit; kur oynarsa ürün fiyatı güncellenmeli.
8. Org `comms` profili düzeltmesi: bir işletmenin profili güzellik ("bakımınızı", ✨)
   ama işletme diş kliniği → `features.recall` KAPALI bırakıldı. Dil düzeltilince açılmalı.

### Kod işleri
9. **Hızlı sağlık düzeltmeleri (~yarım saat):** `usePayments`'a tarih sınırı
   (tarihsiz/limitsiz fetch — en önemli verimlilik açığı) + `waitlist` realtime
   (publication + client aboneliği).
10. **SMS hatırlatma** (Netgsm, org bazlı anahtar, WhatsApp fallback) ← ana sıradaki kod işi.
11. **Gider takibi** (`expenses` tablosu + Kasa gelir-gider özeti).
12. Plan değişikliği: Dodo Change Plan API (proration). Şu an aktif abonelikte
    "Destek ile İletişime Geçin".
13. Müdür mobiline **analiz özet kartı** — "her şeyi görür" vizyonunun tek eksiği.
14. E-posta hatırlatma (Resend, dar kapsam).
15. WhatsApp Faz 2 — akıllı asistan. Mimari kural kararlaştırıldı:
    **sayıyı kod hesaplar, AI yalnız cümleyi kurar.** Kalan seans formülü
    `BeautyPackages.tsx`'te, bakiye `patientBalance.ts`'te — ikisinin sunucu karşılığı
    `_shared`'a taşınacak.

### Uzun vadeli
- Personel veri izolasyonu: staff-scoped auth + RLS.
- Client pagination / veri diyeti: `useCustomers` geçmiş sınırı, `products`/`waitlist`
  limitleri, `BillingTab` responsive grid.
- Müşteriden ön ödeme + no-show cezası → org bazlı iyzico/PayTR fazı.
- `/kesfet` marketplace → 30+ müşteri olunca, opt-in şart.
- POS/barkod → talep gelirse.
- Google/Meta native rezervasyon → kod değil, **partner başvurusu**. Pratik çözüm:
  bio/GBP'ye `/book/{slug}` linki.

---

## C. LUERA CORE ENTEGRASYON BORCU (10. müşteriden önce)

| # | Eksik | Durum |
|---|---|---|
| 1 | Subscription kontrolü | **Büyük oranda tamam.** Core'da RPC ve tablo var. Kritik bug bulundu: gateway `p_module` diye çağırıyordu, gerçek ad `p_module_name` — düzeltildi. **Kalan:** gateway redeploy + ENFORCE flip |
| 2 | Organizations senkronizasyonu | **Geçici çözüm var:** `dodo-webhook` abonelik aktifleşince TimeFlow org'unu Core'a aynı UUID ile aynalıyor (`ensureCoreOrg`). Tam sync (üyeler, isim güncellemeleri) hâlâ borç |
| 3 | API key sistemi ayrı | TimeFlow `integration_connections` kullanıyor, Core `gateway_api_keys` ile entegre değil. Migrate edilmeli |

**Risk eşiği:** 0–9 müşteri sorun görünmez. 10+ müşteride faturalama yapılamaz,
erişim kontrolü olmaz.

---

## D. GÜVENLİK DURUMU

**Doğrulanmış:** Multi-tenant RLS izolasyonu canlı DB'de kanıtlandı (2026-06-19).
A→B sızıntısı 0, NULL-org satır 0.

**2026-07-31'de kapatılan açıklar:**
- `public-booking`'de istismar freni yoktu (anonim WhatsApp spam) → telefon/gün 3, org/saat 30
- `customers`'ta (org, phone) tekilliği yoktu → migration 072 + 23505 fallback
- `whatsapp-proxy` org'u `limit(1)` ile seçiyordu (çoklu üyelikte RASTGELE org)
  → `_shared/org.ts resolveOrg` + owner rol kapısı
- `sendWA`'da geçici hata retry'ı yoktu → 1 retry (yalnız 5xx/429)
- İki edge function iç hata metnini istemciye sızdırıyordu

Sözleşme `tests/public-endpoint-hardening.test.mjs` ile kilitli (129 test yeşil).

**Bilinen açık riskler:** personel client-side izolasyonu; `wa_message_log` RLS'i
org'un her üyesine açık (müşteri adları görünür — yöneticiye kısıtlanmalı);
`wa_message_log` sınırsız büyüyor (90 gün temizliği gerek).

---

## E. ÖĞRENİLMİŞ DERSLER

1. **"Mesaj gitmiyor" teşhisinde tahmin yürütme.** Sebep sunucuda kalıyor ve dışarıdan
   görünmüyor. Ayarlar → WhatsApp → test gönderimi ham `reason` döner. Bu oturumda
   iki kez yanlış tahmin edildi.
2. **Yerelde düzeltmek ≠ canlıda çalışmak.** Edge function düzeltmeleri deploy
   edilmeden etkisizdir. "Düzelttim" derken hangisi olduğunu ayır.
3. **`remind`'i elle tetiklemek gerçek WhatsApp mesajı gönderir.** Test için kullanma.
4. **Sorgu limitleri sessizce yanıltır.** Yenileme sorgusu `limit(30)` + sırasızdı,
   eleme JS'te yapılıyordu → 57 aday içinde tek biten plan hiç görülmüyordu.
5. **Deno CLI bu makinede yok** — edge function'lar yalnız esbuild ile sözdizimi
   kontrolünden geçebiliyor, tip denetimi yapılamıyor.
6. **Codex'te uzun oturum kalite düşürüyor** — yeni oturum, her sayfa ayrı mesaj.
