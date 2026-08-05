# 02 — TimeFlow Mimarisi

## Ne yapar

TimeFlow, randevu/rezervasyon ile çalışan işletmeler için tek uygulamadır. Farkı:
**tek kod tabanı, sektöre bürünür.** Aynı build bir diş kliniğinde "Hasta / Hekim /
Tedavi", bir kuaförde "Müşteri / Kuaför / Hizmet", bir restoranda "Masa / Adisyon"
olur — kullanıcı Ayarlar'dan sektörünü seçer, uygulama kimliğini değiştirir.

## Teknoloji

| Katman | Seçim |
|---|---|
| UI | React 19 + TypeScript 5.9 + Vite 7 |
| Yönlendirme | react-router-dom 7 |
| Stil | TailwindCSS 3.4 + `tailwindcss-animate` + scope'lu CSS dosyaları |
| Bileşen | Radix UI (dialog, popover, label, slot) + `class-variance-authority` |
| İkon | lucide-react |
| Bildirim | sonner (toast) |
| Tarih | date-fns |
| Backend | Supabase (self-hosted): Postgres + Auth + Realtime + Edge Functions (Deno) |
| PWA | vite-plugin-pwa, **injectManifest** modu, özel `src/sw.ts` (Web Push) |
| Test | `node --test tests/*.test.mjs` + psql regression SQL'leri |

Alias: `@/` → `src/`. Girinti: 4 boşluk. Yorumlar Türkçe.

## Klasör haritası

```
src/
├── App.tsx                 route ağacı; sektör yüzlerini bağlar
├── pages/                  masaüstü sayfalar
│   ├── sectorFaces.tsx     Takvim/Rezervasyon/Müşteri yüz haritası
│   ├── DashboardPage.tsx   DASHBOARD_FACES registry + RandevuDashboard
│   ├── DentalVisitPage.tsx diş vizit ekranı (v7)
│   ├── DentalChartPage.tsx odontogram + periodontal
│   ├── PatientFilePage.tsx hasta dosyası
│   ├── BeautyCashRegister.tsx  premium kasa (güzellik + kuaför + diş)
│   ├── KasaPage.tsx        eski kasa — YALNIZ restoran
│   └── ...
├── components/
│   ├── dashboard/          sektör dashboard yüzleri + kpi.tsx + faceKit.tsx + *Ops.css
│   ├── dental/             DentalChart, TreatmentPlans, PerioChart
│   ├── kuafor/             salon yüzü (Calendar/Reservations/Customers) + kuaforSuite.css
│   ├── beauty/  reservations/  settings/  layout/  ui/  ai/  brand/  icons/
├── mobile/
│   ├── theme.ts            --lt-* mobil token'ları (DARK_VARS / LIGHT_VARS)
│   ├── MobileShell.tsx  BottomTabBar.tsx  BottomSheet.tsx
│   ├── pages/              müdür mobili (MobileHome = MOBILE_FACES registry)
│   └── staff/              personel "kumanda" modu (PIN login, StaffModeRoot)
├── hooks/                  useReservations, useCustomers, useModules, useWhatsApp, ...
├── lib/                    SAF iş mantığı — testler node ile doğrudan import eder
├── contexts/  services/  types/  utils/
└── sw.ts                   push + notificationclick

supabase/
├── NNN_*.sql               sıralı migration'lar (en son 075)
├── functions/              16 edge function + _shared
└── tests/                  psql regression
```

## Tek kaynak (single source of truth) dosyaları

Bu desen TimeFlow'un en önemli mimari kuralıdır. **Sektöre göre değişen hiçbir şey
bileşen içinde `if` ile çözülmez.**

