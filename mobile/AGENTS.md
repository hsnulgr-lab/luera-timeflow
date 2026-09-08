# Expo — kurulu sürüm SDK 57

Bu proje **Expo SDK 57**'de: `expo ~57.0.20` · `expo-router ~57.0.19` ·
`react-native 0.86.3` · `react 19.2.3` · `react-native-screens ~4.26.0`.

Kod yazmadan önce **kurulu sürümün** dokümanını oku:
https://docs.expo.dev/versions/v57.0.0/

Şüphelenince tek doğru kaynak `mobile/node_modules` içindeki `.d.ts`
dosyalarıdır; doküman değil, **kurulu tipler bağlayıcıdır**. Bu dosya bir
süre v54'ü gösterdi ve arada API'ler yer değiştirdi — örneğin `NativeTabs`'ta
`Icon` ve `Label` artık `NativeTabs.Trigger`'ın altında.

## Hareket

**`react-native-reanimated` 4.5.1 KURULU** (2026-09-05, kullanıcı kararı).
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
