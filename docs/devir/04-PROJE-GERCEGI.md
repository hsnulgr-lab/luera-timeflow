# PROJE GERÇEĞİ — yeni oturumun bilmesi gerekenler

Bu dosya "kod okuyarak da bulunabilir ama bulunana kadar yanlış yaparsın"
bilgilerini topluyor.

---

## 1 · İKİ KİMLİK SİSTEMİ — en önemli kısıt

| | Müdür | Personel |
|---|---|---|
| Kimlik | **Supabase Auth** (e-posta/şifre) | **HS256 `x-staff-token`** |
| Veriye erişim | Doğrudan Supabase + RLS | Yalnız `staff-api` edge fonksiyonu |
| Org çözümü | `managerSource.resolveOrg()` | Token'ın `org` claim'i |
| Supabase oturumu | Var | **YOK ve OLMAYACAK** |

**Neden personelde Supabase oturumu yok** (`mobile/src/lib/supabase.ts`): RLS
org seviyesinde çalışıyor, yani personel telefonuna Supabase oturumu koymak
salonun **tüm verisini** o telefona açardı.

**Pratik sonucu:** JWT isteyen hiçbir edge fonksiyonu personel telefonundan
çağrılamaz. Personel için her yeni uç `staff-api`'ye action olarak eklenir.
(`push.register`/`push.unregister` tam olarak bu yüzden orada.)

Personel token'ı: `supabase/functions/_shared/staffToken.ts` —
`{sub: staff.id, org, role, epoch}`, TTL 12 saat. Cihaz token'ı 90 gün.
`epoch` uyuşmazlığı token'ı anında öldürüyor (082 tetikleyicisi).

---

## 2 · VERİ KAYNAKLARI — bu projedeki hataların bir numaralı kaynağı

| Ne | Gerçek kaynak | Tuzak |
|---|---|---|
| **Paketler** | `treatment_plans` (`plan_kind='paket'`, `session_count`, `sessions_done`, `total_amount`) | `customer_packages` ESKİ, yalnız fizyoterapide yaşıyor |
| Paket şablonları | `package_templates` (069) | Satış listesi; hakkın kendisi değil |
| Randevular | `reservations` | `customer_name` DENORMALIZE (müşteri tablosuna bakma) |
| Tahsilat | `payments` | |
| Çalışma saatleri, risk kuralları, sektör | `settings` | Org sahibinin satırı; sahipsizse en eskiye düşülüyor |
| Bakiye | `patientBalance.ts` (masaüstü) | **Salonlarda yanlış** — dağıtılmamış 'service' ödemelerini plan borcuna sayıyor. Telefon bu yüzden **paket başı kalanı** gösteriyor (kullanıcı kararı) |

**Uygunluk (eligibility):** `settings.risk_rules` + `services.tags`, eski
kurulumlarda ad kalıbına düşen yedek (`closedBy`, `foldTr`).

---

## 3 · CANLI ZİL — uygulama AÇIKKEN

