---
name: demo-video
description: Make a 20-second launch/demo video of the Hundred Palms app (guest orders, waiter approves, kitchen cooks, bill) from real app screens, with music. Use when asked for a demo video, promo, "brag" video, or to refresh the video after UI changes.
---

# Demo video

Builds a ~21 s, 1920×1080, 30 fps video from real screenshots of the app, following the `/brag-slim` method from https://github.com/latent-spaces/brag (hook → reveal → highlights → outro, every cut on a beat). Needs only Node, Playwright (already a dev dependency), Python 3 with numpy, and ffmpeg. Nothing is installed or downloaded.

Run every command from the repo root. Put output in a scratch folder (`$OUT` below), never in the repo.

## 1. Start a local copy

The live site may be blocked from cloud sessions, so record locally like the E2E checks do:

```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER hp WITH PASSWORD 'hp' SUPERUSER;" -c "CREATE DATABASE hundredpalms_demo OWNER hp;"
# .env.local: DATABASE_URL=postgresql://hp:hp@localhost:5432/hundredpalms_demo, SESSION_SECRET (32+ chars),
#             SEED_MANAGER_PHONE=9999999999, SEED_MANAGER_PIN=1234, DEV_SHOW_OTP=1
npm ci && npm run db:migrate && npm run db:seed && npm run build
npm run start &   # http://localhost:3000
```

Pick a Good Life table token: `psql ... -tAc "select qr_token from dining_tables where restaurant_id=2 and number=4"`. Tokens are case sensitive. The capture script assumes table 4 and the seed manager login (9999999999 / 1234); edit `T` and the login in `capture.js` if you use others.

## 2. Capture the screens

```bash
mkdir -p $OUT/shots $OUT/fonts
node .claude/skills/demo-video/scripts/capture.js $OUT/shots <table-token>
cp .next/static/media/*-s.p.woff2 $OUT/fonts/jakarta.woff2   # the app's Plus Jakarta Sans
cp .claude/skills/demo-video/composition.html $OUT/
```

It plays one evening at the table (menu, cart, waiter login code, order, approve, kitchen, served, bill) with the fictional guest "Aarav" and writes `g*.png` (phone, Pixel 7) and `s*.png` (staff laptop). The DB must be fresh or table 4 free of open bills.

Per project rules, hand the screenshots to a `model: "haiku"` subagent to describe them and flag broken screens. Don't read them in the main session.

## 3. Check stills, then render

```bash
node .claude/skills/demo-video/scripts/stills.js $OUT/composition.html $OUT/stills 1.8 5.4 9.8 12.5 16.9 20.0
```

Send the stills to a Haiku subagent to check overlap, clipping and contrast. Fix positions in `composition.html` (every frame is `render(t)`, a pure function of time) and repeat. Then:

```bash
python3 -I .claude/skills/demo-video/scripts/music.py $OUT/audio.wav     # 120 BPM, D major, SFX on the grid
node .claude/skills/demo-video/scripts/render.js $OUT/composition.html $OUT/video.mp4 21
ffmpeg -y -ss 9.8 -i $OUT/video.mp4 -frames:v 1 -q:v 2 $OUT/brag.jpg     # poster: a settled frame
ffmpeg -y -i $OUT/video.mp4 -i $OUT/brag.jpg -i $OUT/audio.wav \
  -filter_complex "[0:v][1:v]overlay=enable='eq(n,0)'[v];[2:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest $OUT/brag.mp4
```

The overlay bakes the poster in as frame 0 so platforms show it as the thumbnail, without changing length or sync.

## Storyboard (cuts on beats at 120 BPM)

| Time | Scene |
|---|---|
| 0–3 s | "Scan the table. Order from your phone." Phone rises with the menu |
| 3–7 s | "Browse. Add. Place order." Menu, cart bar tap, cart |
| 7–11 s | "A waiter checks every order." Waiter card, Approved stamp, phone shows Approved |
| 11–15 s | "Only then the kitchen sees it." Kitchen ticket, phone goes Cooking → Served |
| 15–18 s | "Who ordered. Who approved. All on the bill." Cashier bill |
| 18–21 s | "Hundred Palms · Scan. Order. Enjoy." |

If screen layouts change, update image positions in `composition.html` (the kitchen crop and the tap position on the cart bar are tied to the current layout).
