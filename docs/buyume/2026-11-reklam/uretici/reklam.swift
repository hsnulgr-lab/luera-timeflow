// 2026-11 · TimeFlow REKLAM kreatifleri üreticisi (13 Kasım Reels üreticisinden türedi).
// Kredisiz: yalnız gerçek uygulama ekranları + sistemin gerçek WhatsApp kalıpları.
//
//   swiftc -O reklam.swift -o /tmp/reklam && /tmp/reklam video   → A1 · B1 · D1 (9:16, sesli)
//   /tmp/reklam gorsel                                           → G1–G4 (4:5) + K1 karusel (4:5 × 6)
//   /tmp/reklam kare                                             → video kontrol kareleri
//
// Eski başlık:
//
// Çalıştırma:
//   swiftc -O reels.swift -o /tmp/reels && /tmp/reels            → üç video
//   /tmp/reels kare                                               → kontrol kareleri (PNG)
//
// Ses: ses/X.mp3 (ElevenLabs) varsa o, yoksa ses/X.aiff (Yelda, geçici).
// Sahne süreleri seslendirmenin cümle uzunluklarına göre bölünür; ses değişince
// video kendiliğinden yeniden zamanlanır.
//
// Marka: koyu #0E0A06 zemin, krem #F3EDE3 yazı, düz turuncu nokta #FF5A1F
// (parlama/gradyan YOK), Hanken Grotesk. Ekranlar Demo Salon'un gerçek
// uygulama görüntüleri (site/assets). WhatsApp balonları sistemin gerçek
// hatırlatma kalıpları (supabase/functions/_shared/booking/messages.ts).

import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

var W = 1080, H = 1920
let FPS: Int32 = 30
let ROOT = "/Users/furkanulger/Projects/luera-timeflow"
let REELS = ROOT + "/docs/buyume/reels-2026-11-13"          // ses + WhatsApp dokusu oradan
// Çıktı: bu dosyanın iki üst klasörü (docs/buyume/2026-11-reklam) /kreatif
let OUT = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("kreatif").path
let ASSETS = ROOT + "/site/assets"
let FONTDIR = ROOT + "/mobile/node_modules/@expo-google-fonts/hanken-grotesk"
let TAIL: Double = 1.0   // ses bittikten sonra son kare

// ── Yazı tipi ──────────────────────────────────────────────────────────────
for w in ["500Medium/HankenGrotesk_500Medium", "600SemiBold/HankenGrotesk_600SemiBold",
          "700Bold/HankenGrotesk_700Bold", "800ExtraBold/HankenGrotesk_800ExtraBold",
          "900Black/HankenGrotesk_900Black"] {
    CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: "\(FONTDIR)/\(w).ttf") as CFURL, .process, nil)
}
func font(_ weight: Int, _ size: CGFloat) -> CTFont {
    let name: String
    switch weight {
    case 500: name = "HankenGrotesk-Medium"
    case 600: name = "HankenGrotesk-SemiBold"
    case 700: name = "HankenGrotesk-Bold"
    case 800: name = "HankenGrotesk-ExtraBold"
    default: name = "HankenGrotesk-Black"
    }
    return CTFontCreateWithName(name as CFString, size, nil)
}

// ── Renk ───────────────────────────────────────────────────────────────────
func rgb(_ hex: Int, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: a)
}
let BG = rgb(0x0E0A06), INK = rgb(0xF3EDE3), MUTED = rgb(0xF3EDE3, 0.62), DIM = rgb(0xF3EDE3, 0.38)
let OR = rgb(0xFF5A1F), CARD = rgb(0x1E1812), LINE = rgb(0xF3EDE3, 0.10)
let WA_IN = rgb(0x202C33), WA_OUT = rgb(0x005C4B), WA_BG = rgb(0x0B141A), WA_GREEN = rgb(0x25D366)

// ── Zaman ──────────────────────────────────────────────────────────────────
func clamp(_ x: Double, _ a: Double = 0, _ b: Double = 1) -> Double { min(b, max(a, x)) }
func easeOut(_ x: Double) -> Double { let t = clamp(x); return 1 - pow(1 - t, 3) }
/// t anında, `at`ta başlayan `d` süreli girişin ilerlemesi (0…1).
func enter(_ t: Double, _ at: Double, _ d: Double = 0.45) -> Double { easeOut((t - at) / d) }

// ── Çizim yardımcıları (y YUKARIDAN ölçülür) ──────────────────────────────
func cg(_ top: CGFloat, _ h: CGFloat) -> CGFloat { CGFloat(H) - top - h }

func pStyle(_ align: CTTextAlignment, _ lineMult: CGFloat) -> CTParagraphStyle {
    var a = align
    var m = lineMult
    return withUnsafeBytes(of: &a) { ap in
        withUnsafeBytes(of: &m) { mp in
            let s = [
                CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: ap.baseAddress!),
                CTParagraphStyleSetting(spec: .lineHeightMultiple, valueSize: MemoryLayout<CGFloat>.size, value: mp.baseAddress!),
            ]
            return CTParagraphStyleCreate(s, s.count)
        }
    }
}

typealias Run = (String, CTFont, CGColor)

func attributed(_ runs: [Run], align: CTTextAlignment, lineMult: CGFloat, kern: CGFloat) -> NSAttributedString {
    let out = NSMutableAttributedString()
    let style = pStyle(align, lineMult)
    for (s, f, c) in runs {
        out.append(NSAttributedString(string: s, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): f,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): c,
            NSAttributedString.Key(kCTParagraphStyleAttributeName as String): style,
            NSAttributedString.Key(kCTKernAttributeName as String): kern,
        ]))
    }
    return out
}

/// Metni (x, top, width) kutusuna çizer; yüksekliği döner.
@discardableResult
func text(_ ctx: CGContext, _ runs: [Run], x: CGFloat, top: CGFloat, width: CGFloat,
          align: CTTextAlignment = .center, lineMult: CGFloat = 1.0, kern: CGFloat = 0,
          alpha: CGFloat = 1, dy: CGFloat = 0) -> CGFloat {
    let a = attributed(runs, align: align, lineMult: lineMult, kern: kern)
    let fs = CTFramesetterCreateWithAttributedString(a)
    let size = CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(location: 0, length: 0), nil,
                                                           CGSize(width: width, height: 10_000), nil)
    let h = ceil(size.height) + 4
    if alpha > 0.001 {
        ctx.saveGState()
        // Tam görünürken saydamlık DEĞİŞTİRİLMEZ: içinde bulunduğu öğenin (hap,
        // balon, düğme) solmasını devralsın. Eskiden üzerine yazıyordu; hap
        // solarak gelirken yazısı baştan tam görünüyordu.
        if alpha < 0.999 { ctx.setAlpha(alpha) }
        ctx.textMatrix = .identity
        let path = CGPath(rect: CGRect(x: x, y: cg(top + dy, h), width: width, height: h), transform: nil)
        let frame = CTFramesetterCreateFrame(fs, CFRange(location: 0, length: 0), path, nil)
        CTFrameDraw(frame, ctx)
        ctx.restoreGState()
    }
    return h
}

func measure(_ runs: [Run], width: CGFloat, lineMult: CGFloat = 1.0, kern: CGFloat = 0) -> CGSize {
    let a = attributed(runs, align: .left, lineMult: lineMult, kern: kern)
    let fs = CTFramesetterCreateWithAttributedString(a)
    return CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(location: 0, length: 0), nil,
                                                        CGSize(width: width, height: 10_000), nil)
}

func roundRect(_ ctx: CGContext, x: CGFloat, top: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat,
               fill: CGColor? = nil, stroke: CGColor? = nil, lw: CGFloat = 2) {
    let rect = CGRect(x: x, y: cg(top, h), width: w, height: h)
    let p = CGPath(roundedRect: rect, cornerWidth: min(r, h / 2), cornerHeight: min(r, h / 2), transform: nil)
    if let f = fill { ctx.addPath(p); ctx.setFillColor(f); ctx.fillPath() }
    if let s = stroke { ctx.addPath(p); ctx.setStrokeColor(s); ctx.setLineWidth(lw); ctx.strokePath() }
}

func dot(_ ctx: CGContext, cx: CGFloat, cy: CGFloat, r: CGFloat, color: CGColor = OR) {
    ctx.setFillColor(color)
    ctx.fillEllipse(in: CGRect(x: cx - r, y: CGFloat(H) - cy - r, width: r * 2, height: r * 2))
}

func loadImage(_ path: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}

