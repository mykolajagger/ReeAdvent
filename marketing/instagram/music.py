# Власна коротка музична тема для Reel (синтез, без сторонніх прав): ніжна музична скринька + м'які акорди, ~21 с. Використання: python3 music.py out.wav 21
import sys, numpy as np, wave
dur = float(sys.argv[2]) if len(sys.argv) > 2 else 21; sr = 44100; n = int(dur * sr); t = np.arange(n) / sr
mix = np.zeros(n)
def note(f, start, length, amp, kind='bell'):
    i0 = int(start * sr); m = min(int(length * sr), n - i0)
    if m <= 0: return
    tt = np.arange(m) / sr
    if kind == 'bell': w = np.sin(2*np.pi*f*tt) + .35*np.sin(2*np.pi*2*f*tt)*np.exp(-tt*5) + .12*np.sin(2*np.pi*3.01*f*tt)*np.exp(-tt*9); env = np.exp(-tt*2.6)*np.minimum(1, tt*400)
    else: w = np.sin(2*np.pi*f*tt) + .4*np.sin(2*np.pi*2*f*tt) + .2*np.sin(2*np.pi*f*1.003*tt); env = np.minimum(1, tt/1.2)*np.minimum(1, (length - tt)/1.5).clip(0, 1)
    mix[i0:i0+m] += amp * w * env
fr = lambda midi: 440 * 2 ** ((midi - 69) / 12)
bar = 60 / 76 * 4   # 76 BPM, такт 4 долі
chords = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [59, 62, 67])]   # C Am F G
for b in range(int(dur / bar) + 1):
    root, ch = chords[b % 4]; st = b * bar
    note(fr(root - 12), st, bar + .8, .16, 'pad')
    for c in ch: note(fr(c - 12), st, bar + .8, .07, 'pad')
    arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]
    for k, m in enumerate(arp): note(fr(m + 12), st + k * bar / 8, 1.6, .11)
    if b % 2 == 1: note(fr(ch[2] + 24), st + bar * .5, 2.2, .07)
mix /= max(1e-9, np.abs(mix).max()); mix *= .8
mix *= np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 2.5).clip(0, 1)
d = int(.28 * sr); echo = mix.copy(); echo[d:] += .3 * mix[:-d]; mix = echo / np.abs(echo).max() * .8
st = np.stack([mix, np.roll(mix, int(.012 * sr))], 1)
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st * 32767).astype('<i2').tobytes()); w.close()
