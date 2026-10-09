# Uygulama planı · Üçüncü kabuk (tek kişilik işletme)

**Tarih:** 2026-10-09
**Tasarım:** `design-reference/Luera Mobil - Tek Kisilik v4.html` (onaylandı)
**Brief:** `brief-tek-kisilik-isletme.md`

---

## 0 · Kazıdan çıkanlar

| Soru | Cevap |
|---|---|
| Mod nerede duracak? | `organizations.solo` — org başına tek satır. `settings` **olmaz**: o `user_id` bazlı (bkz. hafıza notu) |
| Kabuğa giriş kaç yerden? | **Tek yerden**: `src/lib/enterShell.ts` · `shellHref(actor)`. Dört çağıran var |
| `AuthActor` kaç yerde? | 11 yer. Üçüncü değer eklemek ucuz ama **eklenmeyecek** — aşağıda gerekçe |
| Sahibin personel satırı var mı? | **Yok.** `006_handle_new_user_safe.sql` org + üyelik + settings açıyor, staff açmıyor |
| Randevu personelsiz kurulabiliyor mu? | Hayır — `createFlow.ts:181` `staffId` şart |

**`AuthActor`a `'solo'` eklenmiyor.** Tek kişi veritabanında da müdür: org
sahibi, `organization_members.role = 'owner'`, RLS aynı. Rolü değiştirmek
`roleGate`, `pushSetup`, `resume` ve oturum kaydını birden etkilerdi. Mod ayrı
bir bayrak olarak taşınıyor: `actor = 'manager'` + `solo = true`.

---

## Faz 1 · Kabuk ayağa kalksın (bugün)

Hedef: tek kişilik hesap açılıyor, kendi kabuğunda açılıyor, randevu kurup
günü görebiliyor. Telefonda Expo Go ile doğrulanabilir.

### 1.1 · Göç · `supabase/108_tek_kisilik.sql`
- `organizations` → `solo BOOLEAN NOT NULL DEFAULT false`
- `handle_new_user()` → org/üyelik/settings'e ek olarak **sahibe bir `staff`
  satırı** açıyor (`name = display_name`, `is_active = true`)
- Geri doldurma: **hiç personeli olmayan** org'lara sahibin satırı açılıyor.
  Randevular `staff_id` tutmadığı için bu satır hiçbir veriyi taşımıyor.
  `solo` **kendiliğinden true yapılmıyor** — mevcut hesapların kabuğu değişmez.
- `NOTIFY pgrst, 'reload schema'`

> Bu göç üretimdeki **kayıt akışına** dokunuyor. Önce yerelde, sonra sakin
> saatte. Deploy'u kullanıcı çalıştırıyor.

### 1.2 · Oturum ve yönlendirme
- Oturum profiline `solo?: boolean`; girişte ve `resume`da org'dan okunuyor
- `shellHref(actor, solo)` → `/tek`
- `app/mudur/_layout.tsx`: `solo` ise `<Redirect href="/tek" />`
- `app/tek/_layout.tsx`: `useActorGate('manager')` + `solo` değilse `/mudur`

### 1.3 · Kabuk · `app/tek/`
Gerçek segment (grup değil) — yoksa `tests/mobile-rota-cakismasi.test.mjs` patlar.

| Dosya | Faz 1'de ne |
|---|---|
| `_layout.tsx` | Beş sekme, müdür setiyle aynı biçim ve **etiketli**. `ManagerDayProvider` içeride |
| `gun.tsx` | **`StaffDay`** bileşeni, sahibin kendi `staff` satırıyla. Müdür 24'ün ta kendisi; çalışıyor |
| `calendar.tsx` · `cash.tsx` · `isletme.tsx` · `create.tsx` | Müdür ekranlarını yeniden dışa aktar |

### 1.4 · Tek kişiye göre kısmalar
- `İşletme`de **Personel** satırı render edilmiyor
- `CreateFlow`: salonda **tek** personel varsa `staffId` kendiliğinden seçiliyor
  → `createFlow.ts:181` kilidi düşüyor. (Bu, tek moda özel değil; tek personelli
  her salonu düzeltiyor)
- `CreateFlow.tsx:455`'teki yanlış "masaüstünden" cümlesi düzeliyor

### 1.5 · Mod sorusu
`signup/ready.tsx`'teki **"Kurulumu bilgisayardan tamamla"** düğmesi kalkıyor,
yerine iki seçenek: **Yalnız ben** / **Ekibim var** → `organizations.solo`
yazılıyor → `enterShell`.

### 1.6 · Testler
- Rota çakışması testi yeşil kalmalı
- Yeni: `solo` kullanıcı `/mudur`a düşmez, `/tek`e gider
- Yeni: tek personelli salonda "Saat seçin" kilidi açılır

---

## Faz 2 · Gün ekranının gerçek tasarımı
v4'teki G1–G4: gün başlığı, hafta şeridi, kart satırlar, hâl kartı ve
dokunulabilir eylem düğmesi (Başlat · Kumandayı aç). Kumanda katmanı personel
kumandasına bağlanıyor.

## Faz 3 · Para ve ekip
- Tahsilat (BİTİR sonrası) + Kasa'da **düzelt / geri al** — yeni yazma yolları,
  ters kayıt, denetim kaydı
- İşletme → **Ekip ekle** kapısı; önkoşulu **telefondan personel ekleme**
- Paket satışı tek ödemeyle

---

## Bugün BİTMEYECEK olanlar
Tahsilat, Kasa düzeltme, telefondan personel ekleme, Ekip ekle kapısı. Bunlar
sunucu tarafında yeni yazma yolu istiyor; Faz 3.

## Karar bekleyen tek şey
Faz 1'in göçü, brief §5 karar 3'ü uyguluyor: **sahip kayıtta sessizce bir
personel satırına bağlanıyor.** Onaylanmazsa `staff_id` boş kalır ve takvim,
çakışma kontrolü, raporlar ikinci bir dal kazanır. Öneri: onaylansın.
