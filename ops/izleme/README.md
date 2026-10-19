# Luera dış izleme

Cloudflare'de (ücretsiz plan) 2 dakikada bir çalışan küçük bir Worker. Beş
adresi yoklar; bir şey düşerse telefona **Pushover** ile bildirim atar
(ntfy geçebildiği zaman ikinci, bedava kanal).

**Neden:** 16 Ekim 2026'da Hostinger VPS 1'i yeniden başlattı, giriş servisi
dönüşte ölü kaldı ve ~45 dk kimse fark etmedi. İzleme bu yüzden Hostinger'ın
**dışında** çalışır.

| Kontrol | Ne yoklar | Sağlıklı cevap |
|---|---|---|
| Giriş servisi | `/auth/v1/health` (anon anahtar başlıkta) | 200 + `GoTrue` |
| Veritabanı | rezervasyon sayfasının `profile` okuması (demo-luera) | 200 + `"business"` |
| Personel servisi | `staff-api`, jetonsuz | **401** + `invalid_token` (= fonksiyon açılıyor) |
| Masaüstü | `timeflow.lueratech.com` | 200 + `id="root"` |
| Luera sitesi | `lueratech.com` | 200 |
| Dodo ucu (30 dk'da bir, anahtar varsa) | Dodo `GET /webhooks` → TimeFlow'un `…/dodo-webhook` ucu | var, `disabled` değil, filtre abonelik olaylarını alıyor |

## Ne zaman bildirim gelir

- **Bir şey düşünce** (acil): "Giriş servisi çalışmıyor" + ne yapılacağı. İlk
  hata alarm değildir; 20 sn sonra yeniden denenir, ikincisi de düşerse çalar.
  VPS 1'in dört kontrolünden üçü birden düşerse tek bildirim: "Sunucu (VPS 1)
  yanıt vermiyor".
- **Kapalı kaldıkça** saatte bir: "… hâlâ çalışmıyor (1 sa 5 dk oldu)".
- **Düzelince:** "Giriş servisi düzeldi — 23 dk kapalı kaldı."
- **Her sabah 09:00** (sessiz): "İzleme çalışıyor · 5/5 ayakta". **Bu mesaj
  gelmediği gün izlemenin kendisi durmuştur.**
- Kurulumdan sonraki ilk turda bir kez: "İzleme başladı · 5/5 ayakta".

## Kurulum (bir kez, ~20 dk)

Önce: telefona App Store'dan **ntfy** uygulaması, bilgisayarda ücretsiz bir
**Cloudflare** hesabı. Komutlar bu klasörde (`ops/izleme`) çalıştırılır.

1. Cloudflare'e bağlan (tarayıcı açılır, izin verilir):
   `npx wrangler@4.147.0 login`
2. Durum deposunu aç:
   `npx wrangler@4.147.0 kv namespace create DURUM`
   Çıktıdaki `id`'yi `wrangler.toml`daki `id` yerine yaz (bu kurulumda yazıldı: `a45f9862…`). Wrangler
   yapılandırmaya kendisi eklemeyi teklif ederse **hayır** de (aynı ad iki kez
   yazılır).
3. Yükle: `npx wrangler@4.147.0 deploy`
4. Anon anahtarı sır olarak ver (ekrana basılmaz):
   `grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' ../../mobile/.env | cut -d= -f2- | tr -d '"' | npx wrangler@4.147.0 secret put SUPABASE_ANON_KEY`
5. Bildirim konusunu üret ve **dosyaya** yaz (panoya değil — komutu
   kopyalamak panoyu ezer; ilk kurulumda konu yerine komut metni gitti):
   `printf %s "luera-izleme-$(openssl rand -hex 8)" > ~/.luera-izleme-konu && chmod 600 ~/.luera-izleme-konu`
   **Konu adı şifre gibidir:** bilen herkes bildirimleri okuyabilir ve sahte
   bildirim atabilir. Dosya depo dışında durur; içeriğini kimseye yapıştırma.
6. Telefona geçir ve abone ol: `pbcopy < ~/.luera-izleme-konu`, sonra
   **hemen** telefonda ntfy → **+** → yapıştır → **Subscribe** (arada başka
   bir şey kopyalama). **Elle yazma:** ilk kurulumda telefona elle yazılan
   konuda rakam `0` yerine harf `O` girildi ve bildirimler başka konuya gitti.
   Telefondaki konu yazısı dosyadakiyle harfi harfine aynı olmalı.
7. Konuyu Worker'a ver (dosyadan okur):
   `npx wrangler@4.147.0 secret put NTFY_TOPIC < ~/.luera-izleme-konu`
8. 2 dakika içinde (yeni kurulan zamanlayıcı Cloudflare'de 15 dk'ya kadar gecikebilir) telefona **"İzleme başladı · 5/5 ayakta"** gelir. Gelmezse
   Cloudflare paneli → Workers → `luera-izleme` → **Logs**.

## Pushover (asıl kanal, 2026-10-17)

**Neden ntfy değil:** ntfy.sh ücretsiz sürümü göndereni internet adresinden
tanıyor; Worker Cloudflare'in **paylaşılan** adreslerinden gönderiyor ve o
payı başkaları tüketiyor → alarm 429 ile reddedildi. Ücretsiz ntfy hesabı da
çözmedi (ntfy yalnız ücretli hesabı kullanıcı başına sayıyor). Pushover'ın
sınırı kullanıcı başına: ayda 10.000 mesaj. 30 gün deneme, sonra iOS için
tek seferlik $4.99.

1. iPhone'a **Pushover** uygulaması → uygulamada hesap aç (30 gün deneme başlar).
2. pushover.net'e gir → sağ üstteki **Your User Key** = `PUSHOVER_USER`.
3. pushover.net/apps/build → ad `Luera İzleme` → oluştur → **API Token/Key** = `PUSHOVER_TOKEN`.
4. İkisini depo dışındaki dosyaya yaz (değerler ekrana basılmaz; komut çalışırken sorar):
   `read -rs "U?Pushover User Key: " && echo && read -rs "A?Pushover API Token: " && echo && printf 'PUSHOVER_USER=%s\nPUSHOVER_TOKEN=%s\n' "$U" "$A" > ~/.luera-izleme.env && chmod 600 ~/.luera-izleme.env && unset U A && echo kaydedildi`
5. Bilgisayardan dene: `node ops/izleme/dene.mjs --bildirim` → telefona "🧪 Deneme".
6. Worker'a ver: `npx wrangler@4.147.0 secret bulk ~/.luera-izleme.env`
7. Telefonda Pushover → Settings → **Critical Alerts** aç: acil alarm sessiz
   modda ve Uyku odağında da çalar.

Öncelikler: düşüş **acil** (onaylanana dek 5 dk'da bir, en çok 1 saat),
saatlik hatırlatma yüksek, düzelme normal, sabah 09:00 sessiz.

## Dodo ucu (2026-10-19)

**Neden:** Eylül'de webhook günlerce 500 dönünce Dodo, TimeFlow'un ucunu
**kendiliğinden** devre dışı bıraktı; 8 hafta tek abonelik olayı gelmedi ve
TimeFlow tarafında her şey sağlıklı göründüğü için kimse fark etmedi
(`docs/devir/10-CORE-DODO-BASLANGIC.md` §9). Uç kapanınca **bir kez sesli**
(Pushover 1) alarm, açılınca "yeniden çalışıyor".

- Yalnız **salt okunur** Dodo anahtarıyla çalışır; yazma yetkili anahtar
  Worker'a konmaz. Anahtar yoksa kontrol hiç yoktur (alarm üretmez).
- Dodo'nun kendi kesintisi (5xx, 429, ulaşılamıyor) alarm değildir: o tur
  sayılmaz. Anahtarın reddi (401/403) alarmdır — izleme kör kalmış demektir.

Kurulum (bir kez):

1. Dodo paneli (**Test** kipi) → Developer → API Keys → yeni anahtar, ad
   `Luera İzleme`, **Enable write access KAPALI**.
2. Önce bu komutu çalıştır; soru gelince Dodo'dan anahtarı kopyalayıp
   **soruya** yapıştır (sırayı ters yaparsan pano komutla ezilir):
   `read -rs "K?Dodo salt okunur anahtar: " && echo && printf 'DODO_READONLY_KEY=%s\n' "$K" >> ~/.luera-izleme.env && unset K && echo eklendi`
3. Bilgisayardan dene: `node ops/izleme/dene.mjs` → `✓ dodo`. Uç o an
   kapalıysa `✗ dodo … Dodo ucu devre dışı bıraktı` (kontrol çalışıyor demek).
   `anahtar reddedildi` görürsen salt okunur anahtar `/webhooks`'u okuyamıyor
   demektir — Claude'a yaz, yazma yetkili anahtarı **koyma**.
4. Worker'a ver ve yükle (`ops/izleme` klasöründe):
   `npx wrangler@4.147.0 secret bulk ~/.luera-izleme.env && npx wrangler@4.147.0 deploy`
5. Dodo → Webhooks → **Settings** → e-posta uyarısına adresini yaz (ikinci kanal).

**Dodo Live'a geçince:** `wrangler.toml` → `DODO_API_BASE =
"https://live.dodopayments.com"` ve Live kipinde yeni salt okunur anahtar
(Test anahtarı Live'da geçmez); 2-4. adımlar yeniden.

## Elle deneme

Depo kökünden. Kontrolleri bu bilgisayardan bir kez koşar, bildirim göndermez:

    node ops/izleme/dene.mjs

Ayarlı kanallara (Pushover, ntfy) tek bir deneme bildirimi:

    node ops/izleme/dene.mjs --bildirim

## Bakım

- **Kontrol eklemek:** `src/kontroller.js` → `kontroller()` listesine ekle,
  `tests/izleme.test.mjs`'i güncelle, `npx wrangler@4.147.0 deploy`.
- **Demo salon silinirse** "Veritabanı" kontrolü düşer: `wrangler.toml`'daki
  `DEMO_SLUG`'ı başka bir açık salona çevir.
- **Durdurmak:** `npx wrangler@4.147.0 delete`.
- **Ücretsiz plan payı:** günde 720 tur; depoya yalnız durum değişince yazılır
  (sınır 1000/gün); tur başına en çok ~15 alt istek (sınır 50; Dodo yalnız
  :00 ve :30 turlarında).