- `supabase/100_live_doorbell.sql` — `staff_rt` rolü (public'te sıfır yetki),
  `realtime.messages` üzerinde iki RLS politikası, `ring_org()` tetik fonksiyonu
- `supabase/101_live_doorbell_wide.sql` — aynı fonksiyonu 9 tabloya daha takıyor
- **Kanaldan VERİ GEÇMEZ.** Gövde yalnız `{t: <tablo adı>}`. Ekran haberi duyup
  veriyi her zamanki yoldan çekiyor — izin kontrolü yer değiştirmiyor
- **Zil hatası YUTULUR.** Zil çalmadı diye randevu kaydedilmemezlik etmez
- **Yoklama KALKMIYOR.** `freshness.POLL_MS = 25_000` emniyet ağı olarak duruyor
- `mobile/src/lib/liveSignal.ts` — org başına TEK kanal, 300 ms coalesce,
  tablo süzgeci (`wakes()`), müdür ve personel aynı özel yayın kanalında;
  müdür katılamazsa eski `postgres_changes` yoluna düşüyor

**Süzgeç kuralı:** `useLiveSignal(fn, enabled, tables?)` — `tables`
verilmezse **her zil uyandırır**. Varsayılan bilerek "fazla tazele": kaçırılan
bir değişiklik, gereksiz bir okumadan pahalı.

`tests/mobil-canli-zil-genis.test.mjs` süzgeçte yazan her tablo adının gerçekten
zili olduğunu doğruluyor — yazım hatası o ekranı sessizce canlılıktan düşürürdü.

---

## 4 · BİLDİRİM — uygulama KAPALIYKEN

Zil ile **karıştırma**. İki ayrı sistem:

| | Canlı zil | Bildirim (push) |
|---|---|---|
| Ne zaman | Uygulama açıkken | Kapalıyken de |
| Altyapı | `realtime.send` (100/101) | `push_subscriptions` + `send-push` |
| Taşıdığı | Tablo adı | Başlık + gövde + hedef url |

`push_subscriptions` artık **iki kanallı**: `kind='web'` (tarayıcı/PWA, VAPID)
ve `kind='expo'` (native). Hedefleme sözleşmesi ortak:
`target: {staffId} | {role:'manager'}`.

Canlı olaylar (hepsi `reservations` üzerinde, hedef **personel**):
atama → `/calendar` · müşteri geldi → `/personel` · iptal → `/personel` ·
saat değişti → `/personel`. Ayrıca `remind` içinde "15 dk kala".

**Yöneticiye push bugün YOK** (`046`) — Tur 2'de açılıyor.

---

## 5 · DEPLOY VE MİGRATION

- Migration'lar `supabase/NNN_ad.sql` — düz numaralı dosyalar, `migrations/`
  klasörü **yok**. Son numara: **104**
- Uygulama: `ssh` + `docker exec … psql -U supabase_admin` (`05-KOMUTLAR.md`)
- **`postgres` rolü burada SUPERUSER DEĞİL**; tablolar `supabase_admin`'e ait.
  DDL için mutlaka `-U supabase_admin`
- Edge function deploy: `./scripts/deploy-functions.sh [isimler…]` — dosyaları
  rsync'leyip konteyneri yeniden başlatıyor. Argümansız = hepsi
- **İki Supabase yığını var**; TimeFlow = `…t6yi63jbebvj6c7oo7yjofnt`
- `pg_cron` **YOK**. Dış zamanlayıcı **n8n** (`n8n/*.json`)

---

## 6 · MOBİL ROTA YAPISI

Müdür ve personel kabukları **grup değil, gerçek segment**: `app/mudur/`,
`app/personel/`. Grup olsalardı `/calendar`, `/profile`, `/` iki dosyaya birden
düşerdi (yaşandı). `tests/mobile-rota-cakismasi.test.mjs` koruyor.

**Çakışma tuzağı:** `/personel` personelin sekmesi, `/personel/<uuid>`
**müdürün** personel-günü ekranı. Bu yüzden `pushRoute.ts` beyaz liste
kullanıyor, dizge birleştirmiyor.

Ortak ekranlar `app/(ortak)/`. Personel ekranından `(manager-flow)` adresine
gidilmez.

`tests/mobile-rota-hedefleri.test.mjs` — `typedRoutes` kapalı olduğu için `tsc`
rota literallerini denetlemiyor; bu test onun yerine geçiyor.

---

## 7 · YAZMA KURALLARI

`mobile/src/lib/managerWrite.ts`:
- Her yazmanın **ilk satırı** `if (await writesPaused()) return {ok:false, kind:'paused'}`
- **Bayrak okunamazsa yazma DURMAZ** — ters kurgu bir ağ boşluğunda bütün
  salonu durdururdu
- İyimser kilit: `.eq('updated_at', okunan)` (092)
- `23505` (tekillik) → satırı doğrula → başarı sayılabilir (kimlik istemcide
  üretiliyor)
- `23503` (yabancı anahtar) → `stale`
- **Cevap gelmediğinde "yazılmadı" DENMEZ.** Bkz. `packageSale.saleFailureText`

---

## 8 · RAFTA DURANLAR (kod duruyor, kapalı)

| Ne | Bayrak | Neden |
|---|---|---|
| Telefonda "Onayla" düğmesi | `mobile/src/lib/approval.ts` · `APPROVAL_FLOW_ENABLED = false` | Masaüstü elle randevuyu `pending` yazıyor; tasarımda onay yok. Kullanıcı "rafa kaldır, silme" dedi |
| Müdür bildirim ekranı | `managerProfile.ts` · `MANAGER_NOTIFICATIONS_READY = false` | Tur 2'de açılıyor |

---

## 9 · SEKTÖRLER

7 sektör destekli. Paket satışı yalnız `guzellik` ve `kuafor`'da
(`mobile/src/lib/packageSale.ts` · `PACKAGE_SALE_SECTORS`). Diş modülü 056 ile
bitti. Sektör başına sabit dashboard tasarımı (`DASHBOARD_FACES` registry).

---

## 10 · TEST SAYILARI (referans)

Son çalışan tur: **2610 test · 2603 geçti · 0 kırmızı · 7 atlandı**.
`tests/` altında ~135 dosya; ~85'i mobil.

Bir sayı düşerse bir test silinmiş demektir — sebebi sorulmalı.
