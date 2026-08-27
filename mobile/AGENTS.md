# Expo — kurulu sürüm SDK 54

Bu proje **Expo SDK 54**'te: `expo ~54.0.36` · `expo-router ~6.0.24` ·
`react-native 0.81.5` · `react-native-screens ~4.16.0`.

Kod yazmadan önce **kurulu sürümün** dokümanını oku:
https://docs.expo.dev/versions/v54.0.0/

Daha yeni sürümün dokümanına bakma. Bu dosya bir süre v57'yi gösteriyordu ve
orada olup burada OLMAYAN API'ler var — örneğin `NativeTabs`'ın
`screenListeners`'ı ve `NativeTabs.Trigger`'ın `disabled`'ı SDK 54'te yok.
Şüphelenince tek doğru kaynak `mobile/node_modules` içindeki `.d.ts`
dosyalarıdır; doküman değil, kurulu tipler bağlayıcıdır.

## Kurulmayacak paketler

`react-native-reanimated` ve `react-native-gesture-handler` bu projede **yok
ve kurulmayacak**. Hareket RN'in kendi `Animated`'i ve `PanResponder` ile
yazılır; yalnız `opacity`, `translateX/Y`, `scale` animasyonlanır ve hepsi
`useNativeDriver: true` ile çalışır.

## Sürüm yükseltmesi

SDK yükseltmek ayrı bir iştir ve bu dosyayı değiştirmekle olmaz. Yükseltilirse
buradaki sürümler ve bağlantı da güncellenir.