| Dosya | Ne tutar |
|---|---|
| `src/lib/sectorProfiles.ts` | `SECTOR_PROFILES` — 14 sektörün modül seti, terminoloji, personel rol adları, dashboard anahtarı, özel alan şablonları, kaynak tipleri, WhatsApp `comms` profili |
| `src/lib/calendarSectorProfiles.ts` | `CALENDAR_PROFILES` — hangi sektör hangi sayfa tasarımını (`FaceKey`) görür; `visitRoute` |
| `src/lib/cashSectorProfiles.ts` | Kasa varyantları (`allocatePlans`, `customerHref` …) |
| `src/lib/modules.ts` | `MODULE_META`, `DEFAULT_MODULES`, `normalizeModules` |
| `src/lib/nav.ts` | `NAV_ITEMS` — sidebar + mobil alt bar tek listeden üretilir |
| `src/lib/staffPermissions.ts` | `StaffRole` × `StaffPermission` matrisi |
| `src/lib/patientBalance.ts` | `computePatientFinance` — bakiyenin **tek** formülü |
| `src/lib/allocatePayment.ts` | FIFO tahsilat dağıtımı |
| `src/pages/sectorFaces.tsx` | `FaceKey` → React bileşeni haritası |

`lib/` içindekiler **saf** tutulur (React import etmez) ki `node --test` doğrudan import edebilsin.

## Modüller (7 adet, org bazında aç/kapa)

| Anahtar | Etiket | Açıklama |
|---|---|---|
| `randevu` | Randevu | Takvim, rezervasyonlar, online booking |
| `personel` | Personel | Personel yönetimi ve performans |
| `hizmet` | Hizmet | Hizmet kataloğu ve fiyatlandırma |
| `kasa` | Kasa | Tahsilat, gelir, ürün satışı |
| `masa` | Masa | Restoran masa yönetimi + oturma planı |
| `analiz` | Analiz | İstatistik ve raporlar |
| `sira` | Sıra | Randevusuz walk-in kuyruğu (kuaför/berber) |

**Kritik kural:** `masa` modülü açıksa sistem restorana bürünür — randevu açık olsa
bile restoran dashboard'u ve masa öncelikli navigasyon gösterilir. `masa` = "bu bir
restorandır" sinyali.

## Navigasyon

`NAV_ITEMS` tek listesinden hem `Sidebar` hem `BottomTabBar` üretilir.
Alan anlamları: `module` (yoksa core, hep görünür), `labelKey` (sektör terminolojisi),
`barPrio` (alt barda eleme önceliği), `managerOnlyInBar`, `sectorOnly`, `hideInSector`,
`hideInRestaurant`.

Sıra: Dashboard · Masalar · Menü · Takvim · Rezervasyonlar · Sıra · Müşteriler ·
Diş Şeması (`sectorOnly: 'dis'`) · Paketler (`guzellik`+`kuafor`) · Kasa · Stoklar ·
Personel · Analiz · Booking Sayfam.

## Dashboard yüzleri

`profileForSector(sector).dashboardKpis[0]` → `DASHBOARD_FACES` (masaüstü) /
`MOBILE_FACES` (mobil).

| Anahtar | Masaüstü bileşeni | Mobil |
|---|---|---|
| `randevuFace` | RandevuDashboard (DashboardPage içi) | MobileRandevuHome |
| `masaFace` | MasaDashboard | MobileMasaHome |
| `disFace` | DisDashboard | — (yok, randevu yüzüne düşer) |
| `dovmeFace` | DovmeDashboard | MobileDovmeHome |
| `guzellikFace` | GuzellikDashboard | — |
| `kuaforFace` | KuaforDashboard | — |
| `berberFace` | BerberDashboard | — |
| `estetikFace` | EstetikDashboard | — |
| `fizyoterapiFace` | FizyoterapiDashboard | — |
| `saglikFace` | HealthClinicDashboard | — |

**Strateji kararı (2026-07-12):** her sektörün **sabit, özel tasarlanmış** dashboard'u
olur — tüm diş klinikleri aynı diş dashboard'unu görür. Kullanıcının widget seçtiği
yaklaşım **iptal edildi**, tekrar önerme.

## Veri modeli (ana tablolar)

