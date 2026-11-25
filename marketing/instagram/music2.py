# Музика для рекламних роликів (синтез з нуля, без сторонніх прав): ударні, бас, акорди, бубонці, мелодія.
# python3 music2.py out.wav <тривалість> <стиль> [удари через кому, с]   стилі: pop (святковий поп), lofi (теплий), cine (кінематографічний)
# Темп 100 BPM: склейки ролика стоять на долях. «Удари» — акценти на ключових моментах (відкриття дверцят, заклик).
import sys, numpy as np, wave
out, dur, style = sys.argv[1], float(sys.argv[2]), sys.argv[3]; hits = [float(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 and sys.argv[4] else []
sr = 44100; n = int(dur * sr); t = np.arange(n) / sr; L = np.zeros(n); R = np.zeros(n); rng = np.random.default_rng(7)
BPM = 100; beat = 60 / BPM; bar = 4 * beat
fr = lambda m: 440 * 2 ** ((m - 69) / 12)
def add(sig, start, pan=0.0, amp=1.0):
    i0 = int(start * sr); m = min(len(sig), n - i0)
    if m <= 0 or i0 < 0: return
    L[i0:i0+m] += sig[:m] * amp * (1 - max(0, pan)); R[i0:i0+m] += sig[:m] * amp * (1 + min(0, pan))
def env(m, a=.005, d=.3):
    tt = np.arange(m) / sr; return np.minimum(1, tt / max(a, 1e-4)) * np.exp(-tt / d)
def kick(a=1):
    m = int(.38 * sr); tt = np.arange(m) / sr; f = 48 + 90 * np.exp(-tt * 28); ph = 2 * np.pi * np.cumsum(f) / sr
    return a * np.sin(ph) * np.exp(-tt * 7.5)
def snare(a=1):
    m = int(.25 * sr); tt = np.arange(m) / sr; nz = rng.standard_normal(m); nz = nz - np.convolve(nz, np.ones(6) / 6, 'same')
    return a * (.55 * nz * np.exp(-tt * 16) + .35 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 22))
def clap(a=1):
    m = int(.22 * sr); tt = np.arange(m) / sr; nz = rng.standard_normal(m); nz = nz - np.convolve(nz, np.ones(4) / 4, 'same')
    e = sum(np.exp(-np.clip(tt - o, 0, None) * 60) * (tt >= o) for o in (0, .011, .022)) * .5 + np.exp(-tt * 14) * (tt >= .03)
    return a * nz * e * .5
def hat(a=1, open_=False):
    m = int((.18 if open_ else .05) * sr); nz = rng.standard_normal(m); hp = nz - np.convolve(nz, np.ones(3) / 3, 'same')
    return a * hp * env(m, .001, .06 if open_ else .012)
def bells(a=1):   # бубонці: кілька коротких металевих дзвіночків
    m = int(.16 * sr); tt = np.arange(m) / sr; s = np.zeros(m)
    for f0 in (5200, 6900, 8300): s += np.sin(2 * np.pi * f0 * tt + rng.random() * 6) * np.exp(-tt * (30 + rng.random() * 20))
    nz = rng.standard_normal(m); s += .4 * (nz - np.convolve(nz, np.ones(2) / 2, 'same')) * np.exp(-tt * 45)
    return a * s * .35
def tone(f, length, kind='piano', a=1):
    m = int(length * sr); tt = np.arange(m) / sr
    if kind == 'piano': s = np.sin(2*np.pi*f*tt) + .5*np.sin(4*np.pi*f*tt)*np.exp(-tt*4) + .25*np.sin(6*np.pi*f*tt)*np.exp(-tt*7); e = env(m, .003, .55)
    elif kind == 'bell': s = np.sin(2*np.pi*f*tt) + .4*np.sin(2*np.pi*2.76*f*tt)*np.exp(-tt*6) + .2*np.sin(2*np.pi*5.4*f*tt)*np.exp(-tt*12); e = env(m, .002, .7)
    elif kind == 'rhodes': s = (np.sin(2*np.pi*f*tt + .9*np.sin(2*np.pi*f*tt)*np.exp(-tt*3))) * (1 + .12*np.sin(2*np.pi*5*tt)); e = env(m, .004, 1.1)
    elif kind == 'bass': s = np.sin(2*np.pi*f*tt) + .3*np.sin(4*np.pi*f*tt); e = np.minimum(1, tt/.008) * np.minimum(1, (length - tt)/.05).clip(0, 1)
    elif kind == 'pad': s = sum(np.sin(2*np.pi*f*d*tt + k) for k, d in enumerate((1, 1.004, .996, 2.002))) / 3; e = np.minimum(1, tt/.6) * np.minimum(1, (length - tt)/.8).clip(0, 1)
    elif kind == 'str': ph = (f*tt) % 1; s = (2*ph - 1); s = np.convolve(s, np.ones(18)/18, 'same'); e = np.minimum(1, tt/.04) * np.minimum(1, (length - tt)/.06).clip(0, 1)
    return a * s * e
def riser(length, a=1):
    m = int(length * sr); tt = np.arange(m) / sr; nz = rng.standard_normal(m); hp = nz - np.convolve(nz, np.ones(3)/3, 'same')
    return a * hp * (tt / length) ** 2 * .5
def boom(a=1):
    m = int(1.8 * sr); tt = np.arange(m) / sr; f = 40 + 60 * np.exp(-tt * 9); s = np.sin(2*np.pi*np.cumsum(f)/sr) * np.exp(-tt * 2.2)
    nz = rng.standard_normal(m); s += .25 * np.convolve(nz, np.ones(40)/40, 'same') * np.exp(-tt * 3)
    return a * s
PROG = {'pop': [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [60, 64, 69]), (41, [60, 65, 69])],     # C G Am F
        'lofi': [(41, [57, 60, 64, 65]), (40, [55, 59, 62, 64]), (38, [53, 57, 60, 62]), (36, [52, 55, 59, 60])],   # Fmaj7 Em7 Dm7 Cmaj7
        'cine': [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]}      # Am F C G
