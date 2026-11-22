# Заготовки фону: маленькі розмиті й затемнені версії сцен (швидше за CSS-blur у кожному кадрі відео). Запуск: python3 prep-assets.py
from PIL import Image, ImageFilter, ImageEnhance
import os
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
for n in ['tree', 'pasta', 'pillow', 'book', 'stars', 'game', 'wrap', 'spa', 'market', 'movie']:
    im = Image.open(os.path.join(A, f's-{n}.jpg')).convert('RGB').resize((96, 96), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4))
    im = ImageEnhance.Brightness(im).enhance(0.58); im = ImageEnhance.Color(im).enhance(1.25)
    im.save(os.path.join(A, f'b-{n}.jpg'), quality=88); print('b-' + n)