`organizations`, `organization_members`, `settings` (org ayarları + `services` kataloğu
+ `comms` JSONB), `customers`, `reservations`, `staff`, `staff_time_off`, `services`,
`payments`, `products`, `waitlist`, `customer_packages`, `package_templates`,
`daily_insights`, `integration_connections`, `resources` (051), `tables`/`table_reservations`
(masa), `queue_entries` (sıra), `push_subscriptions`, `app_secrets`, `org_whatsapp`,
`wa_message_log`, `whatsapp_sessions`.

Diş: `dental_charts` (054), `treatment_plans` (055, status: `proposed`/`active`/`completed`/`cancelled`),
`treatment_installments` (059), `patient_encounters` (062), `periodontal_charts` (063),
`plan_sessions` alanları (064: `session_count`/`sessions_done`), recall (`customers.recall_date`
+ `recall_reminded_for`, 065).

Stok: `074`/`075`. Personel primi: `073`. İndirim/yorum kodları: `071`.

### Multi-tenant / RLS deseni
Her tenant tablosunda RLS açık ve:
```sql
organization_id IN (SELECT auth_user_org_ids())
```
`auth_user_org_ids()` SECURITY DEFINER + STABLE, üyelikten çözer. Yeni kayıt →
`handle_new_user` trigger'ı izole org + owner üyeliği + settings oluşturur.
2026-06-19'da canlı DB'de uçtan uca doğrulandı (A→B sızıntısı = 0).

**Ölü tablolar** (kodda kullanılmıyor, user_id-scoped): `appointments`,
`organization_settings`, `whatsapp_templates`. Bir org'a çok kullanıcı eklenirse
org-scope'a taşınmalı.

`app_secrets` ve `whatsapp_sessions`: RLS açık + **0 policy** → yalnız service_role.

### Çakışma koruması (060)
Randevu çakışması **DB seviyesinde** trigger ile engellenir (advisory lock + kapasite
kontrolü). İstemci tarafı kontrol ikinci savunma hattıdır, tek başına yeterli değil.

## Realtime

Canlı: `reservations`, `payments`, `queue_entries`, `organizations`, masa tabloları,
`customer_packages`/`customers` (068). Canlı **değil**: `waitlist` (eksik, bekleme
listesinde), `staff`, `products`, `services`.

Yeni tabloyu canlıya almak: `supabase_realtime` publication'a ekle **+**
`REPLICA IDENTITY FULL` (DELETE filtresi için).

## Edge Functions (16)

| Fonksiyon | İş | Auth |
|---|---|---|
| `remind` | Cron: 24s/2s hatırlatma, recall, winback, yenileme | `x-cron-secret` |
| `whatsapp-proxy` | Evolution API köprüsü: send/state/connect/features | JWT + `resolveOrg` |
| `whatsapp-booking` | Gelen mesaj botu (Groq llama-3.3-70b) — niyet çıkarır, **kod** randevu oluşturur | public |
| `public-booking` | Online booking (slug→org); rate limit: telefon/gün 3, org/saat 30 | public |
| `booking-manage` | Müşterinin kendi randevusu (tahmin edilemez `customer_token`) | token |
| `gateway` | Core'a olay + `has_active_subscription` kontrolü | Bearer |
| `billing-status` / `dodo-checkout` / `dodo-webhook` | Dodo abonelik zinciri | karışık |
| `insight` / `draft-messages` | AI (Gemini 2.5 Flash) içgörü ve mesaj taslağı | JWT |
| `notify-waitlist` | Bekleme listesi bildirimi | JWT |
| `push-subscribe` / `send-push` | Web Push (VAPID) | JWT / secret |
| `generate-recurring` | Tekrarlayan randevu üretimi | **korumasız** (bilinçli) |
| `_shared/` | `auth.ts`, `org.ts` (`resolveOrg`), `wa.ts` |  |

**Üç çağıran tipi:** user (JWT → org üyelikten çözülür; gövdedeki `organization_id`
KULLANILMAZ), service (`SUPABASE_SERVICE_ROLE_KEY` — `SERVICE_ROLE_KEY` diye bir
değişken YOK), cron (`x-cron-secret`).

