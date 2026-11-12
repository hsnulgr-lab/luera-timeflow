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

## Sürüm yükseltmesi

SDK yükseltmek ayrı bir iştir ve bu dosyayı değiştirmekle olmaz. Yükseltilirse
buradaki sürümler ve bağlantı da güncellenir.
