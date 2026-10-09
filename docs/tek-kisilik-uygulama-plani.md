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

### 1.1 · Göç · `supabase/108_tek_kisilik.sql` ✅ yazıldı
- `organizations.solo BOOLEAN NOT NULL DEFAULT false`
- `set_business_mode(p_solo, p_name)` — bayrağı yazıyor ve tek moda geçerken
  **hiç personeli yoksa** sahibe bir `staff` satırı açıyor. Tek işlem: ikisi
  birlikte olur ya hiç olmaz. SECURITY INVOKER, yani RLS aynen geçerli
- `GRANT EXECUTE` açıkça veriliyor (096 dersi)

> **`handle_new_user` DEĞİŞMİYOR.** İlk plan her kayıtta sahibe personel satırı
> açmayı öngörüyordu; vazgeçildi. Birincisi o tetikleyici üretimdeki kayıt
> akışı ve bozulduğunu ancak biri kaydolmaya çalışınca öğreniriz. İkincisi
> kayıt anında mod bilinmiyor — soru kaydın sonunda. Satır artık "Yalnız ben"
> denildiği an açılıyor. **Mevcut hiçbir hesap etkilenmiyor; göç tek başına
> hiçbir davranışı değiştirmiyor.**

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

Brief §5 karar 3: **sahip bir personel satırına bağlanıyor.** Artık yalnız
"Yalnız ben" diyen hesapta ve yalnız o an oluyor — ekibi olan hiçbir salonu
etkilemiyor. Onaylanmazsa `staff_id` boş kalır ve takvim, çakışma kontrolü ve
raporlar ikinci bir dal kazanır; hatalar o dalda saklanır. Öneri: onaylansın.

## Göçün doğrulanması

Yerelde postgres yok, bu yüzden SQL **çalıştırılarak denenmedi.** Buna karşı
tek savunma göçün kendi yapısı: dosya `BEGIN`/`COMMIT` arasında ve yalnız
`ADD COLUMN IF NOT EXISTS` ile `CREATE OR REPLACE FUNCTION` içeriyor. Sözdizimi
hatası olursa işlem geri sarılır ve **hiçbir şey değişmez**; mevcut veriye
dokunan tek satır yok.