// ── Ortak parçalar ─────────────────────────────────────────────────────────
var BRAND_TOP: CGFloat = 206   // görsellerde (4:5) yukarı alınır
let X0: CGFloat = 90                      // yatay kenar boşluğu
let TW = CGFloat(W) - 2 * X0              // yazı genişliği

/// Üstte logo: "luera" + turuncu "timeflow" hapı — uygulamanın kendi logosu
/// (src/pages/login/parcalar.tsx · Brand, ölçüler giris.css .lg-brand/.lg-tf'den:
/// Hanken 900, -0.05em; hap 0.3em, yükseklik 1.6em, iç boşluk 0.62em, sol 0.14em).
func brand(_ ctx: CGContext, alpha: CGFloat) {
    let S: CGFloat = 64
    let fl = font(900, S), fp = font(800, S * 0.3)
    let kern = -0.05 * S
    let wl = measure([("luera", fl, INK)], width: 800, kern: kern).width
    let tw = measure([("timeflow", fp, INK)], width: 400, kern: -0.01 * S * 0.3).width
    let pad = 0.62 * S * 0.3, ph = 1.6 * S * 0.3, ml = 0.14 * S
    let pw = tw + 2 * pad
    let x = (CGFloat(W) - (wl + ml + pw)) / 2
    let top: CGFloat = BRAND_TOP
    text(ctx, [("luera", fl, INK)], x: x, top: top, width: wl + 24, align: .left, kern: kern, alpha: alpha)
    let base = top + CTFontGetAscent(fl)
    let pTop = base - ph + 0.2 * S * 0.3
    ctx.saveGState(); ctx.setAlpha(alpha)
    roundRect(ctx, x: x + wl + ml, top: pTop, w: pw, h: ph, r: ph / 2, fill: OR)
    let th = CTFontGetAscent(fp) + CTFontGetDescent(fp)
    text(ctx, [("timeflow", fp, rgb(0xFFFFFF))], x: x + wl + ml, top: pTop + (ph - th) / 2 - 1, width: pw,
         kern: -0.01 * S * 0.3)
    ctx.restoreGState()
}

/// Satır satır yükselen büyük başlık. lines: her satır bir run dizisi.
func headline(_ ctx: CGContext, _ lines: [[Run]], top: CGFloat, t: Double, at: Double = 0.05,
              stagger: Double = 0.12, lineGap: CGFloat = 0, alpha: CGFloat = 1) -> CGFloat {
    var y = top
    for (i, line) in lines.enumerated() {
        let p = enter(t, at + Double(i) * stagger, 0.5)
        let h = text(ctx, line, x: X0, top: y, width: TW, lineMult: 0.95, kern: -2,
                     alpha: alpha * CGFloat(p), dy: CGFloat(1 - p) * 40)
        y += h + lineGap
    }
    return y
}

/// Telefon çerçevesi + içinde kaydırılan ekran görüntüsü.
struct Phone {
    let img: CGImage
    var x: CGFloat = 165, top: CGFloat = 560, w: CGFloat = 750, h: CGFloat = 1060
    var k: CGFloat { (w - 28) / CGFloat(img.width) }               // ekran px → çizim px
    /// Görüntünün altı pencereye oturduğunda kaydırma (orijinal px); ötesi boş gri alan bırakır.
    var maxScroll: CGFloat { max(0, (CGFloat(img.height) * k - (h - 28)) / k) }
    /// scroll: görüntünün ÜST kenarından kaç orijinal px aşağısı pencerenin tepesinde.
    func draw(_ ctx: CGContext, scroll: CGFloat, alpha: CGFloat, dy: CGFloat = 0) {
        ctx.saveGState(); ctx.setAlpha(alpha)
        roundRect(ctx, x: x, top: top + dy, w: w, h: h, r: 96, fill: rgb(0x2A221A), stroke: rgb(0xF3EDE3, 0.16), lw: 3)
        let ix = x + 14, itop = top + dy + 14, iw = w - 28, ih = h - 28
        let inner = CGRect(x: ix, y: cg(itop, ih), width: iw, height: ih)
        ctx.addPath(CGPath(roundedRect: inner, cornerWidth: 82, cornerHeight: 82, transform: nil))
        ctx.clip()
        let dh = CGFloat(img.height) * k
        ctx.interpolationQuality = .high
        ctx.draw(img, in: CGRect(x: ix, y: inner.maxY + scroll * k - dh, width: iw, height: dh))
        ctx.restoreGState()
    }
    /// Görüntüdeki bir bölgeyi (orijinal px, yukarıdan) turuncu çerçeveyle işaretler.
    func mark(_ ctx: CGContext, region: CGRect, scroll: CGFloat, alpha: CGFloat, dy: CGFloat = 0) {
        let ix = x + 14, itop = top + dy + 14
        let rx = ix + region.minX * k - 8, rtop = itop + (region.minY - scroll) * k - 8
        ctx.saveGState(); ctx.setAlpha(alpha)
        roundRect(ctx, x: rx, top: rtop, w: region.width * k + 16, h: region.height * k + 16, r: 44, stroke: OR, lw: 6)
        ctx.restoreGState()
    }
}

/// Yuvarlak kenarlı küçük etiket (çip).
func chip(_ ctx: CGContext, _ s: String, cx: CGFloat, top: CGFloat, alpha: CGFloat, dy: CGFloat = 0,
          accent: Bool = false, size: CGFloat = 40) {
    let f = font(700, size)
    let m = measure([(s, f, INK)], width: 900)
    let w = m.width + 64, h = size * 1.9
    ctx.saveGState(); ctx.setAlpha(alpha)
    roundRect(ctx, x: cx - w / 2, top: top + dy, w: w, h: h, r: h / 2,
              fill: accent ? OR : CARD, stroke: accent ? nil : rgb(0xF3EDE3, 0.14), lw: 2)
    text(ctx, [(s, f, accent ? rgb(0x120E08) : INK)], x: cx - w / 2, top: top + dy + (h - m.height) / 2 - 2,
         width: w, alpha: 1)
    ctx.restoreGState()
}

/// Yan yana haplar, grup olarak ortalanır; her hap kendi anında girer.
func pillRow(_ ctx: CGContext, _ items: [String], top: CGFloat, size: CGFloat, alphas: [Double], a: CGFloat) {
    let f = font(700, size), gap: CGFloat = 22
    let ws = items.map { measure([($0, f, INK)], width: 900).width + 64 }
    var x = (CGFloat(W) - ws.reduce(0, +) - gap * CGFloat(items.count - 1)) / 2
    for (i, s) in items.enumerated() {
        let k = alphas[i]
        chip(ctx, s, cx: x + ws[i] / 2, top: top, alpha: a * CGFloat(k), dy: CGFloat(1 - k) * 20, size: size)
        x += ws[i] + gap
    }
}

/// Son kart: Ankara teklifi + "Bize mesaj atın". ctaAt: CTA'nın göründüğü yerel saniye.
// Reklam güvenli alanı: Reels'te alttaki ~%35 (1248 px altı) Instagram yazı/düğmesiyle örtülür;
// düğme onun üstünde biter.
func offerCard(_ ctx: CGContext, t: Double, ctaAt: Double, alpha: CGFloat) {
    let k1 = enter(t, 0.0), k2 = enter(t, 0.15), k3 = enter(t, 0.35), k4 = enter(t, ctaAt, 0.5)
    text(ctx, [("ANKARA'YA ÖZEL", font(800, 40), OR)], x: X0, top: 360, width: TW, kern: 6,
         alpha: alpha * CGFloat(k1), dy: CGFloat(1 - k1) * 20)
    text(ctx, [("7 gün\nücretsiz", font(900, 168), INK)], x: X0, top: 450, width: TW, lineMult: 0.9, kern: -6,
         alpha: alpha * CGFloat(k2), dy: CGFloat(1 - k2) * 40)
    text(ctx, [("İlk 2 ay ", font(800, 76), INK), ("%50 indirim", font(900, 76), OR)], x: X0, top: 865,
         width: TW, kern: -2, alpha: alpha * CGFloat(k3), dy: CGFloat(1 - k3) * 30)
    text(ctx, [("Güzellik salonu · Nail bar · Epilasyon · Kuaför", font(600, 36), MUTED)], x: X0, top: 980,
         width: TW, alpha: alpha * CGFloat(k3))
    // CTA: hap + hafif nabız.
    let pulse = 1 + 0.025 * sin(max(0, t - ctaAt) * 5.5)
    let cw: CGFloat = 720 * CGFloat(pulse), ch: CGFloat = 132 * CGFloat(pulse)
    let ctop: CGFloat = 1090 + CGFloat(1 - k4) * 40
    ctx.saveGState(); ctx.setAlpha(alpha * CGFloat(k4))
    roundRect(ctx, x: (CGFloat(W) - cw) / 2, top: ctop, w: cw, h: ch, r: ch / 2, fill: WA_GREEN)
    text(ctx, [("WhatsApp'tan yazın  →", font(800, 54), rgb(0x0B141A))], x: 0, top: ctop + (ch - 70) / 2,
         width: CGFloat(W), kern: -1)
    ctx.restoreGState()
    text(ctx, [("Aylık paketlerde · 31 Aralık 2026'ya kadar", font(600, 34), DIM)], x: X0 - 40, top: 1250,
         width: TW + 80, alpha: alpha * CGFloat(k4))
    text(ctx, [("Kurulumu birlikte yapıyoruz", font(700, 38), MUTED)], x: X0 - 40, top: 1305,
         width: TW + 80, alpha: alpha * CGFloat(k4))
}

