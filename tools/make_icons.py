"""Genera los iconos PNG de la app a partir de la misma geometría que icons/icon.svg.

Uso:  python tools/make_icons.py
Requiere Pillow (pip install pillow).
"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "app" / "icons"
BG = (28, 25, 23, 255)        # --bg-primary
ACCENT = (207, 106, 76, 255)  # --accent
SS = 4                        # supersampling para bordes suaves


def star_points(cx, cy, r, pinch=0.16, steps=40):
    """Estrella de 4 puntas con lados cóncavos (curvas cuadráticas hacia el centro)."""
    tips = [(0, -1), (1, 0), (0, 1), (-1, 0)]
    pts = []
    for i in range(4):
        x0, y0 = tips[i]
        x2, y2 = tips[(i + 1) % 4]
        # punto de control: en la bisectriz del cuadrante, cerca del centro
        x1, y1 = (x0 + x2) * pinch, (y0 + y2) * pinch
        for s in range(steps):
            t = s / steps
            x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t ** 2 * x2
            y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t ** 2 * y2
            pts.append((cx + x * r, cy + y * r))
    return pts


def make(size, maskable=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=BG)          # a sangre: el SO recorta la forma
        r = S * 0.30                                 # dentro de la zona segura (80 %)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG)
        r = S * 0.36
    d.polygon(star_points(S / 2, S / 2, r), fill=ACCENT)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make(192).save(OUT / "icon-192.png")
    make(512).save(OUT / "icon-512.png")
    make(512, maskable=True).save(OUT / "icon-maskable-512.png")
    print("Iconos generados en", OUT)
