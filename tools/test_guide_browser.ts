// Optional browser smoke test. Supply Playwright externally; no plugin dependencies.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FIGLO_PLAYWRIGHT_MODULE || "playwright");
const { EFFECTS, KNOWN_TAGS } = require("../figma/extract.js");
const { catalogue } = require("../figma/plugin/tag-guide.js");
const browser = await chromium.launch({ headless: true, ...(process.env.FIGLO_BROWSER_CHANNEL ? { channel: process.env.FIGLO_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 680 } });
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).guideMessages = [];
    (window as any).previewRequests = [];
    window.addEventListener("message", e => {
      const m = e.data.pluginMessage;
      if (m?.type === "guide-apply") (window as any).guideMessages.push(m);
      if (m?.type === "guide-preview" && !("bytes" in m) && !m.error) {
        e.stopImmediatePropagation();
        (window as any).previewRequests.push(m);
        if ((window as any).autoPreview) window.postMessage({ pluginMessage: { ...m, name: "Level bar", bytes: (window as any).previewBytes } }, "*");
      }
    });
  });
  await page.goto(new URL("../figma/plugin/ui.html", import.meta.url).href);
  await page.evaluate(({ spec, tags }: any) => {
    const canvas = document.createElement("canvas"); canvas.width = 540; canvas.height = 48;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#192438"; ctx.fillRect(0, 0, 540, 48);
    ctx.fillStyle = "#fff"; ctx.font = "bold 24px sans-serif"; ctx.fillText("LEVEL 12", 12, 32);
    ctx.fillStyle = "#fac34b"; ctx.fillRect(155, 16, 320, 16);
    (window as any).previewBytes = Array.from(atob(canvas.toDataURL().split(",")[1]), c => c.charCodeAt(0));
    (window as any).autoPreview = true;
    (window as any).FigloGuide.configure(spec, tags);
    (window as any).FigloGuide.selection({ count: 1, id: "1:2", name: "Level bar", tags: {} });
  }, { spec: EFFECTS, tags: [...KNOWN_TAGS] });
  await page.click("#tabGuide");
  await page.click("#tabExport"); await page.keyboard.press("ArrowRight"); assert.equal(await page.isVisible("#pageFx"), true);
  await page.keyboard.press("ArrowRight"); assert.equal(await page.isVisible("#pageGuide"), true);
  await page.waitForSelector(".guide-selection img");
  assert.equal(await page.getAttribute(".guide-selection img", "alt"), "Level bar");
  assert.equal(await page.textContent("#guideExample"), "Level bar_smooth");
  const dimensions = await page.$eval(".guide-selection", (n: HTMLElement) => ({ w: n.offsetWidth, h: n.offsetHeight, style: n.getAttribute('style') }));
  assert.ok(Math.abs(dimensions.w / dimensions.h - 540 / 48) < .5, JSON.stringify(dimensions));
  assert.equal(await page.textContent("#guideTitle"), "_smooth");
  assert.equal(await page.inputValue("#guide-param-hover"), "1.08");
  await page.hover(".guide-sample");
  await page.waitForTimeout(250);
  assert.ok(await page.$eval(".guide-sample", (n: Element) => Number(getComputedStyle(n).transform.match(/matrix\(([^,]+)/)?.[1]) > 1));
  await page.mouse.down(); await page.waitForTimeout(250);
  assert.ok(await page.$eval(".guide-sample", (n: Element) => Number(getComputedStyle(n).transform.match(/matrix\(([^,]+)/)?.[1]) < 1));
  await page.mouse.up();
  await page.fill("#guideSearch", "no-such-tag");
  assert.equal(await page.isVisible("#guideEmpty"), true);
  assert.equal(await page.isVisible("#guideDetail"), false);
  await page.fill("#guideSearch", "");
  async function select(tag: string) { await page.selectOption("#guideCategory", ""); await page.fill("#guideSearch", ""); await page.getByRole("button", { name: tag === "#" ? "# prefix" : "_" + tag, exact: true }).click(); }
  await select("goto"); assert.equal(await page.getAttribute(".guide-selection img", "alt"), "Level bar");
  assert.match(await page.textContent("#guideNote") || "", /after import/);
  await select("pop"); await page.click("#guidePause"); await page.click("#guideReplay");
  assert.equal(await page.textContent("#guidePause"), "Pause");
  await select("when"); await page.selectOption("#guide-try-input", "hover"); assert.equal(await page.$eval(".guide-selection", (n: HTMLElement) => n.style.opacity), "1");
  await page.selectOption("#guide-try-input", "locked"); assert.equal(await page.$eval(".guide-selection", (n: HTMLElement) => n.style.opacity), "0");
  await page.fill("#guideValue", "locked"); assert.equal(await page.$eval(".guide-selection", (n: HTMLElement) => n.style.opacity), "1");
  await select("ratio");
  await page.$eval("#guide-try-input", (n: HTMLInputElement) => { n.value = String(Number(n.max) / 2); n.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.ok(await page.$eval(".guide-selection", (n: HTMLElement) => Math.abs(parseFloat(n.style.width) / parseFloat(n.style.height) - 540 / 48) < .01));
  await select("ignore"); await page.click("#guideReplay"); assert.equal(await page.isVisible(".guide-sample"), false);
  await select("pulse"); await page.click("#guideSettings summary");
  await page.$eval("#guide-param-amp", (n: HTMLInputElement) => { n.value = ".2"; n.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.equal(await page.evaluate(() => (window as any).guideMessages.length), 0);
  await page.click("#guideApply");
  await page.waitForFunction(() => (window as any).guideMessages.length > 0);
  const request = await page.evaluate(() => (window as any).guideMessages.at(-1));
  assert.equal(request.tag, "pulse"); assert.equal(request.params.amp, .2);
  for (const entry of catalogue) {
    await select(entry.tag);
    assert.equal(await page.textContent("#guideTitle"), entry.tag === "#" ? "# prefix" : "_" + entry.tag);
    assert.equal(await page.$eval("#guideStage", (n: Element) => n.textContent?.includes("undefined")), false);
    assert.equal(await page.getAttribute(".guide-selection img", "alt"), "Level bar");
    assert.equal(await page.locator(".guide-label, .guide-star, .guide-item").count(), 0);
    const transform = await page.locator("#guideStage > button, #guideStage > .guide-panel").first().evaluate((n: HTMLElement) => n.style.transform).catch(() => "");
    assert.equal(/NaN|undefined/.test(transform), false);
  }
  await select("spin"); await page.click("#guidePause");
  const paused = await page.$eval(".guide-sample", (n: HTMLElement) => n.style.transform); await page.waitForTimeout(100);
  assert.equal(await page.$eval(".guide-sample", (n: HTMLElement) => n.style.transform), paused);
  await select("wiggle"); await page.click("#guideReplay"); await page.waitForTimeout(120);
  assert.match(await page.$eval(".guide-selection", (n: HTMLElement) => n.style.transform), /rotate\((?!0deg)/);
  await page.click("#guideReplay");
  // Check the expanded controls in both themes.
  if (!(await page.$eval("#guideSettings", (n: HTMLDetailsElement) => n.open))) await page.click("#guideSettings summary");
  await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-light.png", import.meta.url)), fullPage: true });
  await page.addStyleTag({ content: ':root { --figma-color-bg:#252525; --figma-color-text:#eee; --figma-color-bg-secondary:#363636; --figma-color-border:#505050; --figma-color-text-secondary:#aaa; }' });
  await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-dark.png", import.meta.url)), fullPage: true });
  assert.equal(await page.$eval("body", (n: Element) => n.scrollWidth > innerWidth), false);
  // A slow reply must not resurrect artwork from a previous selection.
  await page.evaluate(() => { (window as any).autoPreview = false; (window as any).FigloGuide.refresh(); });
  await page.waitForTimeout(200);
  const oldRequest = await page.evaluate(() => (window as any).previewRequests.at(-1));
  await page.evaluate(() => (window as any).FigloGuide.selection({ count: 1, id: "other", name: "Other frame", tags: {} }));
  await page.evaluate((m: any) => (window as any).FigloGuide.preview({ ...m, name: "Old frame", bytes: (window as any).previewBytes }), oldRequest);
  assert.equal(await page.locator(".guide-selection").count(), 0);
  await page.waitForTimeout(200);
  const newRequest = await page.evaluate(() => (window as any).previewRequests.at(-1));
  await page.evaluate((m: any) => (window as any).FigloGuide.preview({ ...m, name: "Other frame", bytes: (window as any).previewBytes }), newRequest);
  assert.equal(await page.getAttribute(".guide-selection img", "alt"), "Other frame");
  await page.evaluate(() => (window as any).FigloGuide.refresh()); await page.waitForTimeout(200);
  const failedRequest = await page.evaluate(() => (window as any).previewRequests.at(-1));
  await page.evaluate((m: any) => (window as any).FigloGuide.preview({ ...m, error: "Export failed" }), failedRequest);
  assert.match(await page.textContent("#guideStage") || "", /Export failed/);
  assert.equal(await page.textContent("#guideReplay"), "Refresh");
  await page.evaluate(() => (window as any).FigloGuide.selection({ count: 2, id: null, name: null, tags: {} }));
  assert.match(await page.textContent("#guideStage") || "", /Select one/);
  assert.equal(await page.locator(".guide-selection").count(), 0);
  await page.evaluate(() => (window as any).FigloGuide.selection({ count: 0, id: null, name: null, tags: {} }));
  assert.equal(await page.isDisabled("#guideApply"), true);
  const requestCount = await page.evaluate(() => (window as any).previewRequests.length);
  await page.click("#tabExport"); await page.evaluate(() => (window as any).FigloGuide.refresh()); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => (window as any).previewRequests.length), requestCount);
  assert.deepEqual(errors, []);
  const reduced = await browser.newPage({ viewport: { width: 400, height: 680 }, reducedMotion: "reduce" });
  await reduced.goto(new URL("../figma/plugin/ui.html", import.meta.url).href);
  await reduced.evaluate(({ spec, tags }: any) => (window as any).FigloGuide.configure(spec, tags), { spec: EFFECTS, tags: [...KNOWN_TAGS] });
  await reduced.click("#tabGuide"); assert.equal(await reduced.textContent("#guidePause"), "Play"); assert.equal(await reduced.isDisabled("#guideApply"), true);
  console.log("Tag Guide browser: selected artwork, aspect ratio, all tags, pointer states, settings, apply isolation, stale replies, selection changes, errors and reduced motion passed");
} finally { await browser.close(); }
