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

## Sürüm yükseltmesi

SDK yükseltmek ayrı bir iştir ve bu dosyayı değiştirmekle olmaz. Yükseltilirse
buradaki sürümler ve bağlantı da güncellenir.