// ── WhatsApp sohbeti (gerçek hatırlatma kalıpları) ─────────────────────────
func bubble(_ ctx: CGContext, _ runs: [Run], right: Bool, top: CGFloat, x0: CGFloat, maxW: CGFloat,
            alpha: CGFloat, dy: CGFloat, time: String) -> CGFloat {
    let m = measure(runs, width: maxW - 56, lineMult: 1.08)
    let w = min(maxW, m.width + 60), h = m.height + 74
    let x = right ? x0 + maxW + 40 - w : x0
    ctx.saveGState(); ctx.setAlpha(alpha)
    roundRect(ctx, x: x, top: top + dy, w: w, h: h, r: 28, fill: right ? WA_OUT : WA_IN)
    text(ctx, runs, x: x + 28, top: top + dy + 22, width: w - 50, align: .left, lineMult: 1.08)
    text(ctx, [(time, font(500, 24), rgb(0xFFFFFF, 0.55))], x: x, top: top + dy + h - 40, width: w - 24, align: .right)
    ctx.restoreGState()
    return h
}

func chatPanel(_ ctx: CGContext, t: Double, dur: Double, alpha: CGFloat) {
    let px: CGFloat = 120, ptop: CGFloat = 540, pw: CGFloat = 840, ph: CGFloat = 1090
    ctx.saveGState(); ctx.setAlpha(alpha)
    roundRect(ctx, x: px, top: ptop, w: pw, h: ph, r: 56, fill: WA_BG, stroke: rgb(0xF3EDE3, 0.12), lw: 2)
    // Üst çubuk: salonun hattı.
    roundRect(ctx, x: px, top: ptop, w: pw, h: 120, r: 56, fill: rgb(0x1F2C34))
    ctx.setFillColor(rgb(0x1F2C34)); ctx.fill(CGRect(x: px, y: cg(ptop + 60, 60), width: pw, height: 60))
    dot(ctx, cx: px + 74, cy: ptop + 60, r: 30, color: rgb(0x3B4A54))
    text(ctx, [("Sizin Salonunuz", font(700, 36), INK)], x: px + 124, top: ptop + 24, width: 600, align: .left)
    text(ctx, [("işletme hattı · WhatsApp", font(500, 26), rgb(0xF3EDE3, 0.55))], x: px + 124, top: ptop + 68,
         width: 600, align: .left)
    ctx.restoreGState()

    let b = font(700, 28), r = font(500, 28), bx = px + 34, bw: CGFloat = 640
    let wh = rgb(0xE9EDEF)
    // 1 · Bir gün önce (reminder24h).
    let k1 = enter(t, 0.15, 0.5)
    text(ctx, [("1 GÜN ÖNCE", font(800, 26), OR)], x: bx, top: ptop + 150, width: 400, align: .left, kern: 3,
         alpha: alpha * CGFloat(k1))
    let h1 = bubble(ctx, [
        ("Merhaba Yasemin Hanım ✨\n", r, wh), ("Sizin Salonunuz", b, wh), (" olarak randevunuzu hatırlatmak istedik.\n\n", r, wh),
        ("Hizmet: ", b, wh), ("Ağda\n", r, wh), ("Tarih: ", b, wh), ("Yarın, 14 Kasım Cuma\n", r, wh),
        ("Saat: ", b, wh), ("14:30\n\n", r, wh),
        ("Gelebilecek misiniz? ", r, wh), ("Evet", b, wh), (" ya da ", r, wh), ("Hayır", b, wh), (" yazmanız yeterli.", r, wh),
    ], right: false, top: ptop + 192, x0: bx, maxW: bw, alpha: alpha * CGFloat(k1), dy: CGFloat(1 - k1) * 30, time: "14:30")
    // Müşterinin cevabı.
    let k2 = enter(t, dur * 0.36, 0.4)
    let rtop = ptop + 192 + h1 + 18
    let h2 = bubble(ctx, [("Evet, geliyorum", r, wh)], right: true, top: rtop, x0: bx, maxW: bw,
                    alpha: alpha * CGFloat(k2), dy: CGFloat(1 - k2) * 20, time: "14:41")
    // 2 · İki saat önce (reminder2h).
    let k3 = enter(t, dur * 0.55, 0.5)
    let ttop = rtop + h2 + 26
    text(ctx, [("2 SAAT ÖNCE", font(800, 26), OR)], x: bx, top: ttop, width: 400, align: .left, kern: 3,
         alpha: alpha * CGFloat(k3))
    _ = bubble(ctx, [
        ("Merhaba Yasemin Hanım ✨\nRandevunuza 2 saat kaldı.\n\n", r, wh),
        ("Hizmet: ", b, wh), ("Ağda  ", r, wh), ("Saat: ", b, wh), ("14:30", r, wh),
    ], right: false, top: ttop + 42, x0: bx, maxW: bw, alpha: alpha * CGFloat(k3), dy: CGFloat(1 - k3) * 30, time: "12:30")
}

// ── Sahneler ───────────────────────────────────────────────────────────────
typealias Draw = (CGContext, Double, Double, CGFloat) -> Void   // ctx, yerel t, süre, alfa
struct Scene { let line: String; let draw: Draw; var last = false; var cut = false }

let akis = loadImage("\(ASSETS)/takvim.png")    // müdür Akış: personel halkaları + UZUN BEKLİYOR
let kasa = loadImage("\(ASSETS)/kasa.png")      // Akış: SÜRÜYOR + KASAYA HAZIR
let bugun = loadImage("\(ASSETS)/akis.png")     // personel "Bugün"

func hookScene(_ lines: [[Run]], top: CGFloat = 640) -> Draw {
    { ctx, t, _, a in _ = headline(ctx, lines, top: top, t: t, alpha: a) }
}

func phoneScene(_ img: CGImage, title: [[Run]], from: CGFloat, to: CGFloat, mark: CGRect? = nil,
                markAt: Double = 0.45, pills: [[String]] = [], phoneTop: CGFloat = 560, pillAt: [Double]? = nil) -> Draw {
    { ctx, t, d, a in
        var y = headline(ctx, title, top: 320, t: t, alpha: a) + 12
        // Haplar başlığın altında, sesle birlikte sırayla.
        var n = 0
        let total = Double(pills.reduce(0) { $0 + $1.count })
        for row in pills {
            let alphas = row.indices.map { i in enter(t, pillAt?[n + i] ?? d * (0.08 + 0.62 * Double(n + i) / max(total, 1)), 0.4) }
            pillRow(ctx, row, top: y, size: 32, alphas: alphas, a: a)
            n += row.count
            y += 32 * 1.9 + 16
        }
        var p = Phone(img: img)
        p.top = phoneTop
        p.h = 1620 - phoneTop
        let kin = enter(t, 0.1, 0.6)
        let s = min(p.maxScroll, from + (to - from) * CGFloat(easeOut(t / max(d, 0.1))))
        p.draw(ctx, scroll: s, alpha: a * CGFloat(kin), dy: CGFloat(1 - kin) * 80)
        if let m = mark {
            let km = enter(t, d * markAt, 0.4)
            p.mark(ctx, region: m, scroll: s, alpha: a * CGFloat(km))
        }
    }
}

let H1 = font(900, 112), H2 = font(900, 96), H3 = font(800, 72)

