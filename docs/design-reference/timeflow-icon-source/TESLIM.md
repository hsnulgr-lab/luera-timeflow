# Luera TimeFlow · uygulama ikonu (T·2b·2 "Tam kaplama")

Final tasarım, keşif sayfasındaki T·2b·2 ile birebir aynı. Harfler Hanken Grotesk 900'den dış hatlara çevrildi.

## iOS (Apple squircle maskesini kendisi uygular)
- icon.png — 1024×1024, RGB, alfa yok, sRGB, köşesiz kare
- icon-dark.png — koyu mod (tasarım zaten koyu, icon.png ile aynı)
- icon-tinted.png — renksiz mod, gri ton

## Android (adaptive icon, başlatıcı daire maskesi uygular)
- android-icon-foreground.png — 512×512; tasarımın tamamı ortadaki 72dp görünür alana yerleşik, kenarlara taşan zemin ve küre dahil
- android-icon-background.png — 512×512, düz #120E08
- android-icon-monochrome.png — 512×512, beyaz + saydam (Android 13+ temalı ikon)
- play-store-512.png — Google Play listeleme ikonu, 512×512, köşesiz kare

## Expo app.json
```json
"ios": { "icon": { "light": "./timeflow-icon/icon.png", "dark": "./timeflow-icon/icon-dark.png", "tinted": "./timeflow-icon/icon-tinted.png" } },
"android": { "adaptiveIcon": {
  "foregroundImage": "./timeflow-icon/android-icon-foreground.png",
  "backgroundImage": "./timeflow-icon/android-icon-background.png",
  "monochromeImage": "./timeflow-icon/android-icon-monochrome.png",
  "backgroundColor": "#120E08" } }
```
