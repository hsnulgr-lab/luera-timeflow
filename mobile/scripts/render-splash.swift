// Sistem açılış karesini (splash) KODUN KENDİ SAYILARINDAN çizer.
//
//   swift scripts/render-splash.swift
//
// Çıktı: assets/splash-dark.png · assets/splash-light.png (1179 × 2556, @3x
// 393 × 852 pt). Elle çizilmiş bir görsel değil: karşılamanın ilk karesinin
// kopyası. Aşağıdaki her sayı bir kaynağa bağlı — değişirse bu betik yeniden
// çalıştırılır, görüntü elle düzeltilmez.
//
//   zemin, yazı, turuncu        src/theme/tokens.ts · light / dark
//   kor + sis, t = 0            src/lib/lightField.ts · MASSES, fieldPlan
//                               (öteki üç kütle olgunlaşma penceresinde 0)
//   kütle gövdesi               src/components/LightField.tsx · MassBody
//   perde                       src/lib/lightField.ts · veilStops
//   "luera." yeri ve ölçüsü     app/(auth)/welcome.tsx + BrandMark.tsx
//
// iOS açılış karesi STATİK — kod çalışmadan çiziliyor. Karşılama bu kareyi
// devralıp hapı açıyor (`src/lib/splashHandoff.ts`).

import AppKit
import CoreText
import Foundation

let scale: CGFloat = 3
let W: CGFloat = 393, H: CGFloat = 852
// iPhone 14 Pro · 15 · 16 — Dynamic Island'lı 393 pt ailesinin güvenli üstü.
let safeTop: CGFloat = 59

struct Theme {
    let name: String
    let bg: NSColor
    let tx: NSColor
    let dark: Bool
    let veil: [(CGFloat, NSColor)]
}

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: a)
}

let themes = [
    Theme(name: "dark", bg: rgb(0x120E08), tx: rgb(0xF3EDE3), dark: true, veil: [
        (0, rgb(0x120E08, 0.20)), (0.32, rgb(0x120E08, 0.04)),
        (0.68, rgb(0x120E08, 0.18)), (1, rgb(0x120E08, 0.42)),
    ]),
    Theme(name: "light", bg: rgb(0xF3ECE0), tx: rgb(0x0E0E0E), dark: false, veil: [
        (0, rgb(0xFFFDFB, 0.26)), (0.34, rgb(0xFFFDFB, 0.08)),
        (0.70, rgb(0xFFFDFB, 0.30)), (1, rgb(0xFFFDFB, 0.58)),
    ]),
]

struct Mass {
    let color: UInt32
    let size: CGFloat
    let left: CGFloat      // pt, ekranın solundan
    let top: CGFloat       // pt, ekranın üstünden
    let frame: (x: CGFloat, y: CGFloat, scale: CGFloat, opacity: CGFloat)
    let ceiling: CGFloat
}

// Kütlenin t = 0 anı: faz = offset / duration, anahtarlar arası doğrusal.
//   kor  offset 0  / 34 → p 0      → x −4, y 10, ölçek 1, saydamlık .90
//   sis  offset 2  / 19 → p .1053  → ilk iki anahtarın %30,08'i
let sisK: CGFloat = (2.0 / 19.0) / 0.35
let masses = [
    Mass(color: 0xFF4700, size: 440, left: -90, top: 0.44 * H,
         frame: (-4, 10, 1, 0.9), ceiling: 0.74),
    Mass(color: 0xFFD38C, size: 280, left: 0.08 * W, top: 0.08 * H,
         frame: (26 * sisK, 24 * sisK, 1 + 0.28 * sisK, 0.7 + 0.3 * sisK), ceiling: 0.42),
]
// Alanın nefesi t = 0'da en dip noktasında: .94.
let breath: CGFloat = 0.94

func render(_ theme: Theme) throws {
    let pw = Int(W * scale), ph = Int(H * scale)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8,
                              bytesPerRow: 0, space: space,
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
        fatalError("bağlam kurulamadı")
    }
    // Üstten aşağı, pt cinsinden çiz.
    ctx.translateBy(x: 0, y: CGFloat(ph))
    ctx.scaleBy(x: scale, y: -scale)

    ctx.setFillColor(theme.bg.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

    let ceilingScale: CGFloat = theme.dark ? 1 : 0.62
    for m in masses {
        let alpha = m.ceiling * ceilingScale * m.frame.opacity * breath
        let cx = m.left + m.size / 2 + m.frame.x / 100 * m.size
        let cy = m.top + m.size / 2 + m.frame.y / 100 * m.size
        let r = m.size / 2 * m.frame.scale
        let stops: [(CGFloat, CGFloat)] = [(0, 1), (0.30, 0.72), (0.55, 0.30), (0.78, 0)]
        let colors = stops.map { rgb(m.color, $0.1 * alpha).cgColor } as CFArray
        let gradient = CGGradient(colorsSpace: space, colors: colors,
                                  locations: stops.map { $0.0 })!
        ctx.drawRadialGradient(gradient, startCenter: CGPoint(x: cx, y: cy), startRadius: 0,
                               endCenter: CGPoint(x: cx, y: cy), endRadius: r, options: [])
    }

    let veil = CGGradient(colorsSpace: space, colors: theme.veil.map { $0.1.cgColor } as CFArray,
                          locations: theme.veil.map { $0.0 })!
    ctx.drawLinearGradient(veil, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: H), options: [])

    // ── "luera." ────────────────────────────────────────────────────────────
    // Karşılamadaki marka: sol 24, güvenli alanın 44 altı, 44 pt / 900,
    // harf aralığı −0,05 em. Taban çizgisi satır kutusunun dibinden 0,18 em
    // yukarıda (BrandMark · baseline).
    let size: CGFloat = 44
    let fontURL = URL(fileURLWithPath: "node_modules/@expo-google-fonts/hanken-grotesk/900Black/HankenGrotesk_900Black.ttf")
    guard let descs = CTFontManagerCreateFontDescriptorsFromURL(fontURL as CFURL) as? [CTFontDescriptor],
          let desc = descs.first else { fatalError("yazı tipi yok: \(fontURL.path)") }
    let font = CTFontCreateWithFontDescriptor(desc, size, nil)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font, .kern: size * -0.05, .foregroundColor: theme.tx.cgColor,
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: "luera", attributes: attrs))
    let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    let boxBottom = safeTop + 44 + size
    let baseline = boxBottom - size * 0.18

    ctx.saveGState()
    ctx.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
    ctx.textPosition = CGPoint(x: 24, y: baseline)
    CTLineDraw(line, ctx)
    ctx.restoreGState()

    let dot = size * 0.22
    ctx.setFillColor(rgb(0xFF5A1F).cgColor)
    ctx.fillEllipse(in: CGRect(x: 24 + width + size * 0.045, y: baseline - dot, width: dot, height: dot))

    guard let image = ctx.makeImage() else { fatalError("görüntü yok") }
    let rep = NSBitmapImageRep(cgImage: image)
    guard let png = rep.representation(using: .png, properties: [:]) else { fatalError("png yok") }
    try png.write(to: URL(fileURLWithPath: "assets/splash-\(theme.name).png"))
    print("assets/splash-\(theme.name).png  \(pw)×\(ph)")
}

for theme in themes { try render(theme) }
