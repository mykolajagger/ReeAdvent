"""Вирізає людей із фото (прибирає фон) і зберігає прозорий PNG для картки з парою.
Використання: python marketing/instagram/cutout.py фото.jpg   ->  marketing/instagram/assets/couple.png
Потрібно: pip install rembg onnxruntime pillow (модель завантажується автоматично при першому запуску)."""
import sys, os
from PIL import Image
from rembg import remove
src = sys.argv[1]; out = os.path.join(os.path.dirname(__file__), 'assets', 'couple.png'); os.makedirs(os.path.dirname(out), exist_ok=True)
im = Image.open(src).convert('RGBA'); im.thumbnail((1600, 1600))
cut = remove(im)
bbox = cut.getbbox()
if bbox: cut = cut.crop(bbox)
cut.save(out); print('збережено', out, cut.size)
