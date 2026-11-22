# Готує файли для автопублікації з адмінки: JPEG і відео у public/social та public/social/posts.json.
# Підписи беруться з captions.md за номером розділу («## 8. …»); сторіс підпису не мають. Запуск: python3 marketing/instagram/prep-social.py
import re, json, glob, os, shutil, subprocess
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '../..'))
OUT = os.path.join(HERE, 'out'); DST = os.path.join(ROOT, 'public/social'); os.makedirs(DST, exist_ok=True)
# (розділ captions.md, id, тип, імена файлів без розширення, коротка назва для адмінки)
POSTS = [
 (1, 'brand', 'IMAGE', '01-brand-post', 'Знайомство з брендом'), (22, 'reel4', 'REELS', 'reel-ab', 'Reel «A чи B?»'),
 (3, 'how', 'CAROUSEL', '03-carousel-how', 'Карусель «Як це працює»'), (10, 'poll', 'IMAGE', '10-poll-evening', 'Опитування «Який вечір ваш?»'),
 (2, 'reel', 'REELS', '02-reel', 'Reel «Одне вікно»'), (8, 'window4', 'CAROUSEL', '08-window-four', 'Карусель «Одне вікно: чотири сюрпризи»'),
 (11, 'dinner', 'IMAGE', '11-dinner-for-two', 'Вечеря вдвох — теж подарунок'), (23, 'reel5', 'REELS', 'reel-windows', 'Reel «Вікно за вікном»'),
 (4, 'couple', 'IMAGE', '04-couple-illustration', 'Ваша історія. Ваш адвент'), (16, 'game5', 'CAROUSEL', '16-game-rules', 'Карусель «5 правил настільного вечора»'),
 (5, 'calendar', 'IMAGE', '05-calendar-24', '24 вікна: який відкриєте першим'), (15, 'reel3', 'REELS', 'reel-one-day', 'Reel «Один день у ReeAdvent»'),
 (19, 'spa', 'IMAGE', '19-spa-checklist', 'Чекліст «Спа-вечір вдома»'), (6, 'questions', 'CAROUSEL', '06-carousel-questions', 'Карусель «5 питань»'),
 (17, 'duel', 'IMAGE', '17-duel-game-or-movie', 'Дуель «Гра чи кіно?»'), (14, 'reel2', 'REELS', 'reel-5-evenings', 'Reel «5 вечорів для двох»'),
 (18, 'wrap', 'IMAGE', '18-two-boxes', 'Дві коробки, один секрет'), (9, 'evenings5', 'CAROUSEL', '09-evenings-five', 'Карусель «5 зимових вечорів удвох»'),
 (20, 'market', 'IMAGE', '20-market-idea', 'Ідея: глінтвейн на ярмарку'), (12, 'play', 'IMAGE', '12-play', 'Дозвольте собі побешкетувати'),
 (21, 'week', 'IMAGE', '21-week-planner', 'Планер «Тиждень вечорів удвох»'), (7, 'evenings', 'IMAGE', '07-bonus-evenings', 'Вечори, які хочеться повторити'),
 (13, 'stars', 'IMAGE', '13-starry-night', 'Зоряна ніч')]
# головна сцена допису (None: кілька сцен або без сцени): адмінка попереджає, якщо дві однакові стоять поруч
SCENE = {'brand': 'art', 'how': 'art', 'reel': 'art', 'couple': 'art', 'questions': 'art', 'dinner': 'pasta', 'game5': 'game', 'duel': 'game', 'spa': 'spa', 'wrap': 'wrap', 'market': 'market', 'play': 'pillow', 'stars': 'stars',
         'story1': 'tree', 'story2': 'tree', 'story3': 'book', 'story4': 'stars', 'story5': 'pillow', 'story6': 'tree', 'story7': 'movie', 'story9': 'market', 'story10': 'game', 'story11': 'spa'}
STORIES = [('story1', 'STORY', 'story-1-start', 'Сторіс: старт 1 грудня'), ('story3', 'STORY', 'story-3-question', 'Сторіс: питання дня'), ('story8', 'STORY', 'story-8-dice', 'Сторіс: киньте кубик'),
           ('story7', 'STORY', 'story-7-ticket', 'Сторіс: квиток на кіновечір'), ('story2', 'STORY', 'story-2-choose', 'Сторіс: що обираєте на вечір?'), ('story9', 'STORY', 'story-9-recipe', 'Сторіс: рецепт глінтвейну'),
           ('story4', 'STORY', 'story-4-stars', 'Сторіс: зоряна ніч'), ('story10', 'STORY', 'story-10-prompt', 'Сторіс: закінчіть речення'), ('story11', 'STORY', 'story-11-forecast', 'Сторіс: прогноз на вечір'),
           ('story5', 'STORY', 'story-5-play', 'Сторіс: гра на вечір'), ('storyvid', 'STORY_VIDEO', 'story-video', 'Сторіс-відео: 24 вікна для двох'), ('story6', 'STORY', 'story-6-order', 'Сторіс: замовити')]
