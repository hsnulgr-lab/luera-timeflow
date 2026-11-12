# Dinamik Ada · 2. aşama — "Müşteri bekliyor" (plan, 2026-11-12)

Kod yok. 1. aşama (bekleme geri sayımı, yalnız yerel) ayrı dalda yazılıyor; bu
plan onun `expo-widgets` kurulumunun ÜSTÜNE gelir ve o dal main'e girmeden
başlamaz.

## Ne olacak

Resepsiyon (masaüstü ya da müdür telefonu) bir randevuya **"Geldi"** dediği
anda, o işin personelinin iPhone'unda kilit ekranında ve Dinamik Ada'da:

> **Ayşe bekliyor** · 4:12 · Kesim · 14:30

- Sayaç geliş anından (`customer_arrived_at`) YUKARI sayar; sistem akıtır,
  uygulama kapalıyken de.
- Dokununca o işin kumandası açılır.
- Personel işi başlatınca (kaydır → başlat), randevu iptal olunca, "Gelmedi"
  denince, geliş geri alınınca ya da randevu başka kişiye/güne geçince kapanır.
- Kilit ekranında yalnız İLK AD (mevcut gizlilik kararı).

Bugün aynı anda zaten bir bildirim gidiyor ("Müşterin geldi 👋", göç 118 →
`send-push`). Etkinlik onun YERİNE geçer: etkinlik başlatılan telefona ayrıca
bildirim gitmez (Apple başlatma itmesinde uyarı metnini zorunlu tutuyor; ikisi
birden gitse telefon iki kez çalar).

## İki yol

| Yol | Ne zaman | Gereken |
|---|---|---|
| **A · Yerel** | "Geldi"yi telefonun kendisi yazdıysa ve iş o kişinin (tek kişilik sahip) | Yalnız telefon kodu. Sunucu yok. |
| **B · Uzaktan** | "Geldi" başka cihazdan yazıldıysa (resepsiyon → personel) | Sunucudan Apple'a doğrudan itme (APNs). iOS 17.2+. |

A küçük ve risksiz; B asıl değer.

## B yolunun parçaları

**1. Apple anahtarı (kullanıcı, bir kez).** Apple Developer › Keys'te APNs
yetkili `.p8` anahtarı + Key ID + Team ID. Önce expo.dev › Credentials'a bak:
EAS'in bildirimler için kullandığı anahtar zaten varsa o indirilip kullanılır
(Apple ekip başına sınırlı sayıda APNs anahtarı veriyor). `app_secrets`'e
yazılır (`APPLE_SIGNIN_KEY` ile aynı usul): `APNS_KEY`, `APNS_KEY_ID`,
`APNS_TEAM_ID`.

**2. Telefon.** `expo-widgets` eklentisinde `enablePushNotifications: true`
(yeni yerel derleme ister). Uygulama iki jeton üretir ve sunucuya yollar:
- *başlatma jetonu* (cihaz başına; `addPushToStartTokenListener`) — sunucu
  bununla etkinliği başlatır;
- *etkinlik jetonu* (çalışan her etkinlik için; `getPushToken` /
  `addPushTokenListener`) — sunucu bununla günceller/bitirir.
Kayıt `staff-api` üzerinden (`la.register` / `la.unregister`): personel jetonu
zaten orada doğrulanıyor, tek kişilik sahip de aynı yoldan geçiyor.
Görünüm: `createLiveActivity('MusteriBekliyor', …)`, sayaç
`Text timerInterval countsDown={false}` (üst sınır: geliş + 2 saat).

**3. Veritabanı (göç 144).** `live_activity_tokens`: org, staff_id, device_id,
tür (`start` | `update`), randevu (yalnız `update`), jeton, ortam (`sandbox` |
`production`), tarih. RLS kapalı, yalnız service_role. Temizlik: personel
pasife alınınca (142 tetikleyicisine ek), telefon koparılınca (117), çıkışta.

