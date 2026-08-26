#!/usr/bin/env python3
"""Erzeugt die PWA-Icons ohne externe Abhaengigkeiten.

Gezeichnet wird ein Euro-Zeichen auf einem Farbverlauf. Gerendert wird mit
4-fachem Supersampling, geschrieben als PNG ueber zlib.

    python3 tools/make-icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

GRAD_TOP = (20, 184, 166)     # teal-500
GRAD_BOTTOM = (14, 116, 210)  # ocean blue
RING = (255, 255, 255)

SS = 4  # Supersampling-Faktor


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def rounded_rect_alpha(x, y, w, h, r):
    """1.0 innerhalb des abgerundeten Rechtecks, 0.0 ausserhalb."""
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx, dy = x - cx, y - cy
    if dx == 0 and dy == 0:
        return 1.0
    return 1.0 if math.hypot(dx, dy) <= r else 0.0


def bar_alpha(x, y, x0, x1, cy, half):
    """Waagerechter Balken mit runden Enden."""
    if x0 <= x <= x1:
        return 1.0 if abs(y - cy) <= half else 0.0
    ex = x0 if x < x0 else x1
    return 1.0 if math.hypot(x - ex, y - cy) <= half else 0.0


def arc_alpha(x, y, cx, cy, radius, thickness, start_deg, sweep_deg):
    """Kreisbogen mit runden Enden."""
    d = math.hypot(x - cx, y - cy)
    cap = thickness / 2
    if abs(d - radius) <= cap:
        ang = (math.degrees(math.atan2(y - cy, x - cx)) - start_deg) % 360
        if ang <= sweep_deg:
            return 1.0
    for a in (start_deg, start_deg + sweep_deg):
        ax = cx + radius * math.cos(math.radians(a))
        ay = cy + radius * math.sin(math.radians(a))
        if math.hypot(x - ax, y - ay) <= cap:
            return 1.0
    return 0.0


def euro_alpha(x, y, n, scale):
    """Ein Euro-Zeichen, rein geometrisch aus Bogen und zwei Balken."""
    cx = cy = n / 2
    u = n * scale                      # Grundmass des Glyphen
    t = u * 0.20                       # Strichstaerke
    r = u * 0.42
    ax = cx + u * 0.10                 # Bogen sitzt leicht rechts
    if arc_alpha(x, y, ax, cy, r, t, 40.0, 280.0):
        return 1.0
    half = t * 0.40
    x0, x1 = cx - u * 0.50, cx + u * 0.20
    for by in (cy - u * 0.15, cy + u * 0.15):
        if bar_alpha(x, y, x0, x1, by, half):
            return 1.0
    return 0.0


def render(size, maskable=False):
    n = size * SS
    # Inhalt im sicheren Bereich halten, wenn Android das Icon beschneidet
    scale = 0.52 if maskable else 0.68
    corner = 0.0 if maskable else 0.225 * n

    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = px * SS + sx + 0.5
                    y = py * SS + sy + 0.5
                    bg_a = 1.0 if maskable else rounded_rect_alpha(x, y, n, n, corner)
                    if bg_a == 0.0:
                        continue
                    col = RING if euro_alpha(x, y, n, scale) else lerp(GRAD_TOP, GRAD_BOTTOM, y / n)
                    r += col[0] * bg_a
                    g += col[1] * bg_a
                    b += col[2] * bg_a
                    a += bg_a
            samples = SS * SS
            if a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                row += bytes((round(r / a), round(g / a), round(b / a), round(255 * a / samples)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"  {os.path.relpath(path)}  ({len(png) / 1024:.1f} kB)")


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, maskable, name in [
        (192, False, "icon-192.png"),
        (512, False, "icon-512.png"),
        (512, True, "icon-maskable-512.png"),
        (180, False, "apple-touch-icon.png"),
        (32, False, "favicon-32.png"),
    ]:
        write_png(os.path.join(OUT, name), render(size, maskable), size)


if __name__ == "__main__":
    main()