// ── WhatsApp, gerçek görünüm (kullanıcının ekran görüntülerinden ölçüldü) ──
// Gelen balon #242625, giden #134D37, zemin #0A0A0A + WhatsApp karanlık duvar
// kâğıdı dokusu (gorsel/wa-zemin.png, ekran görüntüsünün boş köşesi). Metinler
// sistemin gerçek kalıpları; isimler demo (Ayşe Hanım · Sizin Salonunuz · Elif Demir).
let WA2_BG = rgb(0x0A0A0A), WA2_IN = rgb(0x242625), WA2_OUT = rgb(0x134D37), WA2_BAR = rgb(0x131313)
let WA2_TXT = rgb(0xEDEDED), WA2_TIME = rgb(0x8E9190), WA2_TICK = rgb(0x53BDEB), WA2_CHIP = rgb(0x1C1C1C)
let RED = rgb(0xFF4D3D), OKG = rgb(0x3CCB7F)
let waTile = loadImage("\(REELS)/gorsel/wa-zemin.png")
func sf(_ bold: Bool, _ size: CGFloat) -> CTFont {
    CTFontCreateUIFontForLanguage(bold ? .emphasizedSystem : .system, size, nil)!
}
let WR = sf(false, 33), WB = sf(true, 33)

enum WAItem {
    case msg(runs: [Run], incoming: Bool, time: String, label: String?)
    case chip(String)
}
struct WAEntry { let item: WAItem; let at: Double }

func waGeom(_ item: WAItem, maxW: CGFloat) -> (w: CGFloat, h: CGFloat, textH: CGFloat, inline: Bool, labelH: CGFloat) {
    switch item {
    case .chip: return (0, 56, 0, false, 0)
    case let .msg(runs, incoming, _, label):
        let m = measure(runs, width: maxW - 52, lineMult: 1.05)
        let labelH: CGFloat = label == nil ? 0 : 44
        let single = m.height < 33 * 1.7
        let stampW: CGFloat = incoming ? 104 : 150      // saat (+ giden mesajda ✓✓) yazıya binmesin
        if single && m.width + stampW + 52 < maxW {
            return (m.width + 52 + stampW, m.height + 30 + labelH, m.height, true, labelH)
        }
        return (min(maxW, max(m.width, 160) + 52), m.height + 66 + labelH, m.height, false, labelH)
    }
}

func waDraw(_ ctx: CGContext, _ item: WAItem, top: CGFloat, ix: CGFloat, iw: CGFloat, alpha: CGFloat) {
    let maxW = iw * 0.76
    let g = waGeom(item, maxW: maxW)
    ctx.saveGState(); ctx.setAlpha(alpha)
    switch item {
    case let .chip(s):
        let f = sf(true, 26), m = measure([(s, f, WA2_TXT)], width: 400)
        let w = m.width + 44
        roundRect(ctx, x: ix + (iw - w) / 2, top: top, w: w, h: 50, r: 25, fill: WA2_CHIP)
        text(ctx, [(s, f, WA2_TXT)], x: ix, top: top + (50 - m.height) / 2 - 1, width: iw)
    case let .msg(runs, incoming, time, label):
        let bx = incoming ? ix + 30 : ix + iw - 30 - g.w
        if let l = label {
            text(ctx, [(l, font(800, 24), OR)], x: bx + 6, top: top, width: 600, align: .left, kern: 2.5)
        }
        let bt = top + g.labelH, bh = g.h - g.labelH
        roundRect(ctx, x: bx, top: bt, w: g.w, h: bh, r: 30, fill: incoming ? WA2_IN : WA2_OUT)
        text(ctx, runs, x: bx + 26, top: bt + 15, width: g.w - 40, align: .left, lineMult: 1.05)
        let tf = sf(false, 23)
        let stamp: [Run] = incoming ? [(time, tf, WA2_TIME)] : [(time + " ", tf, rgb(0xFFFFFF, 0.6)), ("✓✓", sf(true, 23), WA2_TICK)]
        text(ctx, stamp, x: bx, top: bt + bh - 38, width: g.w - 22, align: .right)
    }
    ctx.restoreGState()
}

/// Telefonda WhatsApp sohbeti. Yeni mesaj alttan girer, eskileri yukarı iter.
func waChat(_ ctx: CGContext, _ entries: [WAEntry], t: Double, clock: String, alpha: CGFloat,
            zoom: CGFloat = 1, enterDy: CGFloat = 0) {
    let px: CGFloat = 50, ptop: CGFloat = 400, pw: CGFloat = 980, ph: CGFloat = 1240
    ctx.saveGState(); ctx.setAlpha(alpha)
    let cx = px + pw / 2, cy = CGFloat(H) - ptop   // yaklaşma telefonun üst kenarından: yazının üstüne binmez
    ctx.translateBy(x: cx, y: cy); ctx.scaleBy(x: zoom, y: zoom); ctx.translateBy(x: -cx, y: -cy)
    ctx.translateBy(x: 0, y: -enterDy)
    roundRect(ctx, x: px, top: ptop, w: pw, h: ph, r: 104, fill: rgb(0x2A221A), stroke: rgb(0xF3EDE3, 0.16), lw: 3)
    let ix = px + 14, it = ptop + 14, iw = pw - 28, ih = ph - 28
    let inner = CGRect(x: ix, y: cg(it, ih), width: iw, height: ih)
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: inner, cornerWidth: 90, cornerHeight: 90, transform: nil)); ctx.clip()
    ctx.setFillColor(WA2_BG); ctx.fill(inner)
    let tw = CGFloat(waTile.width) * 1.06, th = CGFloat(waTile.height) * 1.06
    var yy = inner.minY
    while yy < inner.maxY {
        var xx = inner.minX
        while xx < inner.maxX { ctx.draw(waTile, in: CGRect(x: xx, y: yy, width: tw, height: th)); xx += tw }
        yy += th
    }
    // Mesajlar: en yeniden yukarı doğru.
    let contentBottom = it + ih - 140
    ctx.saveGState()
    ctx.clip(to: CGRect(x: ix, y: cg(it + 250, contentBottom - it - 250), width: iw, height: contentBottom - it - 250))
    var y = contentBottom - 16
    for e in entries.reversed() where t >= e.at {
        let p = enter(t, e.at, 0.38)
        let g = waGeom(e.item, maxW: iw * 0.76)
        if y < it - 400 { break }
        waDraw(ctx, e.item, top: y - g.h + CGFloat(1 - p) * 40, ix: ix, iw: iw, alpha: CGFloat(p))
        y -= (g.h + 14) * CGFloat(p)
    }
    ctx.restoreGState()
    // Üst: durum çubuğu + sohbet başlığı.
    ctx.setFillColor(WA2_BAR); ctx.fill(CGRect(x: ix, y: cg(it, 250), width: iw, height: 250))
    text(ctx, [(clock, sf(true, 36), WA2_TXT)], x: ix + 92, top: it + 40, width: 200, align: .left)
    roundRect(ctx, x: ix + iw - 150, top: it + 48, w: 62, h: 28, r: 9, stroke: rgb(0xEDEDED, 0.8), lw: 2.5)
    roundRect(ctx, x: ix + iw - 146, top: it + 52, w: 46, h: 20, r: 6, fill: WA2_TXT)
    text(ctx, [("‹", sf(false, 84), WA2_TXT)], x: ix + 34, top: it + 118, width: 60, align: .left)
    dot(ctx, cx: ix + 152, cy: it + 182, r: 46, color: rgb(0x0E0E0E))
    text(ctx, [("S", sf(true, 46), WA2_TXT)], x: ix + 106, top: it + 152, width: 92)
    text(ctx, [("Sizin Salonunuz", sf(true, 38), WA2_TXT)], x: ix + 222, top: it + 138, width: 600, align: .left)
    text(ctx, [("işletme hattı", sf(false, 27), WA2_TIME)], x: ix + 222, top: it + 186, width: 600, align: .left)
    // Alt: yazma çubuğu.
    ctx.setFillColor(rgb(0x111111)); ctx.fill(CGRect(x: ix, y: cg(it + ih - 140, 140), width: iw, height: 140))
    text(ctx, [("+", sf(false, 60), WA2_TXT)], x: ix + 40, top: it + ih - 128, width: 60, align: .left)
    roundRect(ctx, x: ix + 120, top: it + ih - 116, w: iw - 260, h: 64, r: 32, fill: rgb(0x292929))
    dot(ctx, cx: ix + iw - 80, cy: it + ih - 84, r: 34, color: rgb(0x21C063))
    ctx.restoreGState()
    ctx.restoreGState()
}

