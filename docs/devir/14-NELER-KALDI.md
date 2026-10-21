# Devir 14 · Neler kaldı (2026-10-21 sabah)

Bütün açık işlerin tek listesi. Kaynaklar: devir 10 §11 (abonelik açılışı),
devir 13 §8 (e-posta denemeleri), `docs/yapilacaklar.md` (en son 2026-10-20
gece güncellendi; birkaç maddenin durumu değişmiş olabilir — çelişkide
buradaki ve devir 10/13 kazanır).

**Bugünün gerçeği:** abonelik e-postaları + sihirli bağlantı CANLIDA, gönderim
anahtarı (`ABONELIK_EPOSTA`) KAPALI → tarama kuru. ENFORCE KAPALI. Dodo TEST
kipinde. Dal `tek-kisilik`, son commit `6a115d1` (push yok). Yerel denetim:
`npm test` 3347 / 0 hata, `tsc` temiz.

**Önerilen sıradaki adım:** §1.A'nın ilk maddesi — ödeme alınamayan salon
akışı. Açılıştan önce doğrulanmamış en riskli akış.

## 1 · Abonelik — açılışa kadar (sırayla)

### A · Denenmemiş akışlar (Dodo TEST, test kartıyla; kullanıcıyla)
1. **Ödeme alınamayan salon** (devir 10 §11 C.3, devir 13 §8.1): ödemeyi
   başarısız kıl → webhook `grace` → telefona "Son ödeme alınamadı.
   Ayrıntılar e-postanızda." → `ops/abonelik/eposta.sh dene <e-posta> odeme`
   (anahtar kapalı, tarama göndermez) → düğme → "Ödemeniz alınamadı" + geri
   sayım → "Kartı güncelle" → test kartı → borç çekilir, ayna `active`,
   dönüş `/abonelik?kaynak=eposta&kart=1`. Başarısız kılma yöntemi Dodo'nun
   test belgesinden (reddedilen test kartı + "Sonraki fatura tarihini
   güncelle" ile birkaç dakika sonrası).
2. **E-postadan paket alma** (devir 13 §8.2): telefondan YENİ bir işletme aç
   (kartsız deneme; Test Salon 3 artık Dodo'da) → `dene uc_gun` → düğme →
   plan seç → test kartı → dönüş `/abonelik?checkout=success&kaynak=eposta`
   → "Denemeniz başladı" fişi, Kurulum/uygulama düğmesi YOK.
3. **Apple gizli adres** (devir 13 §8.3): Apple ile "E-postamı gizle"
   seçilerek açılmış hesaba `dene` → relay iletiyor mu. Bugüne kadarki
   denemeler iCloud'un gerçek adresine gitti.
4. **Apple Pay** (devir 10 §11 C.1): telefonun Safari'sinde Dodo ödeme
   sayfasında çıkıyor mu.
5. **Masaüstünden yeni kayıt** (devir 10 §11 C.4): abonelik satırı YOK (web
   etiketi) → Ayarlar "Aktif aboneliğiniz yok · 7 gün ücretsiz dene".

### B · Kullanıcının kararını bekleyenler
- **İç hesaplar:** furkanhasan@luera.ai (bitiş 2026-09-12) ve
  nisanur@luera.ai (2026-09-29) → hediye (`ops/abonelik/hediye.sh ver …`) mi,
  kilit mi. Abonelik satırı olmayan 2 işletme gerçek salon mu, test mi
  (salt okunur sorguyla bakılır).
- **Test kalıntıları:** Test Salon 3 ve furkan@luera.ai'nin test
  abonelikleri Live'a geçince ne olacak (aynadaki test kimlikleri Live'da
  "yok" sayılır — kod hazır, karar değil).

### C · Tasarım bekleyen
- **Kurulum v2** son adımı "7 gün ücretsiz başlat" (Dodo, kartla) — devir 12.
  Gelmeden ENFORCE açılırsa geçici akış: kurulum biter → kapı `/abonelik`e
  atar → "Planınızı seçin, 7 gün ücretsiz" (çalışır, ideal değil).

### D · Açılış günü (sırayla, her adım kullanıcı onayıyla — devir 10 §11 E)
1. Ölçüm: `ops/abonelik/kontrol-oku.sql` (kim kilitlenir).
2. İç hesaplar ve test kalıntıları (§1.B kararlarıyla).
3. `ops/abonelik/acilis-deneme.sql` kuru → `-v uygula=1`.
4. **Dodo Live:** işletme doğrulaması · Live ürünleri taban **TRY**
   (aylık 299/599/1.199, yıllık 2.868/5.748/11.508), yerel kural YOK, vergi
   dahil · Live API anahtarı + webhook sırrı + `DODO_API_BASE` (live) +
   `DODO_PRODUCT_MAP` canlı kimlikler (`app_secrets`, sohbete yapıştırmadan)
   · Live'da webhook ucu (aynı adres) · dış izleme Worker'ı (`ops/izleme`)
   Live'a.
5. `ops/abonelik/eposta.sh ac` (Live ile birlikte; TEST'teyken durur).
6. **ENFORCE** sakin saatte: `app_secrets.ENTITLEMENT_ENFORCE = 'true'` +
   Coolify'da `VITE_ENTITLEMENT_ENFORCE=true` → Deploy. Geri alma:
   `update app_secrets set value='false' where key='ENTITLEMENT_ENFORCE';`
7. İlk gün izleme: kilitlenen var mı · webhook hata oranı %0 mı · e-posta
   defteri (`eposta.sh durum`).

### E · App Store
- Sonraki sürümün inceleme notu: "TimeFlow salonlara satılan bir web
  hizmetidir; uygulamada satın alma ya da yönlendirme yoktur; ödeme bilgisi
  e-postayla gider; demo hesap süresiz aktif."
- Mağaza açıklaması ve ekran görüntülerinde fiyat / plan / "web'den abone
  olun" geçmediği kontrol edilecek (yapılmadı).

### F · Açılışı engellemeyen abonelik borçları (devir 10 §11 G)
- Plan değiştirme yok (Dodo Change Plan): aktif aboneye "Planı değiştir" /
  "Yıllığa geç" 409 → destek e-postası.
- Fatura bilgisi (VKN / vergi dairesi) toplanmıyor · kartın son 4 hanesi
  gösterilmiyor · Dodo ödeme sayfası teması.
- Core Studio parolası değişecek (devir 10 §9).
- furkan@luera.ai test kipinde 4 aktif abonelik (eskiler 9/12 Kasım'da
  yenilenince kapanır).

## 2 · Telefon uygulaması
- **1.0.1 yayını:** "Release This Version" 20–21 Ekim 09–11'e planlıydı,
  ardından 7 günlük kademeli izleme. Yapılıp yapılmadığı bu belgeye
  yazılırken bilinmiyordu — kullanıcıya sor.
- **1.0.2:** Ayarlar yeniden tasarımı + "Hesabı sil" (Claude Design) ·
  kilit ekranında bekleme geri sayımı (Live Activity) · "Bekleme kur"da
  bildirim izni ön sorusu · çevrimdışı BAŞLAT → `items_stale` kusuru ·
  personelde "oturum kapandı" metni · personel müşteri dosyasında paket
  halkası · gizlilik metninin yeni hâli (`631bf04`, yurt dışı aktarım
  kararını bekliyor) · mağaza ekran görüntüleri.
- **Küçük ama önemli:** info@lueratech.com dışarıdan hiç denenmedi · çökme
  takibi (Sentry) yok.

## 3 · Masaüstü
- Genel tasarım turu + yeni Kurulum sihirbazı ekranı (yapilacaklar §3B).
- Lint'te yeni tek bulgu: `src/components/beauty/BeautySessionModal.tsx`
  (seans penceresi işi, küçük).

## 4 · Ayrı oturumların işleri
- **WhatsApp:** salonun hat QR eşleştirmesi bekliyor ("connecting" süzgeci
  düzeltmesi 2026-10-11'de deploy edildi).
- **Altyapı:** `supabase.lueratech.com` (LeadFlow/CallFlow) 503 · VPS 1'de
  kullanılmayan Supabase yığını (`eopb02…`; yedek → Stop → bekle → sil).
- Luera sitesi + ekosistem + Instagram planı.

## 5 · Tarihe bağlı ya da büyüdükçe gerekecek
- **Pushover denemesi ~16 Kasım'da biter** — $4.99 alınmazsa sabah 09:00
  alarm mesajı susar.
- **Yedeğin dış kopyası + geri yükleme provası yok** — yedek VPS'in kendi
  diskinde; sunucu giderse yedek de gider.
- **Sunucu kurtarma tek sayfası yok** — bilgi hafıza notlarına dağılmış.
- `settings` işletme başına değil kullanıcı başına (ikinci müdür eklenince
  ayarlar kaybolur → `unique(organization_id)`) · personel verisi sunucuda
  ayrılmıyor (istemci süzüyor) · masaüstü en çok 500 randevu satırı
  (`src/hooks/useReservations.ts:205`) · şube desteği ve Core API
  anahtarları · KVKK metni işletme başına değil.
- Mobil↔masaüstü denetiminin 2. turu (ilki 2026-09-27) · Paketler'deki
  "ödenmedi"nin masaüstü bakiyesiyle aynı olup olmadığı · mağaza paketinin
  sessizce sahte veriye düşebilmesi (`mobile/src/api/session.ts:24`).

## Kurallar (değişmedi)
- Komutlar (ssh, deploy, göç) kullanıcının Terminal panelinde, onayıyla.
- Elle yapılan her iş açarak anlatılır: ne · neden · nasıl · ne görmeli ·
  bana ne söylesin.
- Commit/push yalnız kullanıcı isteyince; `site/` commit'e girmez.
- Coolify'da Deploy, Restart DEĞİL. `_shared` değiştiyse fonksiyonlar
  ARGÜMANSIZ yüklenir. Göçler önce kuru koşu.
