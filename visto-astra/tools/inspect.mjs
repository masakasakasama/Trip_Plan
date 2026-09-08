import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(process.argv[2] || "http://127.0.0.1:8765/visto-astra/");
await page.waitForFunction(() => window.astra, { timeout: 30000 });
await page.waitForTimeout(4000);
await fs.mkdir("visto-astra/artifacts", { recursive: true });
await page.screenshot({ path: "visto-astra/artifacts/mobile.png" });
console.log(
  JSON.stringify(
    await page.evaluate(() => ({ state: astra.state, metrics: astra.metrics })),
    null,
    2,
  ),
);
console.log({ errors });
console.log('GPU',await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'}));
await context.close();
const desktop = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
desktop.on("pageerror", (e) => console.log("DESKTOP ERROR", e.message));
await desktop.goto(process.argv[2] || "http://127.0.0.1:8765/visto-astra/");
await desktop.waitForFunction(() => window.astra);
await desktop.waitForTimeout(2500);
await desktop.screenshot({ path: "visto-astra/artifacts/desktop.png" });
console.log("DESKTOP", await desktop.evaluate(() => astra.metrics));
await browser.close();