/// Luera işareti — public/favicon-dark.svg'nin yolu birebir ("l" + turuncu nokta).
/// size: SVG'nin 100×100 kutusunun çizimdeki kenarı; (cx, cy) kutunun merkezi (yukarıdan).
func lueraMark(_ ctx: CGContext, cx: CGFloat, cy: CGFloat, size: CGFloat) {
    let k = size / 100
    func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: cx - size / 2 + (x * 0.5 - 8.5) * k, y: CGFloat(H) - (cy - size / 2 + (y * 0.5 - 2) * k))
    }
    let path = CGMutablePath()
    path.move(to: P(58, 42)); path.addLine(to: P(92, 42)); path.addLine(to: P(92, 120))
    path.addQuadCurve(to: P(110, 138), control: P(92, 138))
    path.addQuadCurve(to: P(122, 154), control: P(122, 138))
    path.addQuadCurve(to: P(106, 170), control: P(122, 170))
    path.addQuadCurve(to: P(58, 124), control: P(58, 170))
    path.closeSubpath()
    ctx.addPath(path); ctx.setFillColor(rgb(0xF3ECE0)); ctx.fillPath()
    let c = P(152, 150)
    ctx.setFillColor(OR)
    ctx.fillEllipse(in: CGRect(x: c.x - 26 * 0.5 * k, y: c.y - 26 * 0.5 * k, width: 26 * k, height: 26 * k))
}

let confirmRuns: [Run] = [
    ("Merhaba Ayşe Hanım ✨\n", WR, WA2_TXT), ("Sizin Salonunuz", WB, WA2_TXT), (" olarak randevunuzu oluşturduk.\n\n", WR, WA2_TXT),
    ("Hizmet: ", WB, WA2_TXT), ("cilt bakımı\n", WR, WA2_TXT), ("Tarih: ", WB, WA2_TXT), ("Yarın, 14 Kasım Cumartesi\n", WR, WA2_TXT),
    ("Saat: ", WB, WA2_TXT), ("10:30\n", WR, WA2_TXT), ("Uzman: ", WB, WA2_TXT), ("Elif Demir\n\n", WR, WA2_TXT),
    ("Sizi bekliyoruz. Değişiklik gerekirse bu mesaja yazmanız yeterli.", WR, WA2_TXT),
]
let reminderRuns: [Run] = [
    ("Merhaba Ayşe Hanım ✨\nRandevunuza 2 saat kaldı.\n\n", WR, WA2_TXT),
    ("Hizmet: ", WB, WA2_TXT), ("cilt bakımı\n", WR, WA2_TXT), ("Saat: ", WB, WA2_TXT), ("10:30\n\n", WR, WA2_TXT),
    ("Görüşmek üzere.", WR, WA2_TXT),
]

func caption(_ ctx: CGContext, _ runs: [Run], t: Double, d: Double, alpha: CGFloat, fadeOut: Bool = false) {
    let k = enter(t, 0.0, 0.4)
    let out = fadeOut ? CGFloat(clamp((d - t) / 0.25)) : 1
    text(ctx, runs, x: X0 - 40, top: 296, width: TW + 80, kern: -2, alpha: alpha * CGFloat(k) * out, dy: CGFloat(1 - k) * 24)
}

func reelA() -> [Scene] {
    let C1 = font(900, 66)
    let older: [WAEntry] = [WAEntry(item: .chip("Dün"), at: -9), WAEntry(item: .msg(runs: confirmRuns, incoming: true, time: "20:14", label: nil), at: -9)]
    let reminder = WAEntry(item: .msg(runs: reminderRuns, incoming: true, time: "08:30", label: "OTOMATİK · 2 SAAT ÖNCE"), at: 1.2)
    return [
        Scene(line: "Randevu alındı.", draw: { ctx, t, d, a in
            caption(ctx, [("Randevu alındı ", C1, INK), ("✓", C1, OKG)], t: t, d: d, alpha: a)
            let k = enter(t, 0, 0.45)
            waChat(ctx, [WAEntry(item: .chip("Bugün"), at: -1),
                         WAEntry(item: .msg(runs: confirmRuns, incoming: true, time: "20:14", label: nil), at: 0.25)],
                   t: t, clock: "20:14", alpha: a * CGFloat(k), zoom: 1 + 0.03 * CGFloat(t / d), enterDy: CGFloat(1 - k) * 90)
        }),
        Scene(line: "Ama ertesi gün müşteri gelmedi; koltuk boş, bir saat boşa gitti.", draw: { ctx, t, d, a in
            // Kırmızı nefes + sarsıntı: "10:30, koltuk boş."
            let hit = 2.25   // "gelmedi" kelimesi (sahne içi sn)
            ctx.saveGState(); ctx.setAlpha(a * 0.55 * CGFloat(enter(t, hit - 0.1, 0.25)))
            let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  colors: [rgb(0x5A1410, 0.9), rgb(0x0E0A06, 0)] as CFArray, locations: [0, 1])!
            ctx.drawRadialGradient(grad, startCenter: CGPoint(x: 540, y: 1020), startRadius: 0,
                                   endCenter: CGPoint(x: 540, y: 1020), endRadius: 900, options: [])
            ctx.restoreGState()
            let st = max(0, t - hit)
            let shake = t < hit ? 0 : CGFloat(sin(st * 58) * 16 * exp(-st * 4.5))
            ctx.saveGState(); ctx.translateBy(x: shake, y: 0)
            let k0 = enter(t, 0.0, 0.35), k1 = enter(t, 1.7, 0.3), k2 = enter(t, hit, 0.3)
            let k3 = enter(t, min(3.3, d * 0.6), 0.4), k4 = enter(t, min(4.4, d * 0.78), 0.4)
            text(ctx, [("ERTESİ GÜN · 10:30", font(800, 40), MUTED)], x: X0, top: 520, width: TW, kern: 6,
                 alpha: a * CGFloat(k0), dy: CGFloat(1 - k0) * 20)
            text(ctx, [("Müşteri", font(900, 150), INK)], x: X0 - 40, top: 610, width: TW + 80, kern: -6,
                 alpha: a * CGFloat(k1), dy: CGFloat(1 - k1) * -70)
            text(ctx, [("gelmedi.", font(900, 150), RED)], x: X0 - 40, top: 770, width: TW + 80, kern: -6,
                 alpha: a * CGFloat(k2), dy: CGFloat(1 - k2) * -70)
            text(ctx, [("Koltuk boş.", font(800, 72), INK)], x: X0, top: 990, width: TW, kern: -2,
                 alpha: a * CGFloat(k3), dy: CGFloat(1 - k3) * 30)
            text(ctx, [("Bir saat boşa gitti.", font(800, 72), MUTED)], x: X0, top: 1080, width: TW, kern: -2,
                 alpha: a * CGFloat(k4), dy: CGFloat(1 - k4) * 30)
            ctx.restoreGState()
        }),
        Scene(line: "TimeFlow, randevudan önce salonunuzun WhatsApp'ından hatırlatır.", draw: { ctx, t, d, a in
            caption(ctx, [("Otomatik ", C1, INK), ("hatırlatma", C1, OR)], t: t, d: d, alpha: a, fadeOut: true)
            let k = enter(t, 0, 0.5)
            waChat(ctx, older + [WAEntry(item: .chip("Bugün"), at: 0.55), reminder], t: t, clock: "08:30",
                   alpha: a * CGFloat(k), zoom: 1 + 0.05 * CGFloat(t / d), enterDy: CGFloat(1 - k) * 120)
        }, cut: true),
        Scene(line: "Müşteri cevap verir, siz önceden bilirsiniz.", draw: { ctx, t, d, a in
            caption(ctx, [("Müşteri ", C1, INK), ("cevap verir", C1, OR)], t: t, d: d, alpha: a)
            let past = older + [WAEntry(item: .chip("Bugün"), at: -9),
                                WAEntry(item: .msg(runs: reminderRuns, incoming: true, time: "08:30", label: "OTOMATİK · 2 SAAT ÖNCE"), at: -9)]
            waChat(ctx, past + [
                WAEntry(item: .msg(runs: [("Tamam", WR, WA2_TXT)], incoming: false, time: "08:41", label: nil), at: 0.25),
                WAEntry(item: .msg(runs: [("Görüşmek üzere, Ayşe Hanım.", WR, WA2_TXT)], incoming: true, time: "08:41", label: nil), at: d * 0.5),
            ], t: t, clock: "08:41", alpha: a, zoom: 1.05 + 0.04 * CGFloat(t / d))
        }),
        Scene(line: "Ankara'ya özel: yedi gün ücretsiz, ilk iki ay yarı fiyat. Bize mesaj atın.", draw: { ctx, t, d, a in
            offerCard(ctx, t: t, ctaAt: d * 0.66, alpha: a)
        }, last: true),
    ]
}

