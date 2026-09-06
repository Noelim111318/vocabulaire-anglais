#!/usr/bin/env python3
"""
Régénère les icônes de l'appli : une bulle de BD jaune avec « Aa » sur le
fond violet étoilé de l'appli.

    pip install pillow
    python3 tools/make-icon.py

Écrit  icons/icon-192.png, icons/icon-512.png, icons/icon-512-maskable.png,
       icons/apple-touch-icon.png  et  favicon.ico
La police Nunito (variable .ttf) est téléchargée dans tools/ au premier lancement.
Modifie les constantes de couleur / la géométrie de la bulle pour changer le style.
"""
import math, os, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")
FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Nunito.ttf")
FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito%5Bwght%5D.ttf"

S = 2048                       # taille de travail suréchantillonnée (-> 512)
LANCZOS = Image.Resampling.LANCZOS

BASE = (26, 10, 46)            # #1A0A2E  fond
GLOW = (120, 92, 255)          # halo violet
INK = (24, 12, 40)             # texte
Y_TOP = (255, 233, 110)        # haut de la bulle
Y_BOT = (244, 196, 0)          # bas de la bulle
Y_RIM = (206, 150, 0)          # liseré


def _font():
    if not os.path.exists(FONT):
        print("Téléchargement de Nunito…")
        urllib.request.urlretrieve(FONT_URL, FONT)
    return FONT


def vgrad(w, h, top, bot):
    col = Image.new("RGB", (1, h))
    px = col.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return col.resize((w, h))


def render(content_scale=1.0, rounded=True):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # fond : couleur de base + halo en haut
    bg = Image.new("RGB", (S, S), BASE)
    g = Image.radial_gradient("L").resize((int(S * 2.1), int(S * 2.1)), LANCZOS)
    glow_a = Image.new("L", (S, S), 0)
    glow_a.paste(g, (int(S * 0.5 - g.width / 2), int(S * 0.30 - g.height / 2)))
    glow_a = glow_a.point(lambda v: int(v * 0.55))
    bg = Image.composite(Image.new("RGB", (S, S), GLOW), bg, glow_a)
    img.paste(bg, (0, 0))

    d = ImageDraw.Draw(img)
    cx0, cy0 = S / 2, S / 2

    # petites étoiles
    for fx, fy, rr, a in [(0.16, 0.14, 7, 90), (0.83, 0.11, 10, 120), (0.90, 0.44, 6, 80),
                          (0.10, 0.52, 8, 95), (0.22, 0.83, 6, 80), (0.78, 0.85, 9, 110),
                          (0.50, 0.07, 5, 70), (0.93, 0.70, 5, 70), (0.07, 0.30, 5, 65)]:
        x = cx0 + (fx * S - cx0) * content_scale
        y = cy0 + (fy * S - cy0) * content_scale
        r = rr * 4 * content_scale
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))

    # géométrie de la bulle
    bw, bh = S * 0.72 * content_scale, S * 0.55 * content_scale
    bx0, by0 = cx0 - bw / 2, cy0 - bh / 2 - S * 0.035 * content_scale
    bx1, by1 = bx0 + bw, by0 + bh
    rad = bh * 0.36
    tail = [(bx0 + bw * 0.26, by1 - 2),
            (bx0 + bw * 0.11, by1 + bh * 0.26),
            (bx0 + bw * 0.55, by1 - 2)]

    shape = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(shape)
    sd.rounded_rectangle([bx0, by0, bx1, by1], radius=rad, fill=255)
    sd.polygon(tail, fill=255)

    # ombre portée
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), (0, int(S * 0.012)), shape)
    sh = sh.filter(ImageFilter.GaussianBlur(int(S * 0.028)))
    img = Image.alpha_composite(img, sh)

    # remplissage dégradé + liseré
    fill = vgrad(S, S, Y_TOP, Y_BOT).convert("RGBA")
    fill.putalpha(shape)
    img = Image.alpha_composite(img, fill)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=rad,
                        outline=Y_RIM + (150,), width=int(S * 0.006))

    # reflet doux en haut
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).rounded_rectangle(
        [bx0 + bw * 0.12, by0 + bh * 0.12, bx1 - bw * 0.12, by0 + bh * 0.38],
        radius=rad * 0.6, fill=(255, 255, 255, 45))
    hl = hl.filter(ImageFilter.GaussianBlur(int(S * 0.03)))
    hl.putalpha(Image.composite(hl.getchannel("A"), Image.new("L", (S, S), 0), shape))
    img = Image.alpha_composite(img, hl)

    # « Aa »
    fnt = ImageFont.truetype(_font(), int(bh * 0.72))
    try:
        fnt.set_variation_by_axes([900])
    except Exception:
        pass
    d = ImageDraw.Draw(img)
    tb = d.textbbox((0, 0), "Aa", font=fnt)
    d.text(((bx0 + bx1) / 2 - (tb[2] - tb[0]) / 2 - tb[0],
            (by0 + by1) / 2 - (tb[3] - tb[1]) / 2 - tb[1]),
           "Aa", font=fnt, fill=INK + (255,))

    # coins arrondis transparents (icônes "any")
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1],
                                               radius=int(S * 0.22), fill=255)
        img.putalpha(Image.composite(img.getchannel("A"),
                                     Image.new("L", (S, S), 0), mask))
    return img.resize((512, 512), LANCZOS)


def flatten(rgba):
    out = Image.new("RGB", rgba.size, BASE)
    out.paste(rgba, (0, 0), rgba)
    return out


def main():
    os.makedirs(ICONS, exist_ok=True)
    any_icon = render(1.0, rounded=True)
    any_icon.save(os.path.join(ICONS, "icon-512.png"))
    any_icon.resize((192, 192), LANCZOS).save(os.path.join(ICONS, "icon-192.png"))
    flatten(render(0.80, rounded=False)).save(os.path.join(ICONS, "icon-512-maskable.png"))
    flatten(render(0.86, rounded=False)).resize((180, 180), LANCZOS).save(
        os.path.join(ICONS, "apple-touch-icon.png"))
    any_icon.resize((48, 48), LANCZOS).save(os.path.join(ROOT, "favicon.ico"), sizes=[(48, 48)])
    print("Icônes régénérées.")


if __name__ == "__main__":
    main()
