# Власна коротка музична тема для Reel (синтез, без сторонніх прав): музична скринька й м'які акорди. Використання: python3 music.py out.wav 21 [a|b|c|d]
#  a: спокійна C–Am–F–G, 76 BPM · b: світліша G–D–Em–C, 92 BPM, з простою мелодією · c: грайлива C–F–G–Am, 112 BPM, короткі ноти · d: мрійлива Dm–Bb–F–C, 62 BPM, повільні дзвіночки
import sys, numpy as np, wave
dur = float(sys.argv[2]) if len(sys.argv) > 2 else 21; theme = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] in 'abcd' else 'a'; sr = 44100; n = int(dur * sr); t = np.arange(n) / sr
mix = np.zeros(n)
def note(f, start, length, amp, kind='bell'):
    i0 = int(start * sr); m = min(int(length * sr), n - i0)
    if m <= 0: return
    tt = np.arange(m) / sr
    if kind == 'bell': w = np.sin(2*np.pi*f*tt) + .35*np.sin(2*np.pi*2*f*tt)*np.exp(-tt*5) + .12*np.sin(2*np.pi*3.01*f*tt)*np.exp(-tt*9); env = np.exp(-tt*2.6)*np.minimum(1, tt*400)
    else: w = np.sin(2*np.pi*f*tt) + .4*np.sin(2*np.pi*2*f*tt) + .2*np.sin(2*np.pi*f*1.003*tt); env = np.minimum(1, tt/1.2)*np.minimum(1, (length - tt)/1.5).clip(0, 1)
    mix[i0:i0+m] += amp * w * env
fr = lambda midi: 440 * 2 ** ((midi - 69) / 12)
up = lambda ch: [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]
THEMES = {
    'a': dict(bpm=76, chords=[(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [59, 62, 67])], arp=up, mel=None, alen=1.6),
    'b': dict(bpm=92, chords=[(43, [55, 59, 62]), (50, [57, 62, 66]), (40, [55, 59, 64]), (48, [55, 60, 64])], arp=lambda ch: [ch[0], ch[2], ch[1] + 12, ch[2], ch[0] + 12, ch[2], ch[1] + 12, ch[2]],
              mel=[[79, 83, 81, 79], [78, 81, 85, 81], [76, 79, 83, 79], [79, 84, 83, 79]], alen=1.6),
    'c': dict(bpm=112, chords=[(48, [60, 64, 67]), (53, [60, 65, 69]), (43, [59, 62, 67]), (45, [60, 64, 69])], arp=lambda ch: [ch[0], ch[2], ch[0] + 12, ch[2], ch[1] + 12, ch[2], ch[0] + 12, ch[1]],
              mel=[[84, 79, 84, 88], [84, 81, 77, 81], [83, 79, 74, 79], [81, 84, 88, 84]], alen=.7),
    'd': dict(bpm=62, chords=[(50, [62, 65, 69]), (46, [62, 65, 70]), (41, [60, 65, 69]), (48, [60, 64, 67])], arp=lambda ch: [ch[0], None, ch[1], None, ch[2], None, ch[1] + 12, None],
              mel=[[81, None, 77, None], [82, None, 77, None], [81, None, 76, None], [79, None, 76, None]], alen=2.6)}
T = THEMES[theme]; bar = 60 / T['bpm'] * 4   # такт 4 долі
for b in range(int(dur / bar) + 1):
    root, ch = T['chords'][b % 4]; st = b * bar
    note(fr(root - 12), st, bar + .8, .16, 'pad')
    for c in ch: note(fr(c - 12), st, bar + .8, .07, 'pad')
    for k, m in enumerate(T['arp'](ch)):
        if m is not None: note(fr(m + 12), st + k * bar / 8, T['alen'], .11)
    if b % 2 == 1: note(fr(ch[2] + 24), st + bar * .5, 2.2, .07)
    if T['mel']:   # проста мелодія на сильні долі
        for k, m in enumerate(T['mel'][b % 4]):
            if m is not None: note(fr(m), st + k * bar / 4 + (bar / 8 if k % 2 else 0), 1.4, .085)
mix /= max(1e-9, np.abs(mix).max()); mix *= .8
mix *= np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 2.5).clip(0, 1)
d = int(.28 * sr); echo = mix.copy(); echo[d:] += .3 * mix[:-d]; mix = echo / np.abs(echo).max() * .8
stereo = np.stack([mix, np.roll(mix, int(.012 * sr))], 1)
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((stereo * 32767).astype('<i2').tobytes()); w.close()
