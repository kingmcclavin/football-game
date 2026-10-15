#!/usr/bin/env python3
"""Convert PPM screenshots from mgba_runner to 2x PNGs (needs Pillow)."""
import sys, glob, os
from PIL import Image
for d in sys.argv[1:]:
    for f in glob.glob(os.path.join(d, "*.ppm")):
        Image.open(f).resize((480, 320), Image.NEAREST).save(f[:-4] + ".png")
        os.remove(f)
