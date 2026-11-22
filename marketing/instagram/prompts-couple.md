# Промпти для ілюстрацій пар у стилі мультфільмів (Pixar / Disney)

Мультфільмового реалізму не можна намалювати кодом: його генерують нейромережі для зображень.
Підійдуть **Midjourney**, **ChatGPT (генерація зображень)**, **Adobe Firefly** (найбезпечніший для комерційного використання), **Leonardo**, **Ideogram**.

**Куди класти результат:** збережіть картинку як `marketing/instagram/assets/couple-art.png` (формат 4:5, мінімум 1080×1350) і запустіть `ONLY=04 node marketing/instagram/build.mjs`: скрипт сам додасть темну смугу знизу та підпис «Ваша історія. Ваш адвент.». Або просто надішліть картинку мені в чат, я вставлю.

**Права:** перед комерційним використанням перевірте умови вашого тарифу (Midjourney потребує платного плану, Firefly навчений на ліцензованих даних, ChatGPT дає вам права на згенероване). Не вставляйте у промпт імена реальних людей і назви чужих персонажів.

---

## 1. Головна сцена (картка №4)

**Prompt (English, працює найкраще):**
```
Pixar-style 3D animated movie still of a happy young couple sitting close together on a cozy sofa in front of a tall arched window, snowing outside, a decorated Christmas tree glowing warmly behind the window, string fairy lights above. The woman has long wavy chestnut hair and wears a cream chunky cable-knit sweater; the man has short dark hair, light stubble and wears a forest-green knit sweater. Their heads are tilted together, eyes closed, both laughing joyfully, big warm smiles, rosy cheeks. Expressive detailed faces, soft subsurface skin scattering, detailed knit texture, golden rim lighting from the window, volumetric light, shallow depth of field, soft bokeh lights, cinematic warm color palette (amber, deep teal-black shadows), cozy winter evening, vertical 4:5 composition, upper two thirds filled by the scene, the bottom 20% darker and calm for text overlay, high detail, no text, no watermark
```
**Negative / що виключити:** `text, watermark, logo, photorealistic, uncanny valley, deformed hands, extra fingers, distorted face, blurry, low quality`

**Midjourney:** додайте в кінець `--ar 4:5 --style raw` (і за потреби `--stylize 250`).
**ChatGPT / Firefly:** оберіть вертикальне співвідношення 4:5 (або 3:4) і вставте текст без параметрів.

---

## 2. Інші сцени для наступних публікацій (ті самі персонажі)

Щоб персонажі лишалися схожими, у кожному промпті повторюйте опис: «woman with long wavy chestnut hair, cream cable-knit sweater; man with short dark hair, light stubble, forest-green knit sweater». У Midjourney додавайте `--cref` із посиланням на першу вдалу картинку.

1. **Відкривають вікно календаря:** `... the couple sitting on the floor by the Christmas tree opening a glowing golden numbered paper window of a handmade advent calendar, curious joyful faces, golden light on their faces ...`
2. **Гарячий шоколад:** `... the couple wrapped in one blanket holding two steaming mugs, snow falling behind a window, fairy lights, relaxed happy smiles ...`
3. **Прогулянка зимовим містом:** `... walking hand in hand on a snowy old-town street at dusk, warm lantern lights, cosy scarves, laughing, light snowfall, cinematic ...`
4. **Подарунок:** `... the woman surprised and delighted holding a small wrapped gift with a gold ribbon, the man smiling proudly beside her, warm Christmas tree lights ...`
5. **Вечір із питаннями:** `... the couple at a candlelit dinner table, leaning toward each other, talking and smiling, a small card with a question between them, warm romantic lighting ...`

(До кожного додавайте спільний стильовий хвіст: `Pixar-style 3D animated movie still, expressive detailed faces, soft subsurface skin scattering, golden rim lighting, shallow depth of field, cozy warm palette, vertical 4:5, no text, no watermark`.)
