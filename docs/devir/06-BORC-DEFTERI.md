# BORÇ DEFTERİ — ertelenenler ve bilinen hatalar

Durum: 2026-09-23. Her madde **neden ertelendi** ve **ne olunca açılır** ile.

---

## Bu turda açılacak olanlar

| # | İş | Durum |
|---|---|---|
| 1 | `101_live_doorbell_wide.sql` çalıştırılması | **Kod hazır ve testli, SQL çalıştırılmadı** |
| 2 | `102_payment_void_log.sql` çalıştırılması | 2026-09-22'den beri bekliyor; saf DB tetikleyicisi, deploy istemiyor |
| 3 | Bildirim Tur 1 + Tur 2 deploy'u | **Kodun tamamı hazır** (103-106 + 4 fonksiyon); SQL, deploy ve derleme bekliyor |

---

## Küçük doğruluk hataları (kullanıcı biliyor, ertelendi)

| Ne | Nerede | Not |
|---|---|---|
| ~~Kasa'da ölü "Gün sonu" düğmesi~~ | — | **ÇÖZÜLDÜ, madde bayattı.** `mobile/app/mudur/cash.tsx:91` ve `CashSheets.tsx:479` gerçek bir "Gün sonu / dönem özeti" sayfası taşıyor (2026-09-22). Yine de telefonda bir kez bakılsın. |
| **Kendiliğinden düşen no-show'lar** müşteri defterinde sayılmıyor | Müdür · müşteri defteri | Sayı eksik görünüyor |
| **₺0 adisyon** "ödeme bekliyor" gibi görünüyor | Kasa | Sıfır tutar tahsilat beklemez |
| Masaüstü paket listesinde **isim taşması** | Masaüstü | Görünüm hatası |
| ~~Ölü `accountDeletionItems` metni~~ | — | **MADDE YANLIŞ, silindi.** `app/(staff-flow)/account.tsx:87`'de kullanılıyor (2026-09-23'te doğrulandı). |

---

## Karar bekleyenler

**Masaüstü elle randevuyu `pending` yazıyor.**
`CalendarPage.tsx` her elle oluşturulan randevuyu `status: 'pending'`
kaydediyor; `organizations.booking_auto_confirm` yalnız web/WhatsApp
rezervasyonlarını etkiliyor. Telefonda "Onay bekliyor" görünmesinin sebebi bu.
Tek satırlık değişiklik + frontend deploy. **Kullanıcı karar vermedi.**

**"30 gün yedek" cümlesi doğrulanmadı.**
`public/gizlilik.html` ve `destek.html`'de geçiyor ama gerçekten 30 günlük
yedek alınıp alınmadığı kontrol edilmedi. **Doğrulanmadan yayına çıkmamalı** —
yanlışsa taahhüt ihlali.

**Kayıp personel telefonu koparılamıyor.**
Personel telefonunu kaybederse cihaz eşleşmesini uzaktan iptal edecek yol yok.
Kullanıcı 2026-09-18'de erteledi. (Task kaydı: `task_431701e5`.)

---

## Mağaza hazırlığı

| İş | Ön koşul |
|---|---|
| Demo salon (gerçekçi veri) | — |
| App Store görselleri | **Demo salon** — onsuz uydurma ekran görüntüsü olur |
| Sentry | — |
| Android paket kimliği | ✅ bu turda eklendi (`ai.luera.timeflow`) |
| EAS yapılandırması | ✅ `eas.json` bu turda yazıldı; `eas init` bekliyor |
| Gizlilik sayfasındaki **15 yer tutucu** | Kullanıcı + avukat |
| Gizlilik/destek URL'leri | ✅ `timeflow.lueratech.com` canlı |
| Hesap silme (uygulama içi) | ✅ canlı |

---

## Altyapı borçları

- **GitHub push kilitli** — SSH anahtarı yok, classic PAT ifşa ve geçersiz.
  ~94 commit yalnız yerelde. **Frontend deploy muhtemelen GitHub'dan derliyor**,
  yani yerel commit'ler sahaya ÇIKMIYOR. Kullanıcı bunu bilerek sona bıraktı.
- **VPS kapasitesi** — 2026-09-11'de bellek tükenmesinden dondu, 8 GB takas
  eklendi. `evolution-api` zombi süreç sızdırıyor.
- **Veritabanı yedekleri** — düzenli yedek doğrulanmadı.
- **`git` çalışmıyor** — `sudo xcodebuild -license` gerekiyor.

---

## Core / abonelik borçları (ayrı faz)

- TimeFlow → Core entegrasyonunda 3 eksik (subscription, org sync, API key).
  10. müşteriden önce yapılmalı.
- Dodo webhook susması: sebep bulundu (2026-09-14) — Core'a ulaşılamıyor.
  Ayrı bir oturumda kazılacak.
- Dodo → Core manuel ayna düzeltmesi, TRY fiyatlar, Dodo canlı kip,
  entitlement enforce.

---

## Kapsam dışı bırakılanlar (bilinçli)

| Ne | Neden |
|---|---|
| **Gün sonu özeti bildirimi** | Dış zamanlayıcı gerekiyor; `pg_cron` yok, n8n workflow'u yazılmalı |
| **Sessiz saatler** | Aynı kapsam; `send-push` içinde yapılabilir ama ürün kararı bekliyor |
| **Bildirim makbuzu (receipt) kontrolü** | İkinci bir çağrı + zamanlayıcı ister. `DeviceNotRegistered` zaten anlık bilette geliyor; satır bir olay gecikmeyle kendini iyileştiriyor |
| **Bildirim kuyruğu / yeniden deneme** | Olayların hepsi "şu anda" olayları. Kırk dakika gecikmiş "müşterin geldi", hiç gelmemesinden kötü |
| **Bildirim log tablosu** | Yapılabilecek bir şey olmayan bir başarısızlık listesi üretirdi. Yerine `send-push`'ta tek satırlık yapılandırılmış log var |
| **Personel için olay başına bildirim anahtarı** | Dört olayın hepsi kendi randevusuyla ilgili ve iş. Seçmeli kapatmak personeli kendi gününe karşı körleştirirdi |
| **Rozet (badge)** | "Okundu" kavramı üründe yok; temizlenmeyen sayı yalan olur |
| **Expo `tag` çökertmesi** | Expo Push API'de `tag` alanı YOK. Randevu üç kez ertelenirse kilit ekranında üç bildirim birikir (web'de tek bildirim güncelleniyordu). Kabul edildi; etiket `data.tag`'de taşınıyor, ileride istemci tarafı dedupe yazılabilir |
| **Şube (branch) mimarisi** | 1 şube = 1 org. `branch_id` ödeyen müşteri çıkınca |
| **Dinamik yazı boyutu + açık tema turu** | Sıradan çıkarıldı (2026-09-18), ölçüm yapılmadı |