text = open(os.path.join(HERE, 'captions.md'), encoding='utf-8').read()
secs = {int(m.group(1)): m.group(0) for m in re.finditer(r'^## (\d+)\..*?(?=^## |\Z)', text, re.S | re.M)}
def cap(sec):
    ua = re.search(r'\*\*Підпис \(UA\):\*\*\s*(.*?)\n\s*\*\*Caption \(EN\):\*\*', sec, re.S).group(1).strip()
    en = re.search(r'\*\*Caption \(EN\):\*\*\s*(.*?)\n\s*\*\*(?:CTA|Хештеги):\*\*', sec, re.S).group(1).strip()
    ht = re.sub(r'\(.*?\)', '', re.search(r'\*\*Хештеги:\*\*\s*(.*)', sec).group(1)).replace('#giveaway', '').strip()
    ua = re.sub(r'\n+Посилання в шапці профілю\.?', '', ua); en = re.sub(r'\n+Link in bio\.?', '', en)
    m = re.search(r'\*\*CTA:\*\*\s*(.+?)\s*\|\s*(.+)', sec)
    cta = f'{m.group(1).strip()} · {m.group(2).strip()}' if m else 'Посилання в шапці профілю · Link in bio'
    return f'{ua}\n\n{en}\n\n{cta}\n\n{ht}'
def video(src, dst):
    # у репозиторії зберігаємо легшу версію (CRF 24): Instagram однаково перекодовує відео
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', dst])
    if r.returncode != 0: shutil.copy(src, dst)
def jpg(src, dst):
    Image.open(src).convert('RGB').save(dst, quality=88, optimize=True)
def files_for(stem):
    one = os.path.join(OUT, stem + '.png')
    if os.path.exists(one): return [one]
    return sorted(glob.glob(os.path.join(OUT, stem + '-[0-9]*.png')), key=lambda p: int(re.search(r'-(\d+)\.png$', p).group(1)))
man = []
for num, id_, typ, stem, title in POSTS:
    if num not in secs: print('нема розділу', num); continue
    entry = {'id': id_, 'type': typ, 'title': title, 'caption': cap(secs[num]), 'cover': None, 'scene': SCENE.get(id_)}
    if typ == 'REELS':
        video(os.path.join(OUT, stem + '.mp4'), os.path.join(DST, stem + '.mp4')); entry['files'] = [stem + '.mp4']
        cov = os.path.join(OUT, stem + '-cover.jpg') if os.path.exists(os.path.join(OUT, stem + '-cover.jpg')) else os.path.join(OUT, '02-reel-cover.jpg')
        shutil.copy(cov, os.path.join(DST, stem + '-cover.jpg')); entry['cover'] = stem + '-cover.jpg'
    else:
        names = []
        for f in files_for(stem):
            n = os.path.basename(f)[:-4] + '.jpg'; jpg(f, os.path.join(DST, n)); names.append(n)
        entry['files'] = names
    man.append(entry)
for id_, typ, stem, title in STORIES:
    entry = {'id': id_, 'type': typ, 'title': title, 'caption': '', 'cover': None, 'scene': SCENE.get(id_)}
    if typ == 'STORY_VIDEO':
        video(os.path.join(OUT, stem + '.mp4'), os.path.join(DST, stem + '.mp4')); shutil.copy(os.path.join(OUT, stem + '-cover.jpg'), os.path.join(DST, stem + '-cover.jpg'))
        entry['files'] = [stem + '.mp4']; entry['cover'] = stem + '-cover.jpg'
    else:
        n = stem + '.jpg'; jpg(os.path.join(OUT, stem + '.png'), os.path.join(DST, n)); entry['files'] = [n]
    man.append(entry)
json.dump(man, open(os.path.join(DST, 'posts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for m in man: print(m['id'], m['type'], len(m['files']), len(m['caption']))
print('public/social:', round(sum(os.path.getsize(f) for f in glob.glob(DST + '/*')) / 1e6, 1), 'МБ')

# сцени для шаблонів зображень в адмінці (пропозиції агента): public/social/scenes/s-<назва>.jpg, 1080 px
SC = os.path.join(DST, 'scenes'); os.makedirs(SC, exist_ok=True)
for n in ['tree', 'pasta', 'pillow', 'book', 'stars', 'game', 'wrap', 'spa', 'market', 'movie']:
    src = os.path.join(HERE, 'assets', f's-{n}.jpg')
    if os.path.exists(src): Image.open(src).convert('RGB').resize((1080, 1080), Image.LANCZOS).save(os.path.join(SC, f's-{n}.jpg'), quality=84, optimize=True)
