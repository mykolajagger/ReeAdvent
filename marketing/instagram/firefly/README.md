# Adobe Firefly: ілюстрація щасливої пари (мультфільмовий стиль)

## Файли для завантаження в Firefly
- `1-composition.png` — **Reference → Composition** (схема: арочне вікно, дві голови поруч, ялинка, гірлянда). Задає розташування, а не стиль.
- `2-style-palette.png` — **Reference → Style** (тепле світло, боке, палітра бренду).
- `3-our-illustration-for-mood.png`, `4-brand-logo-mood.png` — запасні референси настрою (використовуйте, лише якщо результат не вловлює темну золоту гаму; не ставте їх як Style, якщо виходить «плоский вектор»).

## Кроки
1. Відкрийте [firefly.adobe.com](https://firefly.adobe.com) і увійдіть (Adobe ID). Оберіть **Text to image** («Текст у зображення»).
2. Вставте **Prompt** (нижче).
3. Права панель (Settings):
   - **Model:** остання **Firefly Image** (чим новіша версія, тим кращі обличчя).
   - **Aspect ratio:** **Portrait 3:4** (потім у нас підріжеться до 4:5).
   - **Content type:** **Art** (не Photo).
   - **Effects:** обрати **3D** (якщо є ще «Cartoon/Animation», можна поєднати).
   - **Color and tone:** *Warm tone*; **Lighting:** *Backlighting* або *Golden hour*; **Composition:** *Medium shot*.
4. **Reference**: натисніть «Upload» у розділі **Composition** → `1-composition.png`, ступінь (Strength) **~50–60 %**. Розділ **Style** → `2-style-palette.png`, **~35–50 %**.
5. У полі **Exclude** (виключити) вставте: `text, watermark, logo, deformed hands, extra fingers, distorted face, photorealistic, uncanny, low quality`.
6. **Generate**. Вийде 4 варіанти. Обирайте той, де обличчя чіткі й усміхнені. Натискайте **Generate similar** на найкращому, щоб отримати споріднені.
7. Якщо щось не так (руки, очі): **Generative Fill** → виділіть ділянку → опишіть словами, що має бути.
8. **Download** → PNG. Збережіть як `marketing/instagram/assets/couple-art.png` або надішліть мені в чат, і я вставлю картинку в картку з підписом.

## Prompt (вставити як є)
```
Pixar-style 3D animated movie still: a happy young couple sitting close together on a sofa in front of a tall arched window, snow falling outside, a glowing decorated Christmas tree behind the window, warm string fairy lights above. The woman has long wavy chestnut hair and a cream chunky knit sweater; the man has short dark hair, light stubble and a forest-green knit sweater. Their heads are tilted together, eyes closed, laughing joyfully, rosy cheeks. Expressive detailed faces, golden rim light from the window, soft bokeh, cozy warm palette, vertical composition, calm darker area at the bottom.
```

## Якщо результат не той
- **Надто «вектор»/плоский:** зменшіть Style до 20–30 % або приберіть, збільште у промпті «3D animated movie still, volumetric light, subsurface skin».
- **Обличчя неприродні:** додайте «natural proportions, friendly expressive eyes»; зменште Composition до 40 %.
- **Не схоже на пару:** перемкніть Content type на *Art* і посильте «two people close together, heads touching».
- **Тло надто темне/світле:** уточніть «warm amber light, deep teal-black shadows».