MEL = {'pop': [[76, 79, 81, 79, 76, 74, 72, None], [74, 76, 79, None, 74, 71, 67, None], [72, 76, 81, 84, 81, 79, 76, None], [77, 76, 74, 72, 74, None, 72, None]]}
intro = hits[0] if hits else 2 * bar   # до першого удару — тихіший вступ
nb = int(dur / bar) + 2
for b in range(nb):
    st = b * bar; root, ch = PROG[style][b % 4]; inIntro = st < intro - .01; last = st + bar > dur - 1.2
    if style == 'pop':
        for c in ch: add(tone(fr(c), bar * .95, 'pad', .05), st, 0)
        for k in range(8):   # акорди-«стабами» на слабкі восьмі
            if k % 2 == 1 and not inIntro:
                for j, c in enumerate(ch): add(tone(fr(c + 12), .35, 'piano', .06), st + k * beat / 2, (j - 1) * .3)
        for k in range(16): add(bells(.38 if k % 4 == 2 else .2), st + k * beat / 4, .35)
        if not inIntro:
            for k in range(4):
                add(kick(.9), st + k * beat); add(clap(.55), st + k * beat, -.1) if k in (1, 3) else None
                add(tone(fr(root - 12), beat * .45, 'bass', .32), st + k * beat); add(tone(fr(root), beat * .3, 'bass', .14), st + k * beat + beat / 2)
            for k, m in enumerate(MEL['pop'][b % 4]):
                if m is not None: add(tone(fr(m + 12), .6, 'bell', .13), st + k * beat / 2, .15)
        else:
            for k, m in enumerate(MEL['pop'][b % 4][::2]):
                if m is not None: add(tone(fr(m + 12), 1.2, 'bell', .12), st + k * beat, .15)
    elif style == 'lofi':
        sw = beat / 2 * .16   # свінг
        for j, c in enumerate(ch): add(tone(fr(c), bar * 1.02, 'rhodes', .07), st + j * .012, (j - 1.5) * .2)
        add(tone(fr(ch[-1] + 12), bar * .5, 'rhodes', .035), st + beat * 2.5, .3)
        if not inIntro:
            for k in range(4):
                if k in (0, 2): add(kick(.75), st + k * beat + (beat / 2 + sw if k == 2 else 0) * (1 if k == 2 and b % 2 else 0))
                if k in (1, 3): add(snare(.38), st + k * beat, -.05)
                add(tone(fr(root - 12), beat * .8, 'bass', .3), st + k * beat) if k in (0, 2) else None
            for k in range(8): add(hat(.16 if k % 2 else .22), st + k * beat / 2 + (sw if k % 2 else 0), .25)
        for k in range(8):
            if k in (1, 3, 6): add(bells(.18), st + k * beat / 2, .4)
    else:   # cine
        for c in ch: add(tone(fr(c - 12), bar, 'pad', .06), st, 0)
        if inIntro:
            for k, c in enumerate(ch + [ch[1] + 12]): add(tone(fr(c + 24), 1.4, 'bell', .1), st + k * beat, (k - 1.5) * .2)
        else:
            for k in range(8): add(tone(fr(ch[k % 3] + (12 if k % 4 == 3 else 0)), beat / 2 * .9, 'str', .09), st + k * beat / 2, (k % 2 - .5) * .5)
            add(tone(fr(root - 24), bar, 'bass', .28), st)
            for k in range(4): add(kick(.7 if k == 0 else .45), st + k * beat); add(snare(.25), st + k * beat + beat / 2, 0) if k == 3 else None
            for k in range(8): add(hat(.1), st + k * beat / 2, .3)
            add(bells(.3), st + beat * 2, .4)
for h in hits:   # акценти: наростання → удар → бубонці
    add(riser(min(1.2, h), .35), h - min(1.2, h)); add(boom(.85 if style != 'lofi' else .5), h); add(clap(.5), h); add(tone(fr(84), 2.5, 'bell', .12), h, .2); add(tone(fr(88), 2.5, 'bell', .08), h + .02, -.2)
# фінальний акорд
add(tone(fr(PROG[style][0][1][0] + 12), 2.2, 'piano' if style != 'lofi' else 'rhodes', .12), max(0, dur - 2.2))
mix = np.stack([L, R], 1)
mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 1.6) / np.tanh(1.6)   # м'яка компресія
fade = (np.minimum(1, t / .25) * np.minimum(1, (dur - t) / 1.2).clip(0, 1))[:, None]; mix *= fade * .85
w = wave.open(out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((mix * 32767).astype('<i2').tobytes()); w.close()
