// Renders slides.html (?s=1..8) to slides/sN.png at 1920x1080.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const dir = path.join(import.meta.dirname, "slides");
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (let i = 1; i <= 8; i++) {
  await page.goto(`file://${path.join(import.meta.dirname, "slides.html")}?s=${i}`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, `s${i}.png`) });
}
await browser.close();
