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

### 1.4 · Tek kişiye göre kısmalar ✅
- Akış'ta personel şeridi çizilmiyor, Profil'de "Personel" satırı çizilmiyor.
  İkisi de ekranın İÇİNDE, `useInSoloShell` ile — ayrı dosya yok
- `CreateFlow.tsx:455`'teki yanlış "masaüstünden" cümlesi düzeldi

> **Plandan sapma — kilit tek personelde değil, SIFIR personelde.** Plan
> "tek personel varsa `staffId` kendiliğinden seçilsin" diyordu; kodu okuyunca
> gereksiz olduğu görüldü: saate dokunmak `staffId`yi zaten yazıyor
> (`CreateFlow.tsx:296`). Gerçek duvar personeli HİÇ OLMAYAN salon — saat
> listesi çizilmiyor, dokunulacak satır yok, düğme sonsuza kadar kapalı ve
> sebebi hiçbir yerde yazmıyor. Düğme artık "Önce personel ekleyin" diyor.
> Hâlâ kapalı (personel eklemek telefonda yok) ama sessiz değil.

### 1.5 · Mod sorusu ✅
`ready.tsx` artık soruyor: **Yalnız ben** / **Ekibim var**. Cevap sunucuya
yazılıyor, kabuk ancak yazma tuttuysa açılıyor. "Kurulumu bilgisayardan
tamamla" düğmesi kalktı.

### 1.6 · Testler ✅
2699 geçti, 0 kırık. Üç yeni test (sekme seti, karşılıklı kapılar, ekranların
kopya olmaması) ve yedi mevcut testin yeni sözleşmeye taşınması.

Yedisi de DÜŞMESİ GEREKTİĞİ için düştü; hiçbiri gevşetilmedi. En öğretici
olanı `rota-hedefleri`: yeni kabuğun sekmelerini "hiçbir yerden gidilmeyen
ekran" saydı. Kabuk listesi orada elle yazılı KALIYOR — yeni bir kabukta
testin düşmesi, "bu kabuk gerçekten gerekli mi" sorusunu sorduruyor.

---

## Faz 2 · Gün ekranının gerçek tasarımı ✅ (hap hariç)
v4'teki G1–G4: gün başlığı, hafta şeridi, kart satırlar, hâl kartı.

Bitenler: Gün ekranı (`app/tek/index.tsx`), v4 randevu kartı
(`SoloDayParts.tsx` · `.gc`/`.gk`), şimdi hapı, Takvim'in tek sütunu
(`ColumnCalendar`'ın `soloColumn`'u), boş gün (`VoidBlock` + ikinci şahıs
cümlesi), Takvim ve İşletme'deki müdür dili.

### Faz 2b ✅ — kumanda açıldı (2026-10-10)

Aşağıdaki duvar **aşıldı, 2. yolla**. Metin tarih kaydı olarak duruyor;
yapılan iş `solo.session` ucu, mobil jeton köprüsü ve hâl kartının hapı.

- Sunucu: `supabase/functions/staff-api/index.ts` → `solo.session`
  (dört kapı: sahip oturumu, org `solo`, tek aktif personel, abonelik)
- Mobil: `src/lib/soloSession.ts` + `src/api/staff.ts`in takılabilir
  tazeleyicisi + `app/tek/_layout.tsx`in takması
- Hap: `soloPanelAction` → "Kumandayı aç" / "Başlat"; işi kendisi yapmıyor
- Test: `tests/tek-kumanda-anahtari.test.mjs`

**Deploy gerekiyor: `staff-api`.** Göç gerekmiyor.

### Duvarın kendisi (tarihsel kayıt)

Hap "Başlat / Kumandayı aç" diyecek, yani kumandayı açacak. Kumanda
AÇILAMIYOR ve sebebi tasarım değil, kimlik:

`app/(staff-flow)/kumanda.tsx` baştan sona **personel API'si** üzerinde
çalışıyor (`src/api/staff.ts`). O API'nin kimliği `x-staff-token`: cihaz
token'ı + PIN ile alınıyor. Solo sahibin elinde Supabase **müdür** oturumu
var, personel token'ı YOK — `call()` daha ilk istekte `no_session` (401)
atıyor. `useMyStaffId()` de müdür oturumunda `staff.id` değil Supabase
kullanıcı kimliği döndürüyor.

Yani hapı çizmek, ekranı açılmayan bir kapıya bağlamak olurdu. İki gerçek yol
var, ikisi de sunucuya dokunuyor:

1. Solo sahip kendi telefonunu kendi personel satırına bağlar (var olan
   "telefon bağla" akışı, kendine) — uygulama tarafı, ama kurulumda bir adım
   daha demek.
2. Personel API'si org sahibinin Supabase JWT'sini kendi `staff` satırı için
   kabul eder — temiz çözüm, ama sunucu değişikliği ve deploy.

Seçilen: **2**. Sebep, 1'in tek kişilik modun amacına ters düşmesi — kendi
telefonuna kendine kod yazdırmak adım azaltmıyor, artırıyor.

Tahsilat hâlâ Faz 3, ama artık aynı kapının arkasında değil: kumanda açık,
eksik olan yalnız ödeme adımının kendisi.

### Faz 2'den bilerek çıkan ikisi
- **v4 S2**'nin "hizmetlerinizi de buradan ekleyebilirsiniz" cümlesi: hizmet
  sayısı bu ekranda okunmuyor ve en çok bakılan ekrana dördüncü bir sorgu
  eklemiyor.
- **Takvim sahipsiz randevuyu çizmiyor** (`columnize` `staff_id` boş satırı
  süzüyor), Gün çiziyor. Fark alt başlıktaki sayıyla SÖYLENİYOR, sessiz
  değil. Düzeltmesi `columnize`'ı değiştirmek, yani müdür takvimini de
  etkilemek.

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
