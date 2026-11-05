/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script run outside the app */
// Renders every frame as a pure function of time, piping JPEGs into ffmpeg.
const { chromium } = require(require('path').resolve('node_modules/@playwright/test'));
const { spawn } = require('child_process');
const [,, html, out, durS] = process.argv;
const FPS = 30, N = Math.round(Number(durS) * FPS);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + html); await p.evaluate(() => window.ready);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => render(t), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) console.log('frame', i, '/', N);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
})();
