# Expo — kurulu sürüm SDK 58

Bu proje **Expo SDK 58**'de (2026-11-10'da 57'den yükseltildi): `expo ~58.0.23` ·
`expo-router ~58.0.30` · `react-native 0.88.1` · `react 19.3.0` ·
`react-native-screens ~4.30.1` · `react-native-reanimated 4.7.1`.

Kod yazmadan önce **kurulu sürümün** dokümanını oku:
https://docs.expo.dev/versions/v58.0.0/

SDK 58 ile gelen ve kodu etkileyen üç kural:
- **Ref'ler örnek tipiyle yazılır:** `useRef<TextInputInstance>(null)`,
  `useRef<ScrollViewInstance>(null)`, `useRef<ViewInstance>(null)` (hepsi
  `react-native`'den `type` olarak). `useRef<TextInput>` artık tip hatası
  verir: RN 0.88'in katı tip API'si bileşeni değil örneği istiyor.
- **`beforeRemove` olayı YOK.** Ekran yığından çıkınca bir iş yapılacaksa
  `navigation.addListener('removed', …)` ve abonelik `queueMicrotask` ile
  kaldırılır (örnek: `app/(auth)/manager/bridge.tsx`).
- **Sekmeler `expo-router/native-tabs`'tan** (artık kararlı; eski
  `unstable-native-tabs` yolu kullanılmıyor).

Şüphelenince tek doğru kaynak `mobile/node_modules` içindeki `.d.ts`
dosyalarıdır; doküman değil, **kurulu tipler bağlayıcıdır**. Bu dosya bir
süre v54'ü gösterdi ve arada API'ler yer değiştirdi — örneğin `NativeTabs`'ta
`Icon` ve `Label` artık `NativeTabs.Trigger`'ın altında.

## Hareket

**`react-native-reanimated` KURULU** (2026-09-05 4.5.1 ile girdi, kullanıcı kararı; SDK 58 ile 4.7.1).
Gerekçe: adisyonun kasaya gönderilme anı
(`docs/personel-11-kasaya-gonderme.md`). Yükseklik, genişlik, renk, yarıçap,
gölge, spring zinciri ve düzen geçişleri native sürücüde açık.

Ama **yazılmış ekranlar taşınmıyor.** Kadran, halka, kaydırma çubuğu, para
maskesi, alt sayfalar ve kartlar RN'in kendi `Animated`'iyle çiziliyor ve
öyle kalıyor: çalışan bir animasyonu yeniden yazmanın kazancı yok, riski var.
Testler bunu koruyor. Yeni bir hareket yazarken önce sor — bu ekran zaten
`Animated` kullanıyorsa onunla devam et.

`Animated` tarafında kural aynı: yalnız `opacity`, `translateX/Y`, `scale`,
hepsi `useNativeDriver: true`.

**`react-native-gesture-handler` HÂLÂ YOK ve kurulmayacak.** Jestler
`PanResponder` ile yazılır. `LayoutAnimation` kullanılmıyor. Lottie ve Skia
yok.

`react-hooks/immutability` kuralı reanimated'in `sv.value = ...` yazımını
bilmiyor; kural yalnız o dosyada, gerekçesiyle kapatılır — genel olarak
değil.

## Rota yapısı

Müdür ve personel kabukları **grup değil, gerçek segment**: `app/mudur/` ve
`app/personel/`. Grup olduklarında (`(manager)` / `(staff)`) adrese segment
eklemiyorlardı ve `/calendar`, `/profile`, `/` iki dosyaya birden düşüyordu —
telefonda personel müdüre, müdür personele atlıyordu.

`tests/mobile-rota-cakismasi.test.mjs` iki dosyanın aynı adrese düşmediğini
doğruluyor. Yeni bir grup açıp içine `calendar.tsx` koyarsan orada patlar.

Her iki role de açık ekranlar `app/(ortak)/` altında yaşar; personel
ekranından `(manager-flow)` adresine gidilmez.

## Bekleme sayacı (Live Activity · Dinamik Ada + kilit ekranı)

`expo-widgets` + `@expo/ui` (2026-11-12, 1.0.2). Kumandada "Bekleme kur"
denince iOS'ta Dinamik Ada'da ve kilit ekranında canlı geri sayım açılıyor;
bekleme kalkınca, iş bitince, süre geçip uygulama öne gelince ve çıkışta
(`onTenantReset`) kapanıyor. 1. aşama YEREL: sunucu/APNs itmesi yok.

- **Expo Go'da GÖRÜNMEZ** (ve Android'de yok). Uygulama yine sorunsuz açılır:
  `waitActivityDevice.ts` yerel modülü `requireOptionalNativeModule` ile
  arar, yoksa her şey sessizce boş döner. Denemek için geliştirme derlemesi
  ya da TestFlight gerekir.