func reelB() -> [Scene] {
    [
        Scene(line: "Randevular hâlâ defterde ve WhatsApp'ta mı?", draw: hookScene([
            [("Randevular", H1, INK)], [("hâlâ defterde", H1, INK)], [("ve WhatsApp'ta mı?", H2, OR)],
        ])),
        Scene(line: "TimeFlow'da bütün gün tek ekranda: kim işlemde, kim bekliyor, kasada ne var.",
              draw: phoneScene(kasa, title: [[("Bütün gün ", H3, INK), ("tek ekranda", H3, OR)]], from: 0, to: 700,
                               pills: [["Kim işlemde", "Kim bekliyor", "Kasada ne var"]], phoneTop: 540,
                               pillAt: [2.55, 3.35, 4.2])),
        Scene(line: "Uzun bekleyen müşteri gözden kaçmaz.",
              draw: phoneScene(akis, title: [[("Uzun bekleyen", H3, INK)], [("gözden kaçmaz", H3, OR)]], from: 760, to: 950,
                               mark: CGRect(x: 205, y: 1610, width: 1035, height: 275), markAt: 0.25)),
        Scene(line: "Ankara'ya özel: yedi gün ücretsiz, ilk iki ay yarı fiyat. Bize mesaj atın.", draw: { ctx, t, d, a in
            offerCard(ctx, t: t, ctaAt: d * 0.66, alpha: a)
        }, last: true),
    ]
}

func reelC() -> [Scene] {
    [
        Scene(line: "Ankara'daki güzellik salonları, nail barlar ve epilasyon merkezleri:", draw: { ctx, t, d, a in
            let y = headline(ctx, [[("Ankara'daki", H1, INK)], [("salonlara", H1, OR)]], top: 520, t: t, alpha: a)
            let list = ["Güzellik salonu", "Nail bar", "Epilasyon merkezi", "Kuaför"]
            for (i, s) in list.enumerated() {
                let k = enter(t, min([0.6, 2.2, 3.1, 3.9][i], d * 0.85), 0.4)   // sözle: güzellik · nail · epilasyon
                chip(ctx, s, cx: CGFloat(W) / 2, top: y + 50 + CGFloat(i) * 118, alpha: a * CGFloat(k),
                     dy: CGFloat(1 - k) * 24, size: 44)
            }
        }),
        Scene(line: "TimeFlow'u yedi gün ücretsiz deneyin, ilk iki ay yarı fiyat.", draw: { ctx, t, d, a in
            let k1 = enter(t, 0.05), k2 = enter(t, min(2.6, d * 0.6))   // "ilk iki ay yarı fiyat" sözüyle
            text(ctx, [("7 gün", font(900, 200), INK)], x: X0, top: 560, width: TW, kern: -8,
                 alpha: a * CGFloat(k1), dy: CGFloat(1 - k1) * 40)
            text(ctx, [("ücretsiz deneyin", font(800, 80), INK)], x: X0, top: 790, width: TW, kern: -2,
                 alpha: a * CGFloat(k1), dy: CGFloat(1 - k1) * 30)
            text(ctx, [("İlk 2 ay", font(800, 80), INK)], x: X0, top: 960, width: TW, kern: -2,
                 alpha: a * CGFloat(k2), dy: CGFloat(1 - k2) * 30)
            text(ctx, [("yarı fiyat", font(900, 132), OR)], x: X0, top: 1050, width: TW, kern: -4,
                 alpha: a * CGFloat(k2), dy: CGFloat(1 - k2) * 30)
        }),
        Scene(line: "Randevu, WhatsApp hatırlatma, paket takibi ve kasa tek uygulamada.",
              draw: phoneScene(kasa, title: [[("Hepsi tek ", H3, INK), ("uygulamada", H3, OR)]], from: 400, to: 950,
                               pills: [["Randevu", "WhatsApp hatırlatma"], ["Paket takibi", "Kasa"]], phoneTop: 620,
                               pillAt: [0.2, 0.95, 2.2, 3.2])),
        Scene(line: "Kurulumu birlikte yapıyoruz.", draw: hookScene([
            [("Kurulumu", H1, INK)], [("birlikte", H1, INK)], [("yapıyoruz.", H1, OR)],
        ])),
        Scene(line: "Bize mesaj atın.", draw: { ctx, t, _, a in
            offerCard(ctx, t: t + 0.6, ctaAt: 0.7, alpha: a)
        }, last: true),
    ]
}

// ── Zamanlama ──────────────────────────────────────────────────────────────
struct Timed { let scene: Scene; let start: Double; let dur: Double }

/// ElevenLabs sesinde ölçülen duraklamalara oturan kesmeler (sn, sesin başından).
/// Yalnız X.mp3 kullanılırken geçerli; geçici seste cümle uzunluğuna göre bölünür.
let SCENE_CUTS: [String: [Double]] = [
    "A": [1.5, 7.3, 11.7, 14.8],
    "B": [2.84, 8.3, 10.9],
    "C": [4.7, 9.0, 13.7, 15.38],
]

func schedule(_ scenes: [Scene], audioDur: Double, cuts: [Double]? = nil) -> (items: [Timed], total: Double) {
    if let c = cuts, c.count == scenes.count - 1 {
        let marks = [0.0] + c.map { $0 + 0.15 } + [audioDur + TAIL]
        let items = scenes.indices.map { Timed(scene: scenes[$0], start: marks[$0], dur: marks[$0 + 1] - marks[$0]) }
        return (items, audioDur + TAIL)
    }
    let total = scenes.reduce(0) { $0 + Double($1.line.count) }
    var t = 0.0
    var out: [Timed] = []
    for (i, s) in scenes.enumerated() {
        var d = audioDur * Double(s.line.count) / total
        if i == scenes.count - 1 { d += TAIL }
        out.append(Timed(scene: s, start: t, dur: d))
        t += d
    }
    return (out, t)
}

func render(_ ctx: CGContext, _ items: [Timed], at time: Double) {
    ctx.setFillColor(BG)
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    brand(ctx, alpha: 1)
    for it in items where time >= it.start - 0.001 && time < it.start + it.dur + 0.001 {
        let lt = time - it.start
        let fadeOut = (it.scene.last || it.scene.cut) ? 1.0 : clamp((it.dur - lt) / 0.22)
        it.scene.draw(ctx, lt, it.dur, CGFloat(fadeOut))
    }
}

// ── Ses ────────────────────────────────────────────────────────────────────
func audioFile(_ name: String) -> URL {
    let mp3 = URL(fileURLWithPath: "\(REELS)/ses/\(name).mp3")
    if FileManager.default.fileExists(atPath: mp3.path) { return mp3 }
    return URL(fileURLWithPath: "\(REELS)/ses/\(name).aiff")
}

func toM4A(_ src: URL) throws -> URL {
    let dst = URL(fileURLWithPath: NSTemporaryDirectory() + "reels-\(UUID().uuidString).m4a")
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/afconvert")
    p.arguments = ["-f", "m4af", "-d", "aac", src.path, dst.path]
    try p.run(); p.waitUntilExit()
    return dst
}

// ── Yazma ──────────────────────────────────────────────────────────────────
func makeContext(_ base: UnsafeMutableRawPointer?, _ bpr: Int) -> CGContext {
    CGContext(data: base, width: W, height: H, bitsPerComponent: 8, bytesPerRow: bpr,
              space: CGColorSpace(name: CGColorSpace.sRGB)!,
              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
}

func writeVideo(_ items: [Timed], total: Double, to url: URL) async throws {
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000,
                                          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
    ])
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W,
        kCVPixelBufferHeightKey as String: H,
    ])
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    let frames = Int(ceil(total * Double(FPS)))
    for i in 0..<frames {
        while !input.isReadyForMoreMediaData { usleep(2000) }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
        guard let buf = pb else { fatalError("piksel tamponu yok") }
        CVPixelBufferLockBaseAddress(buf, [])
        let ctx = makeContext(CVPixelBufferGetBaseAddress(buf), CVPixelBufferGetBytesPerRow(buf))
        render(ctx, items, at: Double(i) / Double(FPS))
        CVPixelBufferUnlockBaseAddress(buf, [])
        adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: FPS))
    }
    input.markAsFinished()
    await writer.finishWriting()
    if writer.status != .completed { throw writer.error ?? NSError(domain: "yazma", code: 1) }
}

func mux(video: URL, audio: URL, to out: URL) async throws {
    try? FileManager.default.removeItem(at: out)
    let comp = AVMutableComposition()
    let va = AVURLAsset(url: video), aa = AVURLAsset(url: audio)
    let vdur = try await va.load(.duration)
    let vt = try await va.loadTracks(withMediaType: .video).first!
    let at = try await aa.loadTracks(withMediaType: .audio).first!
    let adur = try await aa.load(.duration)
    let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try cv.insertTimeRange(CMTimeRange(start: .zero, duration: vdur), of: vt, at: .zero)
    let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try ca.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(adur, vdur)), of: at,
                           at: CMTime(seconds: 0.15, preferredTimescale: 600))
    let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
    try await ex.export(to: out, as: .mp4)
}

