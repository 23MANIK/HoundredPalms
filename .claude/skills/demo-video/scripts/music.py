"""Synthesizes a 21s, 120 BPM soundtrack in D major with SFX on the same beat grid.

Usage: python3 -I music.py out.wav
"""
import sys, wave
import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
DUR = 21.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
mix = np.zeros((N, 2))

def hz(midi): return 440 * 2 ** ((midi - 69) / 12)

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(sig), 0] += sig * l * 1.414
    mix[i:i + len(sig), 1] += sig * r * 1.414

def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.12)

def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    s = rng.standard_normal(n); s = np.diff(s, prepend=0)  # brighter
    return s * env(n, 0.001, 0.06 if open_ else 0.015)

def clap():
    n = int(0.2 * SR); s = rng.standard_normal(n)
    e = env(n, 0.002, 0.05)
    s = np.convolve(s, np.ones(6) / 6, 'same')
    return s * e

def pluck(m, d=0.35, bright=1.0):
    n = int(d * 2.5 * SR); t = np.arange(n) / SR; f = hz(m)
    s = np.sin(2*np.pi*f*t) + 0.35*bright*np.sin(4*np.pi*f*t)*np.exp(-t*8) + 0.15*bright*np.sin(6*np.pi*f*t)*np.exp(-t*14)
    return s * env(n, 0.004, d)

def bass(m, d):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    s = np.sin(2*np.pi*f*t) + 0.25*np.sin(4*np.pi*f*t)
    e = np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.05)
    return s * e

def pad(ms, d):
    n = int(d * SR); t = np.arange(n) / SR
    s = sum(np.sin(2*np.pi*hz(m)*t + k) + 0.5*np.sin(2*np.pi*hz(m)*1.003*t) for k, m in enumerate(ms))
    e = np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4)
    return s * e / len(ms)

def whoosh(d=0.5):
    n = int(d * SR); s = rng.standard_normal(n)
    s = np.convolve(s, np.ones(30) / 30, 'same')
    t = np.arange(n) / SR
    return s * np.sin(np.pi * t / d) ** 2

# D major: I-V-vi-IV  (D A Bm G), one chord per bar (2s)
chords = [(50, [62, 66, 69]), (45, [61, 64, 69]), (47, [62, 66, 71]), (43, [62, 67, 71])]
melody = [74, 76, 78, 81, 78, 76, 74, 69]  # pentatonic-ish hook, 8th notes on beats
bars = int(DUR / (4 * BEAT))
for b in range(bars + 1):
    t0 = b * 4 * BEAT
    root, tri = chords[b % 4]
    final = t0 >= 18
    if t0 >= DUR: break
    add(pad(tri, 4 * BEAT), t0, 0.06)
    if not final:
        for k in range(4):
            add(bass(root, BEAT * 0.9), t0 + k * BEAT, 0.16 if b > 0 else 0.0)
    # drums come in after the first bar
    for k in range(8):
        tt = t0 + k * BEAT / 2
        if b >= 1 and not final:
            add(hat(k % 2 == 1), tt, 0.035, 0.3)
    for k in range(4):
        tt = t0 + k * BEAT
        if b >= 1 and not final:
            add(kick(), tt, 0.5 if k % 2 == 0 else 0.0)
            if k % 2 == 1: add(clap(), tt, 0.12, -0.1)
        elif b == 0 and k >= 2:
            add(kick(), tt, 0.35)
    # melody plucks on 8ths, sparse in bars 2+
    if 1 <= b and not final:
        for k, m in enumerate(melody):
            if (b + k) % 3 == 0: continue
            add(pluck(m + (0 if b % 2 == 0 else -2), 0.2), t0 + k * BEAT / 2, 0.07, 0.25 if k % 2 else -0.25)

# outro: big D chord + bell at 18s, ring out
add(kick(), 18.0, 0.6)
for m in [62, 66, 69, 74, 78]: add(pluck(m, 0.9, 0.6), 18.0, 0.07)
add(pad([62, 66, 69, 74], 3.0), 18.0, 0.09)

# SFX on the grid, in key
for t in [3.0, 7.0, 11.0, 15.0]: add(whoosh(0.5), t - 0.25, 0.05)
for t in [5.25]: add(pluck(86, 0.08, 0.3), t, 0.06)          # taps (D6)
add(pluck(81, 0.25), 9.0, 0.10); add(pluck(86, 0.4), 9.25, 0.10)   # approved: A5 -> D6 chime
add(pluck(78, 0.25), 13.5, 0.08); add(pluck(83, 0.3), 13.75, 0.08)  # served

# master: gentle fade-in, end fade, soft clip
t = np.arange(N) / SR
mix *= np.minimum(1, t / 0.05)[:, None] * np.clip((DUR - t) / 1.2, 0, 1)[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / max(1e-9, np.abs(mix).max())
out = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', sys.argv[1])