- **`expo-widgets`'i ve `@expo/ui`'yi hiçbir dosya `import` etmez** — ikisi
  de modül yüklenirken yerel modülü zorunlu tutuyor, Expo Go'da açılışta
  çöker. Tek giriş `waitActivityDevice.ts`teki korumalı eşzamanlı `require`.
  Dinamik `import()` YASAK. `tests/bekleme-sayaci.test.mjs` bunu koruyor.
- Görünüm `src/lib/waitActivityView.tsx`: `'widget'` yönergeli fonksiyon
  dizeye çevrilip uzantıda çalışıyor — dışarıdaki sabitleri GÖRMEZ, yalnız
  `@expo/ui/swift-ui` bileşenleri/değiştiricileri (adları değiştirmeden).
- Dokununca o işin kumandası: `luera://bekleme?…` → `app/+native-intent.tsx`
  → bildirimle aynı niyet yolu (`pushIntent`).
- app.json'da Live Activity için `widgets[]` girdisi YOK (belge: geçersiz
  hedef üretir). `NSSupportsLiveActivities`'i eklenti kendisi yazıyor.
- **Yeni iOS uzantı hedefi** `ExpoWidgetsTarget`, paket kimliği
  `ai.luera.timeflow.ExpoWidgetsTarget`; **app group**
  `group.ai.luera.timeflow` (ana uygulama + uzantı). İlk EAS derlemesinde
  EAS bu yeni kimlik için provizyon profili oluşturmayı ve App Group
  yeteneğini açmayı sorar — "evet". Dağıtım tabanı 16.4 (ExpoModulesCore'un
  tabanı; Live Activity 16.1+ ister).

## "Müşteri bekliyor" (Live Activity · sunucudan · 1.0.3)

Göç 144 (2026-11-13). Resepsiyon "Geldi" deyince SUNUCU Apple'a doğrudan
itiyor (APNs push-to-start, iOS 17.2+) ve personelin telefonunda kilit
ekranı + Dinamik Ada'da "Ayşe bekliyor · 4:12" açılıyor — uygulama kapalıyken
de. Sayaç geliş anından yukarı sayar (üst uç 2 saat). Plan ve sapmalar:
`docs/dinamik-ada-musteri-bekliyor-plan.md`.

- Bekleme sayacının bütün kuralları geçerli: Expo Go / Android / eski iOS'ta
  görünmez ve sessiz; `expo-widgets` ve `@expo/ui` yalnız görünüm dosyasında
  (`src/lib/arrivalActivityView.tsx`), tek giriş `arrivalActivityDevice.ts`teki
  korumalı eşzamanlı `require`; dinamik `import()` YASAK; kart her zaman koyu,
  yalnız ilk ad, emoji yok. `tests/musteri-bekliyor.test.mjs` koruyor.
- app.json'da `expo-widgets` → `enablePushNotifications: true` (yerel derleme
  ister). Etkinlik adı `MusteriBekliyor` ÜÇ yerde aynı: görünüm,
  `arrivalActivity.ts` ve sunucu `send-live-activity/apns.ts`. Değişirse
  Apple 200 döner ama etkinlik boş kalır.
- Jetonlar `staff-api` üzerinden: `la.register` (başlatma jetonu öne dönüşte,
  `backgroundSync`; etkinlik jetonu eşlenince) ve `la.unregister` (çıkış,
  telefonu işletmeden çıkarma — `unregisterPush` ile aynı sırada). Yalnız
  PERSONEL oturumu; tek kişilik kabukta yok (resepsiyon ile personel aynı kişi).
- iOS uzaktan açılan etkinliğin içeriğini uygulamaya vermiyor. Telefon onu
  Bugün ekranının okunmuş listesiyle eşliyor (`planArrivalActivities`); iki
  müşteri birden bekliyorsa bilinmeyenleri kapatıp yerel açıyor.
- Kapanma: kumandada iş başlayınca hemen (yerel), iptal / gelmedi / geri
  alma / başkasına geçme / silme sunucudan ("end"), ve öne dönüşte mutabakat.
- Dokununca: `luera://bekliyor?id=…&date=…` → `+native-intent.tsx` → o işin
  kumandası (bekleme sayacıyla aynı yol, kumandalar üst üste binmez).
- APNs ortamı telefonun tahmini (`__DEV__` → sandbox); tutmazsa sunucu öteki
  ortamı bir kez deneyip satırı düzeltiyor.

## Sürüm yükseltmesi

SDK yükseltmek ayrı bir iştir ve bu dosyayı değiştirmekle olmaz. Yükseltilirse
buradaki sürümler ve bağlantı da güncellenir.