func savePNG(_ img: CGImage, _ path: String) {
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, img, nil)
    CGImageDestinationFinalize(d)
}

func still(_ items: [Timed], at t: Double) -> CGImage {
    let ctx = makeContext(nil, W * 4)
    render(ctx, items, at: t)
    return ctx.makeImage()!
}

// ══ REKLAM: 4:5 görseller (G1–G4) ve karusel (K1) ═════════════════════════
// Meta akışı için 1080×1350. Üstte logo, ortada tek fikir, altta teklif + WhatsApp.

let kumanda = loadImage("\(ASSETS)/kumanda.png")   // personel kumandası (sayaç)

/// Alt bant: teklif satırı, yeşil WhatsApp düğmesi, koşul (Meta: indirimin koşulu açık).
func adFooter(_ ctx: CGContext, offer: Bool = true) {
    let b = CGFloat(H)
    if offer {
        text(ctx, [("7 gün ücretsiz", font(900, 48), INK), ("  ·  ", font(700, 48), DIM), ("İlk 2 ay %50", font(900, 48), OR)],
             x: X0 - 60, top: b - 318, width: TW + 120, kern: -1)
    }
    let cw: CGFloat = 660, ch: CGFloat = 116
    roundRect(ctx, x: (CGFloat(W) - cw) / 2, top: b - 228, w: cw, h: ch, r: ch / 2, fill: WA_GREEN)
    text(ctx, [("WhatsApp'tan yazın  →", font(800, 48), rgb(0x0B141A))], x: 0, top: b - 228 + (ch - 62) / 2,
         width: CGFloat(W), kern: -1)
    text(ctx, [("Ankara'ya özel · aylık paketlerde · 31 Aralık 2026'ya kadar", font(600, 28), DIM)],
         x: X0 - 60, top: b - 84, width: TW + 120)
}

/// Görsel kartta WhatsApp sohbeti (gerçek görünüm, sabit).
func waPanel(_ ctx: CGContext, top: CGFloat, height: CGFloat, items: [WAItem], px: CGFloat = 80) {
    let pw = CGFloat(W) - 2 * px
    let rect = CGRect(x: px, y: cg(top, height), width: pw, height: height)
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 52, cornerHeight: 52, transform: nil)); ctx.clip()
    ctx.setFillColor(WA2_BG); ctx.fill(rect)
    let tw = CGFloat(waTile.width) * 1.06, th = CGFloat(waTile.height) * 1.06
    var yy = rect.minY
    while yy < rect.maxY {
        var xx = rect.minX
        while xx < rect.maxX { ctx.draw(waTile, in: CGRect(x: xx, y: yy, width: tw, height: th)); xx += tw }
        yy += th
    }
    ctx.setFillColor(WA2_BAR); ctx.fill(CGRect(x: px, y: cg(top, 112), width: pw, height: 112))
    dot(ctx, cx: px + 74, cy: top + 56, r: 36, color: rgb(0x3B4A54))
    text(ctx, [("S", sf(true, 36), WA2_TXT)], x: px + 38, top: top + 32, width: 72)
    text(ctx, [("Sizin Salonunuz", sf(true, 34), WA2_TXT)], x: px + 132, top: top + 18, width: 600, align: .left)
    text(ctx, [("işletme hattı · sizin numaranız", sf(false, 25), WA2_TIME)], x: px + 132, top: top + 62, width: 600, align: .left)
    var y = top + 140
    for item in items {
        let g = waGeom(item, maxW: pw * 0.78)
        waDraw(ctx, item, top: y, ix: px, iw: pw, alpha: 1)
        y += g.h + 16
    }
    ctx.restoreGState()
    roundRect(ctx, x: px, top: top, w: pw, h: height, r: 52, stroke: rgb(0xF3EDE3, 0.14), lw: 2)
}

/// Telefon içinde ekran görüntüsü; altı yumuşakça zemine erir (alttaki teklif bandına binmesin).
func phoneShot(_ ctx: CGContext, _ img: CGImage, top: CGFloat, height: CGFloat, width: CGFloat = 620,
               scroll: CGFloat, mark: CGRect? = nil) {
    var p = Phone(img: img)
    p.w = width; p.x = (CGFloat(W) - width) / 2; p.top = top; p.h = height + 120
    p.draw(ctx, scroll: scroll, alpha: 1)
    if let m = mark { p.mark(ctx, region: m, scroll: scroll, alpha: 1) }
    let fadeTop = top + height - 160
    let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                       colors: [rgb(0x0E0A06, 0), rgb(0x0E0A06, 1)] as CFArray, locations: [0, 1])!
    ctx.saveGState()
    ctx.clip(to: CGRect(x: 0, y: cg(fadeTop, 300), width: CGFloat(W), height: 300))
    ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: cg(fadeTop, 0)), end: CGPoint(x: 0, y: cg(fadeTop + 160, 0)),
                           options: [.drawsAfterEndLocation])
    ctx.restoreGState()
}

func poster(_ name: String, page: String? = nil, _ draw: (CGContext) -> Void) {
    let ctx = makeContext(nil, W * 4)
    ctx.setFillColor(BG); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    // Hafif sıcak ışık (düz renk zemin üstünde; parlama/gradyan logoya değil zemine).
    let glow = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                          colors: [rgb(0x2A1608, 0.85), rgb(0x0E0A06, 0)] as CFArray, locations: [0, 1])!
    ctx.drawRadialGradient(glow, startCenter: CGPoint(x: 540, y: CGFloat(H) - 420), startRadius: 0,
                           endCenter: CGPoint(x: 540, y: CGFloat(H) - 420), endRadius: 760, options: [])
    brand(ctx, alpha: 1)
    if let p = page {
        text(ctx, [(p, font(700, 30), DIM)], x: CGFloat(W) - 220, top: BRAND_TOP + 8, width: 170, align: .right)
    }
    draw(ctx)
    savePNG(ctx.makeImage()!, "\(OUT)/\(name).png")
    print("  → \(name).png")
}

// Görsellerde WhatsApp yazısı bir tık küçük (4:5 kartta yer dar).
let WRs = sf(false, 29), WBs = sf(true, 29)
let reminder24: [Run] = [
    ("Merhaba Yasemin Hanım ✨\n", WRs, WA2_TXT), ("Sizin Salonunuz", WBs, WA2_TXT), (" olarak randevunuzu hatırlatmak istedik.\n\n", WRs, WA2_TXT),
    ("Hizmet: ", WBs, WA2_TXT), ("Ağda\n", WRs, WA2_TXT), ("Tarih: ", WBs, WA2_TXT), ("Yarın, 14:30\n\n", WRs, WA2_TXT),
    ("Gelebilecek misiniz? ", WRs, WA2_TXT), ("Evet", WBs, WA2_TXT), (" ya da ", WRs, WA2_TXT), ("Hayır", WBs, WA2_TXT),
    (" yazmanız yeterli.", WRs, WA2_TXT),
]

