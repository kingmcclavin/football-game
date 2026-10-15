#!/usr/bin/env python3
"""Convert the ASCII-art assets in gba/assets/ into GBA 4bpp tile data.

Outputs src/gen_assets.c and src/gen_assets.h. With --preview DIR, also
writes enlarged PNG previews of every sprite and the font (needs Pillow,
which is optional and only used for previews).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
SRC = os.path.join(ROOT, "src")

TEAM_LEGEND = {".": 0, "K": 1, "S": 2, "s": 3, "J": 4, "j": 5, "P": 6, "W": 7,
               "H": 8, "h": 9, "M": 10, "B": 11, "D": 12, "G": 13}
MISC_LEGEND = {".": 0, "K": 1, "b": 2, "l": 3, "W": 4, "Y": 5, "U": 6, "G": 7,
               "R": 8, "D": 9, "O": 10, "g": 11, "y": 12, "d": 13, "E": 14, "e": 15}

# Preview palettes (RGB) - only used for PNG previews.
TEAM_PREVIEW = [(0, 0, 0), (16, 16, 24), (232, 176, 128), (184, 128, 88),
                (200, 40, 40), (136, 24, 24), (240, 240, 240), (255, 255, 255),
                (200, 40, 40), (255, 160, 160), (150, 150, 150), (24, 24, 24),
                (40, 90, 40), (250, 200, 40), (0, 0, 0), (0, 0, 0)]
MISC_PREVIEW = [(0, 0, 0), (40, 20, 8), (140, 70, 30), (190, 120, 70), (255, 255, 255),
                (255, 230, 40), (60, 120, 255), (40, 220, 60), (230, 40, 40),
                (20, 40, 20), (255, 140, 0), (230, 180, 30), (255, 240, 140),
                (160, 110, 10), (150, 150, 160), (80, 80, 90)]


def parse_font(path):
    glyphs = {}
    cur = None
    rows = []
    for line in open(path):
        line = line.rstrip("\n")
        if line.startswith("#") and cur is None or (line.startswith("#") and len(line) > 5):
            continue
        if line.startswith("'"):
            if cur is not None:
                glyphs[cur] = rows
            name = line[1:]
            if name == "SPACE":
                cur = " "
            elif name == "DEL":
                cur = chr(127)
            else:
                cur = name[0]
            rows = []
            continue
        if cur is not None and line.strip():
            rows.append(line.strip())
    if cur is not None:
        glyphs[cur] = rows
    return glyphs


def font_tiles(glyphs):
    """Return list of 96 8x8 pixel grids (chars 32..127)."""
    out = []
    for code in range(32, 128):
        g = glyphs.get(chr(code), [])
        pix = [[0] * 8 for _ in range(8)]
        for y, row in enumerate(g[:8]):
            assert len(row) == 5, "glyph %r row %r" % (chr(code), row)
            for x, ch in enumerate(row):
                if ch == "#":
                    pix[y][x + 1] = 1
        # drop shadow
        shadow = [[0] * 8 for _ in range(8)]
        for y in range(8):
            for x in range(8):
                if pix[y][x] == 1:
                    for dx, dy in ((1, 0), (0, 1), (1, 1)):
                        nx, ny = x + dx, y + dy
                        if nx < 8 and ny < 8 and pix[ny][nx] == 0:
                            shadow[ny][nx] = 2
        for y in range(8):
            for x in range(8):
                if pix[y][x] == 0 and shadow[y][x]:
                    pix[y][x] = 2
        out.append(pix)
    return out


def parse_sprites(path):
    sprites = []
    cur = None
    for line in open(path):
        line = line.rstrip("\n")
        if line.startswith("#"):
            continue
        if line.startswith("="):
            parts = line[1:].split()
            name = parts[0]
            w, h = [int(v) for v in parts[1].split("x")]
            pal = parts[2] if len(parts) > 2 else "team"
            cur = {"name": name, "w": w, "h": h, "pal": pal, "rows": []}
            sprites.append(cur)
            continue
        if cur is not None and line.strip() and len(cur["rows"]) < cur["h"]:
            row = line.strip()
            if len(row) != cur["w"]:
                raise SystemExit("sprite %s row %d has width %d (want %d): %r" %
                                 (cur["name"], len(cur["rows"]), len(row), cur["w"], row))
            cur["rows"].append(row)
    for s in sprites:
        if len(s["rows"]) != s["h"]:
            raise SystemExit("sprite %s has %d rows (want %d)" % (s["name"], len(s["rows"]), s["h"]))
    return sprites


def sprite_pixels(s):
    legend = TEAM_LEGEND if s["pal"] == "team" else MISC_LEGEND
    pix = []
    for row in s["rows"]:
        r = []
        for ch in row:
            if ch not in legend:
                raise SystemExit("sprite %s: unknown char %r" % (s["name"], ch))
            r.append(legend[ch])
        pix.append(r)
    return pix


def tiles_from_pixels(pix, w, h):
    """1D-mapped tile order: row of tiles, left to right, top to bottom."""
    words = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            for y in range(8):
                v = 0
                for x in range(8):
                    v |= (pix[ty * 8 + y][tx * 8 + x] & 15) << (4 * x)
                words.append(v)
    return words


def tile_words(pix8):
    words = []
    for y in range(8):
        v = 0
        for x in range(8):
            v |= (pix8[y][x] & 15) << (4 * x)
        words.append(v)
    return words


def note_table():
    # GBA PSG rate for MIDI notes 0..127: rate = 2048 - 131072 / f
    out = []
    for n in range(128):
        f = 440.0 * 2 ** ((n - 69) / 12.0)
        rate = int(round(2048 - 131072.0 / f))
        out.append(max(0, min(2047, rate)))
    return out


def main():
    preview_dir = None
    if "--preview" in sys.argv:
        preview_dir = sys.argv[sys.argv.index("--preview") + 1]

    glyphs = parse_font(os.path.join(ASSETS, "font.txt"))
    ftiles = font_tiles(glyphs)
    sprites = parse_sprites(os.path.join(ASSETS, "sprites.txt"))

    h_lines = ["/* Generated by tools/gen_assets.py - do not edit. */",
               "#ifndef GEN_ASSETS_H", "#define GEN_ASSETS_H", '#include "types.h"',
               "extern const u32 font_tiles[96 * 8];",
               "extern const u16 note_rates[128];"]
    c_lines = ["/* Generated by tools/gen_assets.py - do not edit. */",
               '#include "gen_assets.h"', "",
               "const u32 font_tiles[96 * 8] = {"]
    for t in ftiles:
        c_lines.append("    " + ", ".join("0x%08X" % w for w in tile_words(t)) + ",")
    c_lines.append("};")
    c_lines.append("")
    c_lines.append("const u16 note_rates[128] = {")
    nt = note_table()
    for i in range(0, 128, 16):
        c_lines.append("    " + ", ".join(str(v) for v in nt[i:i + 16]) + ",")
    c_lines.append("};")

    for s in sprites:
        pix = sprite_pixels(s)
        words = tiles_from_pixels(pix, s["w"], s["h"])
        ntiles = len(words) // 8
        cname = "spr_" + s["name"]
        h_lines.append("extern const u32 %s[%d];" % (cname, len(words)))
        h_lines.append("#define %s_TILES %d" % (cname.upper(), ntiles))
        c_lines.append("")
        c_lines.append("const u32 %s[%d] = {" % (cname, len(words)))
        for i in range(0, len(words), 8):
            c_lines.append("    " + ", ".join("0x%08X" % w for w in words[i:i + 8]) + ",")
        c_lines.append("};")
    h_lines.append("#endif")

    with open(os.path.join(SRC, "gen_assets.h"), "w") as f:
        f.write("\n".join(h_lines) + "\n")
    with open(os.path.join(SRC, "gen_assets.c"), "w") as f:
        f.write("\n".join(c_lines) + "\n")
    print("gen_assets: %d glyphs, %d sprites" % (len(ftiles), len(sprites)))

    if preview_dir:
        try:
            from PIL import Image
        except ImportError:
            print("Pillow not installed; skipping previews")
            return
        os.makedirs(preview_dir, exist_ok=True)
        scale = 4
        # sprite sheet
        total_w = sum(s["w"] + 4 for s in sprites)
        img = Image.new("RGB", (min(total_w, 600) * scale, 400 * scale), (60, 130, 60))
        x = y = 0
        rowh = 0
        for s in sprites:
            pal = TEAM_PREVIEW if s["pal"] == "team" else MISC_PREVIEW
            if x + s["w"] > 600:
                x = 0
                y += rowh + 4
                rowh = 0
            pix = sprite_pixels(s)
            for py in range(s["h"]):
                for px in range(s["w"]):
                    v = pix[py][px]
                    if v:
                        for dy in range(scale):
                            for dx in range(scale):
                                img.putpixel(((x + px) * scale + dx, (y + py) * scale + dy), pal[v])
            x += s["w"] + 4
            rowh = max(rowh, s["h"])
        img = img.crop((0, 0, img.width, (y + rowh + 4) * scale))
        img.save(os.path.join(preview_dir, "sprites.png"))
        # font sheet
        fimg = Image.new("RGB", (16 * 8 * scale, 6 * 8 * scale), (20, 30, 80))
        for i, t in enumerate(ftiles):
            gx, gy = (i % 16) * 8, (i // 16) * 8
            for py in range(8):
                for px in range(8):
                    v = t[py][px]
                    if v:
                        c = (255, 255, 255) if v == 1 else (0, 0, 0)
                        for dy in range(scale):
                            for dx in range(scale):
                                fimg.putpixel(((gx + px) * scale + dx, (gy + py) * scale + dy), c)
        fimg.save(os.path.join(preview_dir, "font.png"))
        print("previews written to", preview_dir)


if __name__ == "__main__":
    main()
