# Devir 16 · Canlıya geçiş (açılış günü)

**Karar (kullanıcı, 2026-10-22):** testler biter bitmez canlıya geçilir —
saat ve gün fark etmez. Bu belge o anın tek sırası. Her komut kullanıcının
Terminal panelinde, onayıyla. Kod hazır; açılış günü yalnız komut çalışır.

**Ön koşul (testler, Dodo TEST):** yeni fiyatlarla uçtan uca alım (tek
çalışanlı işletme Tek kişilik alır, iki çalışanlıda kart pasif) ·
masaüstünden yeni kayıt "7 gün ücretsiz dene" görüyor (devir 14 §1.A).
✅ Ekip yıllık sayfası telefonda TRY 12,990.00 / yıl, vergi dahil
(2026-10-22 01:28). ✅ Test 1 (2026-10-22, işletme `6e206ea8…`, masaüstü
yeni kayıt): Ayarlar "Aktif aboneliğiniz yok", iki personelde Tek kişilik
pasif; birini pasif yapınca alım → Dodo `subscription.active` + ₺0
`payment.succeeded` + `updated`, üçü `applied`, ürün yeni haritada (Ekip
aylık `pdt_0NqFJdmgjgV9efKcXBYaE`), deneme 7 gün (Dodo 29 Eki; aynada +3 gün
tolerans → 1 Kas, bilerek). KUSUR bulundu ve kodda düzeltildi (deploy
bekliyor): ilk alım her zaman `/kurulum`'a dönüyordu (onaysız sihirbaz 1.
adım) ve `/settings?tab=billing` yönlenirken `checkout=success` düşüyordu —
`tests/odeme-donusu.test.mjs`. Apple Pay TEST kipinde görünmedi — Dodo belgesi ödeme
yöntemlerini "hesap doğrulanıp canlı kip açılınca" sayıyor; deneme açılışta,
adım 9'da (Safari + Cüzdan'da kart).

## 0 · Kullanıcının elle yaptığı (5 dk)

1. **Canlı API anahtarı:** Dodo → sol altta **Canlı Mod** → Geliştirici →
   API Keys → yeni anahtar, ad `Luera TimeFlow`, **yazma yetkisi AÇIK**.
   Önce bu komutu çalıştır, soru gelince anahtarı **soruya** yapıştır:
   `read -rs "K?Dodo canlı API anahtarı: " && echo && printf 'DODO_API_KEY=%s\n' "$K" > ~/.luera-dodo-canli.env && chmod 600 ~/.luera-dodo-canli.env && unset K && echo yazildi`
