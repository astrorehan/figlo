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
    window.addEventListener("message", e => { if (e.data.pluginMessage?.type === "guide-apply") (window as any).guideMessages.push(e.data.pluginMessage); });
  });
  await page.goto(new URL("../figma/plugin/ui.html", import.meta.url).href);
  await page.evaluate(({ spec, tags }: any) => {
    (window as any).FigloGuide.configure(spec, tags);
    (window as any).FigloGuide.selection({ count: 1, name: "Play", tags: {} });
  }, { spec: EFFECTS, tags: [...KNOWN_TAGS] });
  await page.click("#tabGuide");
  await page.click("#tabExport"); await page.keyboard.press("ArrowRight"); assert.equal(await page.isVisible("#pageFx"), true);
  await page.keyboard.press("ArrowRight"); assert.equal(await page.isVisible("#pageGuide"), true);
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
  await select("goto"); await page.click(".guide-panel button"); assert.equal(await page.textContent(".guide-panel h3"), "Details");
  await select("switch"); assert.equal(await page.isVisible(".guide-panel .guide-item"), false); await page.click(".guide-panel button"); assert.equal(await page.isVisible(".guide-panel .guide-item"), true);
  await select("hide"); await page.click(".guide-panel button"); assert.equal(await page.isVisible(".guide-panel .guide-item"), false);
  assert.equal(await page.isVisible(".guide-panel"), false);
  await page.click("#guideReplay"); assert.equal(await page.isVisible(".guide-panel .guide-item"), true);
  await select("pop"); await page.click("#guidePause"); await page.click("#guideReplay");
  assert.equal(await page.textContent("#guidePause"), "Pause");
  await select("when"); await page.selectOption("#guide-try-input", "hover"); assert.equal(await page.isVisible("#guideWhenBadge"), true);
  await page.selectOption("#guide-try-input", "locked"); assert.equal(await page.isVisible("#guideWhenBadge"), false);
  await page.fill("#guideValue", "locked"); assert.equal(await page.isVisible("#guideWhenBadge"), true);
  await select("stack"); await page.getByRole("button", { name: "Add item", exact: true }).click(); assert.equal(await page.locator(".guide-item").count(), 4);
  await select("scroll"); assert.ok(await page.$eval(".guide-scroll", (n: Element) => n.scrollHeight > n.clientHeight));
  await select("txt"); await page.fill("#guide-try-input", "1,000,000,000 coins"); assert.ok(await page.$eval(".guide-label", (n: Element) => parseFloat(getComputedStyle(n).fontSize) < 28));
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
    const transform = await page.locator("#guideStage > button, #guideStage > .guide-panel").first().evaluate((n: HTMLElement) => n.style.transform).catch(() => "");
    assert.equal(/NaN|undefined/.test(transform), false);
  }
  await select("spin"); await page.click("#guidePause");
  const paused = await page.$eval(".guide-sample", (n: HTMLElement) => n.style.transform); await page.waitForTimeout(100);
  assert.equal(await page.$eval(".guide-sample", (n: HTMLElement) => n.style.transform), paused);
  await select("smooth"); await page.click("#guideSettings summary");
  // Check the expanded controls in both themes.
  if (!(await page.$eval("#guideSettings", (n: HTMLDetailsElement) => n.open))) await page.click("#guideSettings summary");
  await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-light.png", import.meta.url)), fullPage: true });
  await page.addStyleTag({ content: ':root { --figma-color-bg:#252525; --figma-color-text:#eee; --figma-color-bg-secondary:#363636; --figma-color-border:#505050; --figma-color-text-secondary:#aaa; }' });
  await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-dark.png", import.meta.url)), fullPage: true });
  assert.equal(await page.$eval("body", (n: Element) => n.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  const reduced = await browser.newPage({ viewport: { width: 400, height: 680 }, reducedMotion: "reduce" });
  await reduced.goto(new URL("../figma/plugin/ui.html", import.meta.url).href);
  await reduced.evaluate(({ spec, tags }: any) => (window as any).FigloGuide.configure(spec, tags), { spec: EFFECTS, tags: [...KNOWN_TAGS] });
  await reduced.click("#tabGuide"); assert.equal(await reduced.textContent("#guidePause"), "Play"); assert.equal(await reduced.isDisabled("#guideApply"), true);
  console.log("Tag Guide browser: all tags, pointer states, navigation, settings, apply isolation, layout and reduced motion passed");
} finally { await browser.close(); }
