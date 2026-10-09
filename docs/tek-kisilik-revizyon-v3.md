# Revizyon · v3 → v4 — "tahsil edildi" kartı

**Kime:** Claude Design
**Tarih:** 2026-10-09
**Dosyalar:** `Luera Mobil - Tek Kisilik v3.html` + `tek3-kit.js`

v3'ün geri kalanı doğru. R1–R4 uygulanmış: gün başlığı, hafta şeridi, kart
satırlar, kendi halkası çizilmemiş. Boş hâller, kumanda, Kasa, İşletme,
randevu kurma ve takvim denetlendi — başka kırık yok.

Tek sorun "tahsil edildi" kartı. Ve bu bir **ölçü tercihi değil, sınıf adı
çakışması.**

---

## 1 · Bulgu

Kart şu sınıfları alıyor: `gk done bar **gr**`, içindeki durum etiketi de
`stl **gr**`. Ama `.gr` stil sayfasında **zaten var** — Profil'in grup satırı:

```css
.gk { display:grid; grid-template-columns:minmax(0,1fr) auto; ... }   /* randevu kartı */
.gr { display:flex; min-height:64px; padding:12px 16px; width:100% }  /* Profil satırı */
```

İkisi de aynı öğeye uyuyor, sonra yazılan kazanıyor. Tarayıcıda ölçtüm:

| Kart | class | display | ad genişliği | yükseklik |
|---|---|---|---|---|
| Sıradaki | `gk` | grid ✓ | 217 px | **73 px** |
| Adisyon açık | `gk done bar am` | grid ✓ | 201 px | 97 px |
| **Tahsil edildi** | `gk done bar gr` | **flex ✗** | **37 px** | **94 px** |

Grid ölüyor: dört çocuk tek satıra biniyor ve her biri kendi içinde
kırılıyor — *"30 / dk"*, *"Lazer / Epilasyon"*, *"TAHSİL / EDİLDİ"* — ve
**ad "Si…" oluyor.**

Çakışma ikinci kez durum etiketinin kendisinde: `<span class="stl gr">` de
`.gr`'ye uyduğu için `min-height:64px` alıyor. Kartın şişkinliğinin asıl
kaynağı bu.

Amber kart etkilenmiyor, çünkü `.am` diye bir kural yok. Belgede altı yeşil
kart bu durumda.

## 2 · Düzeltme — iki simge

`tek3-kit.js`:

```js
satır 18:  const STL={gr:"TAHSİL EDİLDİ",am:"ADİSYON AÇIK"};
satır 21:  const PAID="gr",OPEN="am";
```

`gr` → `ok` (ya da `paid`). CSS'te renk zaten varsayılan (`.gk .stl` yeşil),
yani stil tarafında değişiklik gerekmiyor.

**İkinci çakışma, aynı anda düzeltilsin:** Kasa'nın tutar alanı
`class="fld2 big n"` alıyor ve `.big` kumandanın 96 px'lik sayacı. Şu an
`.fld2.big` kazandığı için görünürde sorun yok ama `line-height` 96 px'lik
kuraldan geliyor. `big` → `amt` olsun.

## 3 · Sonra: kart hâlâ fazla yer kaplıyor

Çakışma düzelince kart 97 px'e oturuyor — **sıradaki randevudan (73 px)
büyük.** Bitmiş iş, yapılacak işten fazla yer kaplıyor; kullanıcının
şikâyeti de bu. Sebep: durum kendi satırında ve üstünde 6 px boşluk var.

**Öneri:** durum satırı kalksın, hizmet satırına katılsın.

```
Sibel Karaca                    30 dk
Lazer Epilasyon · ● tahsil edildi
```

73 px'e iniyor, sıradakiyle aynı olur; soluk kalır. Renk tek başına
konuşmuyor, kelime yerinde duruyor.

Daha da sıkışması istenirse tek satır (`Sibel Karaca · Lazer Epilasyon`,
sağda küçük "tahsil edildi", ~48 px) — ama o zaman süre kayboluyor. Önerilen
ilki.

## 4 · Denetim sonucu

- 23 telefonun hiçbirinde telefon sınırını aşan öğe yok (`warm` ışıması
  hariç; o bilerek geniş ve kırpılıyor).
- Başka tek-sınıf çakışması yok.
- Boş hâller B1–B3 doğru: gerçekten boş / kapalı gün / yükleniyor ayrı ayrı,
  yüklenirken gün ve tarih gerçek, gerisi iskelet.