2. **İzleme anahtarı (salt okunur):** aynı yerde ikinci anahtar, ad
   `Luera İzleme`, **yazma yetkisi KAPALI** → `~/.luera-izleme.env`'deki
   `DODO_READONLY_KEY` satırı bununla değişir (ops/izleme/README.md "Dodo
   ucu" adım 2; eski test satırını sil).

Webhook'u panelde AÇMA, sırrını KOPYALAMA: betik açar ve okur.

## 1 · Sıra

| # | Komut | Ne görmeli |
|---|---|---|
| 1 | `ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ops/abonelik/kontrol-oku.sql` | Kim kilitlenir; iç hesaplar |
| 2 | İç hesaplar: `ops/abonelik/hediye.sh ver <e-posta> 0 pro` (karar: devir 14 §1.B) | `hediye.sh liste`'de görünür |
| 3 | `acilis-deneme.sql` kuru, sonra `-v uygula=1` (komut dosyanın başında) | Satırsız işletmelere açılıştan 7 gün |
| 4 | `node ops/abonelik/dodo-canli.mjs hazirla` | `Canlı anahtar: geçerli` · `Canlı uç: AÇILACAK` · KURU |
| 5 | `node ops/abonelik/dodo-canli.mjs gec` | `✓ Sunucu CANLI Dodo'ya bağlı` |
| 6 | HEMEN `node ops/abonelik/dodo-urun.mjs olustur uygula canli` | 6 × ✓, "Altısı Dodo'da, tutarlar doğru" |
| 7 | HEMEN `node ops/abonelik/dodo-urun.mjs harita uygula canli` | `✓ DODO_PRODUCT_MAP yazıldı` |
| 8 | Canlı ödeme sayfası: `https://checkout.dodopayments.com/buy/<baslangic_monthly canlı kimliği>?quantity=1` (açılmazsa Dodo panelinde ürünün bağlantısı) | "TimeFlow - Tek kişilik · Aylık TRY 799.00", vergi dahil — ÖDEME YAPMA |
| 9 | Gerçek kartla tek deneme (önerilir): yeni bir işletmede Tek kişilik → 7 gün deneme, bugün ₺0 → Ayarlar'da "Deneme" → deneme içinde iptal. Aynı sayfayı iPhone **Safari**'de aç (Cüzdan'da kart olan telefon), ülke Türkiye: **Apple Pay** düğmesi var mı | `dodo_events`'te canlı `subscription.active` `applied` — canlı webhook imzası çalışıyor · Apple Pay görünüyor |
| 10 | İzleme: `ops/izleme/wrangler.toml` → `DODO_API_BASE = "https://live.dodopayments.com"` (Claude değiştirir) → `ops/izleme`'de `npx wrangler@4.147.0 secret bulk ~/.luera-izleme.env && npx wrangler@4.147.0 deploy` → `node ops/izleme/dene.mjs` | `✓ dodo` |
| 11 | `ops/abonelik/eposta.sh kuru` → `ops/abonelik/eposta.sh ac` | Kime ne gideceği; sonra `ABONELIK_EPOSTA = true` |
| 12 | ENFORCE: `app_secrets.ENTITLEMENT_ENFORCE = 'true'` + Coolify env `VITE_ENTITLEMENT_ENFORCE=true` → **Deploy** (Restart DEĞİL) | Denemesi/aboneliği olmayan salon `/abonelik` duvarına düşer |
| 13 | lueratech.com (Framer) fiyatları 799 / 1.299 / 1.999 | — |
| 14 | İlk saat: `eposta.sh durum` · `kontrol-oku.sql` · dış izleme | Webhook hatası %0, beklenmeyen kilit yok |

5 ile 7 arasında ödeme sayfası çalışmaz (harita test ürünlerini gösterir,
canlı Dodo onları tanımaz) — ENFORCE kapalıyken zararsız, ama 6 ve 7
beklemeden. Adım 9'un tek ücreti yok: ilk alım 7 gün denemeli, iptal deneme
içinde.

## 2 · Geri alma

| Sorun | Komut |
|---|---|
| Canlı Dodo'da bir şey ters (ödeme, webhook) | `node ops/abonelik/dodo-canli.mjs geri` — adres, anahtar, sır VE harita test değerlerine döner (`DODO_TEST_*` yedeği; `gec` canlıyken yedeği ezmez) |
| Yalnız harita | `node ops/abonelik/dodo-urun.mjs harita geri` |
| Kilit yanlış | `update app_secrets set value = 'false' where key = 'ENTITLEMENT_ENFORCE';` + Coolify env false → Deploy |
| E-postalar | `ops/abonelik/eposta.sh kapa` |

`dodo-canli.mjs durum` her an: adres, sır uzunlukları, yedek var mı, ENFORCE,
e-posta anahtarı.

## 3 · Bilinenler

- **Deneme suistimali (yeni e-postayla tekrar tekrar 7 gün) — EN SONA
  BIRAKILDI (kullanıcı, 2026-10-22).** Bugünkü engel: deneme bitince kilit
  (ENFORCE, adım 12) + yeni hesap boş başlar. Konuşulacak seçenekler: aynı
  kartla ikinci deneme yok (Dodo'da kart izi yok; son 4 + ağ + son kullanma +
  sahip) · aynı telefondan ikinci deneme yok (Apple DeviceCheck, 1.0.2) ·
  telefonda da kartlı deneme.

- Test abonelikleri (Test Salon 3, furkan@luera.ai, 7552d6c1…) aynada
  bitiş tarihine kadar erişimli kalır; canlı Dodo onları tanımaz (kod
  `missing` sayar). Test kipindeki yenilemeleri artık canlı sırla
  imzalanmadığı için reddedilir — beklenen.
- Canlıdaki eski 6 ürün ($10/$30/$75) haritada değil; satılmaz. Arşivlemek
  isteğe bağlı (panel).
- Dodo hesabı "Bireysel" doğrulandı: ödemeler şahsa — vergi tarafı
  kullanıcının (mali müşavir).
- Betikler: `ops/abonelik/dodo-canli.mjs` (anahtar, uç, sır, yedek) ·
  `ops/abonelik/dodo-urun.mjs` (ürün, harita). Testler
  `tests/dodo-canli.test.mjs` (sahte Dodo + PGlite'ta gerçek SQL: açılış
  provası, ikinci geçiş yedeği ezmez, reddedilen anahtar hiçbir şey yazmaz,
  sır hiçbir argv'ye çıkmaz) — korumalar tek tek sökülünce düşüyor.
