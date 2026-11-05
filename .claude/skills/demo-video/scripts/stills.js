/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script run outside the app */
const { chromium } = require(require('path').resolve('node_modules/@playwright/test'));
const [,, html, out, ...times] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + html); await p.evaluate(() => window.ready);
  for (const t of times) { await p.evaluate(t => render(t), Number(t)); await p.screenshot({ path: `${out}/still-${t}.jpg`, quality: 70 }); }
  await b.close();
})();