**4. Sunucu gönderici.** Yeni edge fonksiyonu `send-live-activity` (ya da
`send-push` içinde ayrı dal): ES256 ile imzalı sağlayıcı jetonu (≤50 dk
bellekte), `api.push.apple.com` / `api.sandbox.push.apple.com`'a HTTP/2 POST.
Başlıklar: `apns-push-type: liveactivity`,
`apns-topic: ai.luera.timeflow.push-type.liveactivity`, `apns-priority: 10`.
Apple "geçersiz jeton" derse satır silinir.

**5. Tetikleyici (göç 144, 118'in fonksiyonuna ek).**
- `customer_arrived_at` boşken dolarsa → **başlat** (o personelin başlatma
  jetonlarına). Başlatılan cihaza Expo bildirimi gitmez (device_id eşleşmesi).
- `arrived_at` dolarsa, `status = cancelled`, `no_show_at` dolarsa,
  `customer_arrived_at` boşalırsa, `staff_id` ya da `date` değişirse → **bitir**.
- Personelin bildirim günü/tercihleri (105, 118) ve tek kişilikte "kendine
  bildirim yok" (116) kuralları aynen geçerli; tek kişilikte A yolu çalışır.

## Bilinen tuzaklar (Expo'nun kendi yazısından)

- `content-state` bizim alanlarımız DEĞİL, sarmalayıcı:
  `{ name: 'MusteriBekliyor', props: '<JSON metni>' }`. Yanlış gönderilirse
  Apple 200 döner ve etkinlik sessizce hiç güncellenmez.
- Başlatma itmesinde `attributes-type: "LiveActivityAttributes"`, `attributes`
  ve `alert` ZORUNLU; `alert` yoksa itme kabul edilir ama etkinlik başlamaz.
- Jeton, derlemenin imzalandığı ortama bağlı: geliştirme derlemesi → sandbox,
  TestFlight / mağaza → production. Yanlış sunucuya gidince her istek
  `400 BadDeviceToken`. Ortam jetonla birlikte saklanır.

## Doğrulanması gereken (cihazda, koddan önce bilinemez)

- Uzaktan başlatılan etkinliğin *etkinlik jetonu* uygulama kapalıyken sunucuya
  ulaşıyor mu (iOS 18'de `input-push-token: 1`)? Ulaşmıyorsa uzaktan bitirme
  o telefonda çalışmaz; yedek: başlatma itmesine bayatlama süresi (geliş + 45
  dk) ve uygulama açılınca yerel bitirme. Ana senaryoda personel işi telefondan
  başlattığı için etkinlik zaten yerelde biter.
- iOS 17.2 altı ve Android: etkinlik yok, bugünkü bildirim aynen gider.

## Aşamalar ve süre

1. **A yolu + görünüm** (yarım gün): tek kişilik sahip telefonda "Geldi"
   deyince yerel başlat; işi başlatınca bitir.
2. **B yolu** (2–3 gün): göç 144, jeton kaydı, gönderici, tetikleyici, testler
   (PGlite göç regresyonu; gönderici gövdesi ve imza için birim testleri).
3. **Cihaz turu** (yarım gün, kullanıcıyla): geliştirme derlemesi (sandbox) →
   TestFlight (production).

## Yayın önerisi

1.0.2 zaten büyük (SDK 58 + denetim + hız + bekleme sayacı). "Müşteri bekliyor"
**1.0.3**'e: sunucu tarafı 1.0.2 çıkarken hazırlanıp canlıya alınabilir
(jetonu olmayan telefonu etkilemez), telefon tarafı 1.0.3 derlemesiyle gelir.

## Aynı altyapıyla sonradan gelenler

- Bekleme süresi dolunca etkinliğin kendiliğinden "Bekleme bitti"ye dönüp
  kalkması (bugün uygulama açılınca kalkıyor).
- Beklemenin başka cihazdan kurulması/kaldırılması.

Kaynaklar: Expo Widgets SDK 58 belgesi
(https://docs.expo.dev/versions/v58.0.0/sdk/widgets/), Expo "Live Activities
with Expo: end to end" yazısı
(https://expo.dev/blog/live-activities-with-expo-end-to-end-client-and-backend).