func gorseller() {
    W = 1080; H = 1350; BRAND_TOP = 74
    let HB = font(900, 84), HM = font(800, 52)

    // G1 · A · Gelmeyen müşteri
    poster("G1-gelmeyen-musteri") { ctx in
        text(ctx, [("Bugün kaç randevunuz\n", font(900, 74), INK), ("gelmedi?", font(900, 74), RED)], x: X0 - 50, top: 168,
             width: TW + 100, lineMult: 0.95, kern: -3)
        waPanel(ctx, top: 350, height: 662, items: [
            .msg(runs: reminder24, incoming: true, time: "14:30", label: "OTOMATİK · 1 GÜN ÖNCE"),
            .msg(runs: [("Evet, geliyorum", WRs, WA2_TXT)], incoming: false, time: "14:41", label: nil),
        ])
        adFooter(ctx)
    }

    // G2 · B · Defter karmaşası
    poster("G2-defteri-birakin") { ctx in
        text(ctx, [("Defteri ", HB, INK), ("bırakın.", HB, OR)], x: X0 - 50, top: 176, width: TW + 100, kern: -3)
        text(ctx, [("Kim işlemde, kim bekliyor: bütün gün tek ekranda.", font(600, 36), MUTED)],
             x: X0 - 40, top: 288, width: TW + 80)
        phoneShot(ctx, akis, top: 360, height: 660, scroll: 800,
                  mark: CGRect(x: 205, y: 1610, width: 1035, height: 275))
        adFooter(ctx)
    }

    // G3 · D · Fiyat
    poster("G3-ilk-2-ay-yari-fiyat") { ctx in
        text(ctx, [("ANKARA'YA ÖZEL", font(800, 34), OR)], x: X0, top: 182, width: TW, kern: 6)
        text(ctx, [("İlk 2 ay ", HB, INK), ("yarı fiyat.", HB, OR)], x: X0 - 50, top: 232, width: TW + 100, kern: -3)
        let rows: [(String, String, String)] = [
            ("Tek kişilik", "799 TL", "399,50 TL"), ("Ekip", "1.299 TL", "649,50 TL"), ("İşletme", "1.999 TL", "999,50 TL"),
        ]
        var y: CGFloat = 384
        for (ad, eski, yeni) in rows {
            roundRect(ctx, x: X0 - 20, top: y, w: TW + 40, h: 128, r: 36, fill: CARD, stroke: rgb(0xF3EDE3, 0.10), lw: 2)
            text(ctx, [(ad, font(800, 44), INK)], x: X0 + 22, top: y + 36, width: 360, align: .left)
            let ef = font(600, 34)
            let ew = measure([(eski, ef, DIM)], width: 400).width
            let nf = font(900, 54)
            let nw = measure([(yeni, nf, OR)], width: 500).width
            let right = X0 + TW - 12
            text(ctx, [(yeni, nf, OR)], x: right - nw - 6, top: y + 30, width: nw + 12, align: .left)
            let ex = right - nw - 34 - ew
            text(ctx, [(eski, ef, DIM)], x: ex, top: y + 44, width: ew + 8, align: .left)
            ctx.setStrokeColor(DIM); ctx.setLineWidth(3)
            ctx.move(to: CGPoint(x: ex - 4, y: cg(y + 66, 0))); ctx.addLine(to: CGPoint(x: ex + ew + 6, y: cg(y + 66, 0)))
            ctx.strokePath()
            y += 148
        }
        text(ctx, [("/ay · ilk 2 ay  ·  sonra normal fiyat  ·  randevu sınırı yok", font(600, 30), MUTED)],
             x: X0 - 40, top: y + 6, width: TW + 80)
        adFooter(ctx)
    }

    // G4 · C · Ekip kendi telefonunda
    poster("G4-ekip-kendi-telefonunda") { ctx in
        text(ctx, [("Ekibiniz işini\n", HB, INK), ("kendi telefonundan", HM, OR), (" takip eder.", HM, INK)],
             x: X0 - 50, top: 170, width: TW + 100, lineMult: 1.0, kern: -2)
        phoneShot(ctx, kumanda, top: 420, height: 590, scroll: 180)
        adFooter(ctx)
    }

    // K1 · Karusel: bir randevunun yolculuğu (6 kare)
    let n = 6
    poster("K1-1-kapak", page: "1/\(n)") { ctx in
        text(ctx, [("Bir randevu\n", font(900, 104), INK), ("TimeFlow'da\n", font(900, 104), OR), ("nasıl ilerler?", font(900, 104), INK)],
             x: X0 - 50, top: 300, width: TW + 100, lineMult: 0.95, kern: -4)
        text(ctx, [("Güzellik salonu · Nail bar · Epilasyon · Kuaför", font(600, 34), MUTED)], x: X0, top: 760, width: TW)
        text(ctx, [("Kaydırın  →", font(800, 44), OR)], x: X0, top: 1150, width: TW)
    }
    poster("K1-2-randevu", page: "2/\(n)") { ctx in
        text(ctx, [("1 · ", HM, OR), ("Randevu alınır,\nonay sizin numaranızdan gider.", HM, INK)], x: X0 - 40, top: 180,
             width: TW + 80, lineMult: 1.05, kern: -1)
        waPanel(ctx, top: 400, height: 760, items: [
            .chip("Bugün"),
            .msg(runs: confirmRuns, incoming: true, time: "20:14", label: nil),
        ])
    }
    poster("K1-3-hatirlatma", page: "3/\(n)") { ctx in
        text(ctx, [("2 · ", HM, OR), ("1 gün ve 2 saat önce\nkendiliğinden hatırlatır.", HM, INK)], x: X0 - 40, top: 180,
             width: TW + 80, lineMult: 1.05, kern: -1)
        waPanel(ctx, top: 400, height: 690, items: [
            .msg(runs: reminder24, incoming: true, time: "14:30", label: "OTOMATİK · 1 GÜN ÖNCE"),
            .msg(runs: [("Hayır, gelemeyeceğim", WRs, WA2_TXT)], incoming: false, time: "14:52", label: nil),
        ])
        text(ctx, [("Gelemeyecek olan haber verir, saat boşalır.", font(700, 38), MUTED)], x: X0 - 40, top: 1130, width: TW + 80)
    }
    poster("K1-4-akis", page: "4/\(n)") { ctx in
        text(ctx, [("3 · ", HM, OR), ("Gün tek ekranda:\nkim işlemde, kim bekliyor.", HM, INK)], x: X0 - 40, top: 180,
             width: TW + 80, lineMult: 1.05, kern: -1)
        phoneShot(ctx, akis, top: 400, height: 860, scroll: 250, mark: CGRect(x: 205, y: 1610, width: 1035, height: 275))
    }
    poster("K1-5-kasa", page: "5/\(n)") { ctx in
        text(ctx, [("4 · ", HM, OR), ("İşlem biter, adisyon\nkasaya hazır düşer.", HM, INK)], x: X0 - 40, top: 180,
             width: TW + 80, lineMult: 1.05, kern: -1)
        phoneShot(ctx, kasa, top: 400, height: 860, scroll: 1000, mark: CGRect(x: 205, y: 2290, width: 1035, height: 245))
    }
    poster("K1-6-teklif", page: "6/\(n)") { ctx in
        text(ctx, [("ANKARA'YA ÖZEL", font(800, 38), OR)], x: X0, top: 250, width: TW, kern: 6)
        text(ctx, [("7 gün\nücretsiz", font(900, 150), INK)], x: X0, top: 320, width: TW, lineMult: 0.9, kern: -6)
        text(ctx, [("İlk 2 ay ", font(800, 66), INK), ("%50 indirim", font(900, 66), OR)], x: X0 - 40, top: 700,
             width: TW + 80, kern: -2)
        text(ctx, [("Kurulumu 10 dakikada birlikte yapıyoruz.", font(700, 38), MUTED)], x: X0 - 40, top: 820, width: TW + 80)
        adFooter(ctx, offer: false)
    }
}

// ── Ana akış ───────────────────────────────────────────────────────────────
try? FileManager.default.createDirectory(atPath: OUT, withIntermediateDirectories: true)
let mode = CommandLine.arguments.dropFirst().first ?? "video"
let checkDir = NSTemporaryDirectory() + "reklam-kare"
try? FileManager.default.createDirectory(atPath: checkDir, withIntermediateDirectories: true)
print("yazı tipi:", CTFontCopyPostScriptName(font(900, 20)) as String, "· çıktı:", OUT)

if mode == "gorsel" {
    gorseller()
} else {
    let reels: [(String, String, () -> [Scene])] = [
        ("A", "A1-gelmeyen-musteri", reelA), ("B", "B1-defter-karmasasi", reelB), ("C", "D1-teklif", reelC),
    ]
    for (key, name, build) in reels {
        let src = audioFile(key)
        let m4a = try toM4A(src)
        let adur = try await AVURLAsset(url: m4a).load(.duration).seconds
        let (items, total) = schedule(build(), audioDur: adur + 0.15, cuts: src.pathExtension == "mp3" ? SCENE_CUTS[key] : nil)
        print("\(name): ses \(src.lastPathComponent) \(String(format: "%.1f", adur)) sn → video \(String(format: "%.1f", total)) sn")
        if mode == "kare" {
            for it in items {
                for f in [0.55, 0.95] {
                    let t = it.start + it.dur * f
                    savePNG(still(items, at: t), "\(checkDir)/\(name)-\(String(format: "%05.2f", t)).png")
                }
            }
            continue
        }
        let silent = URL(fileURLWithPath: NSTemporaryDirectory() + "reklam-\(key)-sessiz.mp4")
        try await writeVideo(items, total: total, to: silent)
        let out = URL(fileURLWithPath: "\(OUT)/\(name).mp4")
        try await mux(video: silent, audio: m4a, to: out)
        let coverAt = key == "A" ? items[1].start + items[1].dur * 0.8 : min(1.6, items[0].dur * 0.9)
        savePNG(still(items, at: coverAt), "\(OUT)/\(name)-kapak.png")
        print("  → \(out.lastPathComponent)")
    }
}