## WhatsApp

- Evolution API (Baileys) — org başına tek satır `org_whatsapp`, instance adı
  org id'den türetilir: `tf_<orgid>`. Kullanıcı elle ad yazmaz.
- AI mesaj: Gemini 2.5 Flash, sektörün `comms` profilinden karakter alır; AI
  başarısızsa şablon fallback. **Gizlilik:** AI'ya yalnız ön ad + hizmet + saat +
  sektör + işletme adı gider — telefon ve soyad GİTMEZ.
- Mesaj türleri: `confirmation`, 24h/2h hatırlatma, `recall`, `winback`, `renewal`,
  bekleme listesi, bot cevapları. Her biri `org_whatsapp.features` ile kapatılabilir.
- **Sessiz saat: 09:00–21:00 TR** (2 saat kala hatırlatma hariç).
- Kota yalnız **işletmenin başlattığı** mesajları sayar; `UNMETERED` (bot cevabı,
  randevu onayı) kotayı yemez.
- "Mesaj gitmiyor" şikayetinde ÖNCE Ayarlar → WhatsApp → **test gönderimi** çalıştır;
  ham `reason` döner (`quota` / `not_connected` / `invalid_phone` / `opt_out`). Tahmin yürütme.

## Mobil felsefesi

- **Müdür mobili = cepteki desktop.** Kasayı görür, herkesin randevusuna bakar,
  personelin nerede olduğunu izler, tam erişim.
- **Personel mobili = kumanda.** PIN'le girer, YALNIZ kendi randevularını görür,
  adisyona ekler, iş bitince kasaya gönderir. Basitlik esas.
- Sonuç: Faturalandırma / WhatsApp ayarları / widget kodunun mobilde olmaması
  **eksik değil, bilinçli tercih** — bunlar masaüstü kurucu işleri.
- ⚠️ Bilinen kabul edilmiş risk: personel izolasyonu **yalnız client-side**
  (RLS org seviyesinde, org'un tüm verisi telefona iner). Personel sayısı artınca
  staff-scoped auth + RLS şart.

## Deploy (self-hosted — standart Supabase komutları çalışmaz)

**Migration:**
```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164
docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt \
  psql -U supabase_admin -d postgres -f -   # SQL'i stdin'den ver
```
`postgres` rolü burada SUPERUSER **değil** — DDL için mutlaka `-U supabase_admin`.
İki Supabase stack'i var; TimeFlow = `...t6yi63jbebvj6c7oo7yjofnt`.

**Edge function:**
```bash
COPYFILE_DISABLE=1 tar --no-xattrs --exclude='._*' -czf fn.tgz <klasör>
scp fn.tgz root@76.13.4.164:/tmp/
# uzakta: yedek al (cp index.ts index.ts.bak-$(date +%Y%m%d-%H%M%S)), tar -xzf,
docker restart supabase-edge-functions-t6yi63jbebvj6c7oo7yjofnt
```
Yol: `/data/coolify/services/t6yi63jbebvj6c7oo7yjofnt/volumes/functions/<isim>/index.ts`.
Container'da `deno` yok → uzakta tip denetimi yapılamaz, sözdizimini yerelde doğrula.
Worker limitleri: 150 MB, 60 sn.

**Frontend:** Coolify'dan redeploy.

**Cron:** `pg_cron` YOK. `remind` VPS 1 root crontab'ından 30 dk'da bir çağrılıyor.

**Test org (furkan@luera.ai):** `108fa88a-02c3-48c8-96a3-41d0753585e3`

## Test

```bash
npm run test              # node --test tests/*.test.mjs
npm run test:conflicts:db # psql regression (çakışma)
npm run test:finance:db   # tedavi finansı
npm run test:encounters:db
npm run lint
npm run build             # tsc -b && vite build
```
Sözleşme testleri: `tests/public-endpoint-hardening.test.mjs` (public endpoint sertleştirmesi kilitli).
