// Draws the link-preview image (share.png, 1200x630) in the site's dark colors,
// with the home page's ridges and hive moon.
// Run from the project root:  swift scripts/make_images.swift
import AppKit

let out = URL(fileURLWithPath: "site/assets/img")

func hex(_ v: Int, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
          blue: CGFloat(v & 0xff) / 255, alpha: a)
}
// Tokens from site/assets/css/style.css.
let skyTop = hex(0x172A3F), bg = hex(0x0E1418)
let ridgeFar = hex(0x22384E), ridgeNear = hex(0x18293A), ridgeBase = hex(0x40241A)
let gold = hex(0xE2AE48), head = hex(0xF4E8D0), ink = hex(0xE9E2D4), inkSoft = hex(0xC9D0D5)

func render(_ w: Int, _ h: Int, to name: String, draw: (CGContext) -> Void) {
  try! FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                             bytesPerRow: 0, bitsPerPixel: 0)!
  let gc = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = gc
  // Flip so y runs down, like the SVGs.
  gc.cgContext.translateBy(x: 0, y: CGFloat(h))
  gc.cgContext.scaleBy(x: 1, y: -1)
  draw(gc.cgContext)
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent(name))
  print("wrote", name)
}

// The hero ridges from index.html (a 1440x160 viewBox), stretched to width `w`
// and `h` tall, with their bottom edge at `bottom`.
func ridges(_ c: CGContext, width w: CGFloat, height h: CGFloat, bottom: CGFloat) {
  let sx = w / 1440, sy = h / 160, top = bottom - h
  func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: top + y * sy) }
  func layer(_ color: NSColor, _ start: (CGFloat, CGFloat), _ curves: [[CGFloat]], close: [(CGFloat, CGFloat)]) {
    c.move(to: p(start.0, start.1))
    for k in curves { c.addCurve(to: p(k[4], k[5]), control1: p(k[0], k[1]), control2: p(k[2], k[3])) }
    for (x, y) in close { c.addLine(to: p(x, y)) }
    c.closePath()
    c.setFillColor(color.cgColor)
    c.fillPath()
  }
  layer(ridgeFar, (0, 92), [[160, 48, 300, 118, 480, 74], [660, 30, 820, 120, 1020, 68], [1180, 28, 1320, 96, 1440, 54]],
        close: [(1440, 160), (0, 160)])
  layer(ridgeNear, (0, 118), [[220, 86, 400, 136, 620, 108], [840, 80, 980, 132, 1180, 104], [1300, 90, 1380, 120, 1440, 108]],
        close: [(1440, 160), (0, 160)])
  layer(ridgeBase, (0, 146), [], close: [(1440, 128), (1440, 160), (0, 160)])
}

// The hive moon: a hexagon with points left and right, as in the hero.
func hexagon(_ c: CGContext, center o: CGPoint, radius r: CGFloat) {
  let half = r * 0.85
  c.move(to: CGPoint(x: o.x + r, y: o.y))
  for (x, y) in [(r / 2, half), (-r / 2, half), (-r, 0), (-r / 2, -half), (r / 2, -half)] {
    c.addLine(to: CGPoint(x: o.x + x, y: o.y + y))
  }
  c.closePath()
}

// The logo in its 24x24 SVG coordinates: a hexagon inside a hexagon.
func logo(_ c: CGContext, scale s: CGFloat, at o: CGPoint) {
  for ring in [[(12, 3.2), (18.5, 6.8), (18.5, 13.7), (12, 17.3), (5.5, 13.7), (5.5, 6.8)],
               [(12, 8.2), (15, 9.9), (15, 13.3), (12, 15.1), (9, 13.3), (9, 9.9)]] {
    c.move(to: CGPoint(x: o.x + CGFloat(ring[0].0) * s, y: o.y + CGFloat(ring[0].1) * s))
    for (x, y) in ring.dropFirst() { c.addLine(to: CGPoint(x: o.x + CGFloat(x) * s, y: o.y + CGFloat(y) * s)) }
    c.closePath()
  }
}

func text(_ s: String, font: NSFont, color: NSColor, at p: CGPoint, kern: CGFloat = 0) {
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: kern]
  // Flip back locally so text draws upright.
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.saveGState()
  ctx.translateBy(x: p.x, y: p.y)
  ctx.scaleBy(x: 1, y: -1)
  NSAttributedString(string: s, attributes: attrs).draw(at: .zero)
  ctx.restoreGState()
}

let serifBold = NSFont(name: "IowanOldStyle-Bold", size: 92) ?? NSFont.boldSystemFont(ofSize: 92)
let serif = NSFont(name: "IowanOldStyle-Roman", size: 40) ?? NSFont.systemFont(ofSize: 40)

render(1200, 630, to: "share.png") { c in
  // The hero's sky, fading to the page background.
  let sky = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [skyTop.cgColor, bg.cgColor] as CFArray,
                       locations: [0, 0.82])!
  c.drawLinearGradient(sky, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: 630), options: [.drawsAfterEndLocation])

  // Hive moon with its glow, upper right.
  let moon = CGPoint(x: 1010, y: 170)
  let glow = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
                        colors: [gold.withAlphaComponent(0.3).cgColor, gold.withAlphaComponent(0).cgColor] as CFArray,
                        locations: [0, 1])!
  c.drawRadialGradient(glow, startCenter: moon, startRadius: 0, endCenter: moon, endRadius: 210, options: [])
  c.setFillColor(gold.cgColor)
  hexagon(c, center: moon, radius: 76)
  c.fillPath()

  ridges(c, width: 1200, height: 190, bottom: 630)

  // Logo mark.
  c.setStrokeColor(gold.cgColor)
  c.setLineWidth(6)
  c.setLineCap(.round)
  c.setLineJoin(.round)
  logo(c, scale: 4.4, at: CGPoint(x: 60, y: 18))
  c.strokePath()

  text("WASATCH FRONT AIR AND POLLEN", font: .systemFont(ofSize: 26, weight: .semibold), color: gold, at: CGPoint(x: 86, y: 168), kern: 4)
  text("HiveAir Utah", font: serifBold, color: head, at: CGPoint(x: 80, y: 278))
  text("The air we all share, in plain words.", font: serif, color: ink, at: CGPoint(x: 84, y: 352))
  text("Today\u{2019}s air and burn days from Utah DAQ and EPA AirNow.", font: .systemFont(ofSize: 27, weight: .regular),
       color: inkSoft, at: CGPoint(x: 84, y: 404))
  text("hivewatchutah.com", font: .systemFont(ofSize: 26, weight: .semibold), color: ink, at: CGPoint(x: 84, y: 470))
}
