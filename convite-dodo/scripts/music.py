"""Music-box 'Parabéns a Você' (Happy Birthday melody, public domain) -> WAV."""
import sys
import wave
import numpy as np

SR = 44100
DUR = 17.5
BEAT = 0.63
START = 0.8
out = np.zeros((int(SR * DUR), 2))


def hz(n):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    return 440.0 * 2 ** ((names[n[0]] + 12 * (int(n[1]) + 1) - 69) / 12)


def note(t, name, amp=0.5, pan=0.0, tau=1.3):
    f = hz(name)
    n = int(SR * min(4.0, DUR - t))
    if n <= 0:
        return
    tt = np.arange(n) / SR
    env = np.exp(-tt / tau) * np.minimum(1, tt / 0.002)
    sig = (np.sin(2 * np.pi * f * tt)
           + 0.35 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt / (tau * .5))
           + 0.12 * np.sin(2 * np.pi * 3.01 * f * tt) * np.exp(-tt / (tau * .3))
           + 0.08 * np.sin(2 * np.pi * 4.17 * f * tt) * np.exp(-tt / 0.08)
           + 0.5 * np.sin(2 * np.pi * f * 1.003 * tt))
    sig *= env * amp
    i = int(SR * t)
    seg = out[i:i + n]
    seg[:, 0] += sig[:len(seg)] * (1 - pan) * .5
    seg[:, 1] += sig[:len(seg)] * (1 + pan) * .5


melody = [  # (beat, note, beats)
    (0, 'G4'), (.75, 'G4'),
    (1, 'A4'), (2, 'G4'), (3, 'C5'),
    (4, 'B4'), (6, 'G4'), (6.75, 'G4'),
    (7, 'A4'), (8, 'G4'), (9, 'D5'),
    (10, 'C5'), (12, 'G4'), (12.75, 'G4'),
    (13, 'G5'), (14, 'E5'), (15, 'C5'),
    (16, 'B4'), (17, 'A4'), (18, 'F5'), (18.75, 'F5'),
    (19, 'E5'), (20, 'C5'), (21, 'D5'),
    (22, 'C5'),
]
chords = {1: ('C3', 'E4', 'G4'), 4: ('G2', 'D4', 'G4'), 7: ('G2', 'D4', 'F4'), 10: ('C3', 'E4', 'G4'),
          13: ('C3', 'E4', 'G4'), 16: ('F2', 'A3', 'C4'), 19: ('G2', 'C4', 'E4'), 22: ('C3', 'E4', 'G4')}


def time_of(beat):
    # gentle ritardando over the last phrase
    extra = max(0.0, beat - 18) ** 1.6 * 0.035
    return START + beat * BEAT + extra


for b, n in melody:
    note(time_of(b), n, amp=0.55 if b < 22 else 0.6, pan=0.1, tau=1.4 if b < 22 else 2.6)
for b, (bass, c1, c2) in chords.items():
    note(time_of(b), bass, amp=0.28, pan=-0.2, tau=1.6)
    if b < 22:
        note(time_of(b + 1), c1, amp=0.14, pan=-0.3, tau=0.8)
        note(time_of(b + 1), c2, amp=0.12, pan=-0.3, tau=0.8)
        note(time_of(b + 2), c1, amp=0.12, pan=-0.3, tau=0.8)
        note(time_of(b + 2), c2, amp=0.10, pan=-0.3, tau=0.8)
    else:
        for k, nn in enumerate((c1, c2, 'C5')):
            note(time_of(b) + 0.09 * (k + 1), nn, amp=0.16, pan=-0.2 + 0.2 * k, tau=2.4)

# twinkles when the cloth lands and the name appears
for t0, ns in ((11.85, ('E6', 'G6', 'C7')), (12.4, ('C6', 'E6', 'G6', 'C7'))):
    for k, nn in enumerate(ns):
        note(t0 + 0.07 * k, nn, amp=0.07, pan=0.4 - 0.25 * k, tau=0.6)

# small room reverb by convolving with a decaying noise tail
rng = np.random.default_rng(3)
L = int(SR * 1.6)
ir = rng.standard_normal((L, 2)) * np.exp(-np.arange(L) / (SR * 0.35))[:, None]
ir[0] = 0
wet = np.zeros_like(out)
nfft = 1 << int(np.ceil(np.log2(len(out) + L)))
for c in range(2):
    wet[:, c] = np.fft.irfft(np.fft.rfft(out[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:len(out)]
wet /= np.abs(wet).max() + 1e-9
dry = out / (np.abs(out).max() + 1e-9)
mix = dry * 0.82 + wet * 0.22
fade = np.ones(len(mix))
fs = int(SR * 16.3)
fade[fs:] = np.linspace(1, 0, len(mix) - fs) ** 2
mix *= fade[:, None]
mix = mix / np.abs(mix).max() * 0.85

with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok', sys.argv[1])
