import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";
const url = process.argv[2] || "http://127.0.0.1:8765/visto-astra/";
const output = "visto-astra/artifacts";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { url, views: [] };
for (const mobile of [true, false]) {
  const width = mobile ? 412 : 1440,
    height = mobile ? 915 : 1000;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(12000);
  console.log("VERIFY", mobile ? "mobile" : "desktop");
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const began = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.astra, { timeout: 30000 });
  const loadMs = Date.now() - began;
  await page.waitForTimeout(2500);
  const initial = await page.evaluate(() => ({
    state: astra.state,
    metrics: astra.metrics,
  }));
  assert.equal(initial.state.countries, 15);
  assert.equal(initial.state.total, 16);
  assert.equal(initial.state.unresolved.length, 0);
  if(mobile){const dimensions=await page.locator('#stage canvas').evaluate(c=>{const r=c.getBoundingClientRect();return{cssRatio:r.width/r.height,bufferRatio:c.width/c.height}});assert.ok(Math.abs(dimensions.cssRatio-1)<.005,'CSS globe viewport must be square');assert.ok(Math.abs(dimensions.bufferRatio-1)<.005,'WebGL drawing buffer must be square');}
  const image = await page.locator("#stage canvas").screenshot();
  const raw = await sharp(image)
    .resize(128, 128)
    .removeAlpha()
    .raw()
    .toBuffer();
  let lit = 0;
  for (let i = 0; i < raw.length; i += 3)
    if (raw[i] + raw[i + 1] + raw[i + 2] > 120) lit++;
  assert.ok(lit > 1000, `Globe must be nonblank, lit pixels ${lit}`);
  await page.screenshot({
    path: `${output}/${mobile ? "mobile" : "desktop"}-overview.png`,
  });
  const before = await page.evaluate(() => astra.metrics.camera);
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 430, id: 0 }],
    });
    for (let i = 0; i < 12; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180 + i * 8, y: 430 + i, id: 0 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else {
    await page.mouse.move(800, 450);
    await page.mouse.down();
    await page.mouse.move(1050, 480, { steps: 15 });
    await page.mouse.up();
  }
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => astra.metrics.camera);
  assert.ok(
    before.some((n, i) => Math.abs(n - after[i]) > 0.08),
    "drag rotates",
  );
  await page.click("#home");
  await page.waitForTimeout(1800);
  const distance = await page.evaluate(() =>
    Math.hypot(...astra.metrics.camera),
  );
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 180, y: 430, id: 0 },
        { x: 230, y: 430, id: 1 },
      ],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 180 - i * 5, y: 430, id: 0 },
          { x: 230 + i * 5, y: 430, id: 1 },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else await page.click("#zoom-in");
  await page.waitForTimeout(700);
  assert.ok(
    (await page.evaluate(() => Math.hypot(...astra.metrics.camera))) <
      distance - 0.1,
    "pinch / zoom in works",
  );
  await page.click("#home");
  await page.waitForTimeout(1800);
  const target = await page.evaluate(() => astra.project(40, 103));
  if (mobile) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#panel-title").textContent(), "China");
  await page.screenshot({
    path: `${output}/${mobile ? "mobile" : "desktop"}-country.png`,
  });
  await page.click("#close-panel");
  await page.click("#home");
  await page.waitForTimeout(1800);
  const city = page
    .locator(".city-label:visible")
    .filter({ hasText: "Shanghai" });
  await city.click();
  assert.equal(await page.locator("#panel-title").textContent(), "Shanghai");
  assert.match(await page.locator("#panel-body").textContent(), /3 回/);
  await page.click("#library");
  await page.locator('[data-trip="1"]').click();
  assert.equal(
    (await page.evaluate(() => astra.state)).selected,
    "history-europe-2024-03",
  );
  await page.waitForTimeout(2400);
  await page.screenshot({
    path: `${output}/${mobile ? "mobile" : "desktop"}-trip.png`,
  });
  const boxes = await page.evaluate(() => {
    const r = (s) => {
      const b = document.querySelector(s).getBoundingClientRect();
      return {
        x: b.x,
        y: b.y,
        right: b.right,
        bottom: b.bottom,
        width: b.width,
        height: b.height,
      };
    };
    return {
      stage: r("#stage"),
      panel: r("#panel"),
      header: r("header"),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.equal(boxes.overflow, false);
  if (mobile) {
    assert.ok(
      boxes.stage.bottom <= boxes.panel.y + 2,
      "panel must not cover the globe stage",
    );
    assert.ok(
      boxes.stage.y >= boxes.header.bottom,
      "header must not cover stage",
    );
  }
  console.log("Interactions passed", await page.evaluate(() => astra.state));
  await page.click("#close-panel");
  console.log("Panel closed");
  await page.click("#all-time");
  await page.click("#speed");
  await page.click("#speed");
  await page.click("#play");
  console.log("Replay started");
  const seen = new Set();
  const startReplay = Date.now();
  while (true) {
    const s = await page.evaluate(() => astra.state);
    seen.add(Math.floor(s.position));
    if (!s.playing) break;
    if (Date.now() - startReplay > 45000) throw Error("Replay stalled");
    await page.waitForTimeout(220);
  }
  const final = await page.evaluate(() => astra.state);
  assert.equal(final.position, 16);
  assert.equal(final.countries, 15);
  assert.equal(final.cities, 33);
  assert.equal(seen.size, 17);
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: `${output}/${mobile ? "mobile" : "desktop"}-replay-end.png`,
  });
  await page.click("#settings");
  await page.uncheck("#cloud-toggle");
  await page.selectOption("#light-mode", "live");
  await page.selectOption("#light-mode", "portrait");
  await page.click("#close-panel");
  await page.click("#cities");
  await page.locator('#panel-body [data-city="Los Angeles"]').click();
  await page.click("#close-panel");
  await page.waitForTimeout(2000);
  await page.click('#zoom-out');await page.waitForTimeout(550);await page.click('#zoom-out');await page.waitForTimeout(550);
  await page.screenshot({
    path: `${output}/${mobile ? "mobile" : "desktop"}-night.png`,
  });
  await page.click("#home");
  await page.click("#settings");
  await page.check("#cloud-toggle");
  await page.selectOption("#light-mode", "portrait");
  await page.click("#close-panel");
  await page.waitForTimeout(2000);
  const metrics = await page.evaluate(() => astra.metrics);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report.views.push({
    mobile,
    viewport: { width, height },
    loadMs,
    litPixels: lit,
    initial: initial.state,
    metrics,
    observedReplaySteps: seen.size,
    errors,
    boxes,
  });
  await context.close();
}
await fs.writeFile(
  `${output}/verification.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
