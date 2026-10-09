// Optional browser checks. Supply Playwright externally; no plugin dependencies.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { shopPreview } from "../figma/preview-fixture.ts";
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
    (window as any).guideMessages = []; (window as any).previewRequests = []; (window as any).resizeMessages = [];
    window.addEventListener("message", e => {
      const m = e.data.pluginMessage;
      if (m?.type === "guide-apply") (window as any).guideMessages.push(m);
      if (m?.type === "guide-resize") (window as any).resizeMessages.push(m);
      if (m?.type === "guide-preview" && !("ir" in m) && !m.error) {
        e.stopImmediatePropagation(); (window as any).previewRequests.push(m);
        if ((window as any).autoPreview) window.postMessage({ pluginMessage: { ...m, name: "Shop", ir: (window as any).previewIR, images: (window as any).previewImages } }, "*");
      }
    });
  });
  await page.goto(new URL("../figma/plugin/ui.html", import.meta.url).href);
  await page.evaluate(({ spec, tags, ir }: any) => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 60;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#ffc14a"; ctx.beginPath(); ctx.arc(30, 30, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff2b0"; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = "#965b15"; ctx.font = "bold 28px sans-serif"; ctx.fillText("$", 22, 40);
    (window as any).previewBytes = Array.from(atob(canvas.toDataURL().split(",")[1]), c => c.charCodeAt(0));
    const title = document.createElement("canvas"); title.width = 464; title.height = 64;
    const ink = title.getContext("2d")!; ink.textAlign = "center"; ink.font = "italic 900 54px Arial";
    ink.lineJoin = "round"; ink.lineWidth = 8; ink.strokeStyle = "#18223b"; ink.strokeText("SHOP", 232, 49);
    const titleFill = ink.createLinearGradient(0, 8, 0, 60); titleFill.addColorStop(0, "#fff8b0"); titleFill.addColorStop(1, "#86efff");
    ink.fillStyle = titleFill; ink.fillText("SHOP", 232, 49);
    (window as any).previewImages = [{ key: "coin", bytes: (window as any).previewBytes }, { key: "shop-title", bytes: Array.from(atob(title.toDataURL().split(",")[1]), c => c.charCodeAt(0)) }];
    (window as any).previewIR = ir; (window as any).autoPreview = true;
    (window as any).FigloGuide.configure(spec, tags);
    (window as any).FigloGuide.selection({ count: 1, id: "shop", name: "Shop", tags: {} });
  }, { spec: EFFECTS, tags: [...KNOWN_TAGS], ir: shopPreview() });
  await page.click("#tabGuide"); await page.waitForSelector('[data-node-id="buy"]');
  const node = (id: string) => page.locator('.preview-node[data-node-id="' + id + '"]');
  async function select(tag: string) { await page.selectOption("#guideCategory", ""); await page.fill("#guideSearch", ""); await page.getByRole("button", { name: tag === "#" ? "# prefix" : "_" + tag, exact: true }).click(); }
  const transform = (id: string) => node(id).evaluate((n: HTMLElement) => n.style.transform);
  const rootTransform = await transform("shop");
  assert.match(await node("shop").locator(':scope > .preview-paint').evaluate((e: HTMLElement) => e.style.backgroundImage), /linear-gradient.*26, 38, 59.*14, 22, 36/);
  assert.match(await node("details").locator(':scope > .preview-paint').evaluate((e: HTMLElement) => e.style.backgroundImage), /linear-gradient.*61, 77, 102.*31, 43, 66/);
  const gradientBefore = await node("details").locator(':scope > .preview-paint').evaluate((e: HTMLElement) => e.style.backgroundPosition);
  await page.waitForTimeout(200); assert.equal(await transform("shop"), rootTransform);
  assert.notEqual(await node("details").locator(':scope > .preview-paint').evaluate((e: HTMLElement) => e.style.backgroundPosition), gradientBefore);
  const textBounds = await node("title").evaluate((e: HTMLElement) => {
    const layout = e.getBoundingClientRect(), image = e.querySelector('img')!.getBoundingClientRect();
    return { top: image.top - layout.top, bottom: image.bottom - layout.bottom, width: image.width / layout.width, height: image.height / layout.height };
  });
  assert.ok(textBounds.top < 0 && textBounds.bottom > 0); assert.ok(textBounds.width > 1 && textBounds.height > 1);
  assert.equal(await node("title").locator('.preview-band').evaluate((e: HTMLElement) => e.style.transform), await node("title").locator('img').evaluate((e: HTMLElement) => e.style.transform));
  assert.notEqual(await transform("sparkle"), 'translate(-50%,-50%) translate(0px,0px) rotate(0deg) scale(1,1)');
  await select("wiggle"); await page.waitForTimeout(150);
  assert.equal(await transform("shop"), rootTransform);
  assert.equal(await page.isDisabled("#guide-param-angle"), true);
  await select("smooth"); assert.equal(await page.inputValue("#guide-param-hover"), "1.15");
  await node("buy").hover(); await page.waitForTimeout(150);
  assert.match(await transform("buy"), /scale\(1.15,\s*1.15\)/);
  assert.equal(await node("hover").isVisible(), true);
  assert.equal(await node("buy-icon").locator(':scope > .preview-paint').evaluate((e: HTMLElement) => e.style.filter), 'brightness(0.75)');
  assert.equal(await node("nodim").locator(':scope > .preview-paint').evaluate((e: HTMLElement) => e.style.filter), '');
  await page.mouse.down(); await page.waitForTimeout(120); assert.match(await transform("buy"), /scale\(0.85,\s*0.85\)/);
  assert.equal(await page.locator('.preview-ripple').count(), 1);
  await page.mouse.move(1, 1); await page.mouse.up(); await page.waitForTimeout(150);
  assert.match(await transform("buy"), /scale\(1,\s*1\)/); assert.equal(await node("hover").isVisible(), false);
  // Native target navigation uses the selected frame's real descendants.
  await node("close").click(); assert.equal(await node("details").isVisible(), false);
  await node("show").click(); assert.equal(await node("details").isVisible(), true);
  await page.waitForTimeout(400); await node("toggle").click(); assert.equal(await node("details").isVisible(), false);
  await node("toggle").click(); assert.equal(await node("details").isVisible(), true);
  await page.waitForTimeout(400); await node("close").click();
  await node("tab-tools").click(); assert.equal(await node("clothes").isVisible(), false); assert.equal(await node("tools").isVisible(), true);
  await node("tab-clothes").click(); assert.equal(await node("clothes").isVisible(), true); assert.equal(await node("tools").isVisible(), false);
  await node("missing").click(); assert.match(await page.textContent("#guideNote") || "", /outside this preview/);
  // The scroll canvas exposes actual content, and untagged UI stays static.
  assert.ok(await node("scroll").evaluate((e: HTMLElement) => e.scrollHeight > e.clientHeight));
  await node("scroll").hover(); await page.mouse.wheel(0, 200); await page.waitForTimeout(200);
  assert.ok(await node("scroll").evaluate((e: HTMLElement) => e.scrollTop > 0));
  assert.equal(await transform("shop"), rootTransform);
  await page.fill("#guideSearch", "no-such-tag"); assert.equal(await page.isVisible("#guideEmpty"), true);
  assert.equal(await page.isVisible("#guideStage"), true);
  await select("smooth"); await page.click("#guideSettings summary");
  await page.$eval("#guide-param-hover", (n: HTMLInputElement) => { n.value = "1.2"; n.dispatchEvent(new Event("input", { bubbles: true })); });
  await node("buy").hover(); await page.waitForTimeout(150); assert.match(await transform("buy"), /scale\(1.2,\s*1.2\)/);
  assert.equal(await page.evaluate(() => (window as any).guideMessages.length), 0);
  assert.equal(await transform("shop"), rootTransform);
  // Browsing every tag does not synthesize tags on the parent or replace the UI.
  for (const entry of catalogue) { await select(entry.tag); assert.equal(await node("buy").count(), 1); assert.equal(await transform("shop"), rootTransform); }
  await select("smooth"); assert.equal(await page.inputValue("#guide-param-hover"), "1.2");
  await page.click("#guidePause"); const paused = await transform("sparkle"); await page.waitForTimeout(120); assert.equal(await transform("sparkle"), paused);
  await page.click("#guideReplay"); assert.equal(await node("details").isVisible(), true);
  await page.waitForTimeout(400); await node("close").click();
  // Expand the same scene in the enlarged plugin window, then restore it.
  await page.click("#guideMaximize"); await page.setViewportSize({ width: 1080, height: 760 });
  assert.equal(await page.isVisible("#guideSearch"), false);
  assert.ok(await page.$eval("#guideStage", (e: HTMLElement) => e.clientHeight > 600));
  assert.match(await page.$eval("#guideStage", (e: Element) => getComputedStyle(e).backgroundImage), /radial-gradient/);
  const resizeRequest = await page.evaluate(() => (window as any).resizeMessages.at(-1)); assert.equal(resizeRequest.expanded, true);
  await node("buy").hover(); await page.waitForTimeout(150); assert.match(await transform("buy"), /scale\(1.2,\s*1.2\)/);
  await page.mouse.move(1, 1);
  await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-expanded.png", import.meta.url)) });
  await page.keyboard.press("Escape"); await page.setViewportSize({ width: 400, height: 680 });
  assert.equal(await page.isVisible("#guideSearch"), true);
  assert.equal(await page.evaluate(() => (window as any).resizeMessages.at(-1).expanded), false);
  await select("button"); await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-light.png", import.meta.url)), fullPage: true });
  await page.addStyleTag({ content: ':root { --figma-color-bg:#252525; --figma-color-text:#eee; --figma-color-bg-secondary:#363636; --figma-color-border:#505050; --figma-color-text-secondary:#aaa; }' });
  await page.screenshot({ path: fileURLToPath(new URL("../build/tag-guide-dark.png", import.meta.url)), fullPage: true });
  assert.equal(await page.$eval("body", (n: Element) => n.scrollWidth > innerWidth), false);
  // Replies for an older selection are ignored, including failed decodes.
  await page.evaluate(() => { (window as any).autoPreview = false; (window as any).FigloGuide.refresh(); }); await page.waitForTimeout(220);
  const old = await page.evaluate(() => (window as any).previewRequests.at(-1));
  await page.evaluate(() => (window as any).FigloGuide.selection({ count: 1, id: "other", name: "Other", tags: {} }));
  await page.evaluate((m: any) => (window as any).FigloGuide.preview({ ...m, ir: (window as any).previewIR, images: [], name: "Old" }), old);
  assert.equal(await page.locator(".preview-node").count(), 0);
  await page.waitForTimeout(220); const next = await page.evaluate(() => (window as any).previewRequests.at(-1));
  await page.evaluate((m: any) => (window as any).FigloGuide.preview({ ...m, name: "Other", ir: (window as any).previewIR, images: (window as any).previewImages }), next);
  assert.equal(await node("buy").count(), 1);
  await page.evaluate(() => (window as any).FigloGuide.refresh()); await page.waitForTimeout(220);
  const failed = await page.evaluate(() => (window as any).previewRequests.at(-1));
  await page.evaluate((m: any) => (window as any).FigloGuide.preview({ ...m, error: "Export failed" }), failed);
  assert.match(await page.textContent("#guideStage") || "", /Export failed/);
  await page.evaluate(() => (window as any).FigloGuide.selection({ count: 0, id: null, name: null, tags: {} }));
  assert.equal(await page.isDisabled("#guideApply"), true);
  const requests = await page.evaluate(() => (window as any).previewRequests.length);
  await page.click("#tabExport"); await page.evaluate(() => (window as any).FigloGuide.refresh()); await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => (window as any).previewRequests.length), requests);
  assert.deepEqual(errors, []);
  const reduced = await browser.newPage({ viewport: { width: 400, height: 680 }, reducedMotion: "reduce" });
  await reduced.goto(new URL("../figma/plugin/ui.html", import.meta.url).href);
  await reduced.evaluate(({ spec, tags }: any) => (window as any).FigloGuide.configure(spec, tags), { spec: EFFECTS, tags: [...KNOWN_TAGS] });
  await reduced.click("#tabGuide"); assert.equal(await reduced.textContent("#guidePause"), "Play");
  console.log("UI preview browser: gradients/tide, full text artwork/gleam, child tags, saved settings, composed effects, hover/press/release, nodim, when, navigation, scrolling, maximize/restore, dots, stale replies and reduced motion passed");
} finally { await browser.close(); }
