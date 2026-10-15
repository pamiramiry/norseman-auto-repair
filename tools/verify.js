// Rendered checks in headless Chrome. Run: node tools/verify.js
// Needs puppeteer (and optionally sharp). Set NODE_PATH to a folder where they are installed.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const root = path.join(__dirname, "..");
const PHRASE = "Auto Repair in Etobicoke";
const DESC = "Auto Repair in Etobicoke. Mechanical, brakes, tires and body work on Norseman St, with honest diagnosis and fair prices. Call (289) 244-7969.";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label, extra !== undefined ? JSON.stringify(extra) : ""); }
};
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

(async () => {
  await new Promise((r) => server.listen(5179, r));
  const url = "http://localhost:5179/";
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/maps|google|gstatic|ERR_|net::/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (r.url().startsWith(url)) errors.push("failed " + r.url()); });

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: "networkidle0" });
  const src = read("index.html");

  console.log("\nExact-match phrase");
  const seo = await page.evaluate(() => {
    const m = (s) => (document.querySelector(s) ? document.querySelector(s).getAttribute("content") : "");
    const h1 = document.querySelector("h1");
    let p = h1.nextElementSibling;
    while (p && p.tagName !== "P") p = p.nextElementSibling;
    return {
      title: document.title, h1: h1.textContent.trim(), first: p.textContent.trim(),
      desc: m('meta[name="description"]'), ogt: m('meta[property="og:title"]'), ogd: m('meta[property="og:description"]'),
      twt: m('meta[name="twitter:title"]'), twd: m('meta[name="twitter:description"]'),
      alt: document.querySelector(".hero__media img").alt,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      h1count: document.querySelectorAll("h1").length,
      h2s: [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()),
      finalH2: document.querySelector("#contact h2").textContent.trim(),
      heroFile: document.querySelector(".hero__media img").getAttribute("src"),
    };
  });
  ok(seo.title === "Auto Repair in Etobicoke | Norseman Auto Repair", "title", seo.title);
  ok(seo.h1 === PHRASE, "H1", seo.h1);
  ok(seo.first === "Auto Repair in Etobicoke, from a West End shop that finds the real problem first and charges a fair price to fix it.", "first sentence after H1");
  ok(seo.desc === DESC, "meta description");
  ok(seo.ogt === seo.title && seo.twt === seo.title, "og:title + twitter:title match title");
  ok(seo.ogd === DESC && seo.twd === DESC, "og/twitter description match meta description");
  ok(seo.alt === "Auto repair in Etobicoke at Norseman Auto Repair", "hero alt (as specified)");
  ok(seo.heroFile.endsWith("auto-repair-etobicoke-norseman-auto-repair.webp"), "hero filename");
  ok(seo.finalH2 === "Book Auto Repair in Etobicoke", "final CTA H2");

  console.log("\nJSON-LD");
  let business, faq;
  try {
    const parsed = seo.ld.map((t) => JSON.parse(t));
    business = parsed.find((x) => x["@type"] === "AutoRepair");
    faq = parsed.find((x) => x["@type"] === "FAQPage");
    ok(true, "all JSON-LD blocks parse");
  } catch (e) { ok(false, "all JSON-LD blocks parse", e.message); }
  ok(business && business.description === DESC, "AutoRepair description = meta description");
  ok(business && !JSON.stringify(business).includes("aggregateRating") && !src.includes("aggregateRating"), "no aggregateRating");
  ok(business && business.priceRange === "$$" && business.openingHoursSpecification.length === 2 && business.geo, "priceRange, hours spec, geo");
  const faqDom = await page.evaluate(() => [...document.querySelectorAll(".faq details")].map((d) => ({
    q: d.querySelector("summary").textContent.replace(/\s+/g, " ").trim(),
    a: d.querySelector(".faq__a").textContent.replace(/\s+/g, " ").trim(),
  })));
  ok(faq && faq.mainEntity.length === faqDom.length, "FAQPage question count matches (" + faqDom.length + ")");
  ok(faq && faq.mainEntity.every((q, i) => q.name === faqDom[i].q && q.acceptedAnswer.text === faqDom[i].a), "FAQPage text matches FAQ 1:1");
  ok(faqDom[0] && /cost/i.test(faqDom[0].q), "cost question first");

  console.log("\nHeadings");
  ok(seo.h1count === 1, "exactly one H1", seo.h1count);
  const badH2 = seo.h2s.filter((h) => !/Auto Repair|Mechanic|Tire/.test(h));
  ok(badH2.length === 0, "every H2 has Auto Repair/Mechanic/Tire (" + seo.h2s.length + " H2s)", badH2);
  const withEto = seo.h2s.filter((h) => /Etobicoke/.test(h)).length;
  ok(withEto / seo.h2s.length > 0.5, "most H2s contain Etobicoke (" + withEto + "/" + seo.h2s.length + ")");

  console.log("\nImages");
  const imgs = await page.evaluate(() => [...document.querySelectorAll("img")].map((i) => ({
    src: i.getAttribute("src"), alt: i.getAttribute("alt"), w: i.getAttribute("width"), h: i.getAttribute("height"),
    loading: i.getAttribute("loading"), fp: i.getAttribute("fetchpriority"), hero: !!i.closest(".hero"),
  })));
  ok(imgs.every((i) => i.alt && i.alt.length > 10), "every img has descriptive alt");
  ok(imgs.every((i) => i.w && i.h), "every img has width + height");
  ok(imgs.every((i) => /^images\/[a-z0-9-]+\.webp$/.test(i.src) && fs.existsSync(path.join(root, i.src))), "kebab-case webp files that exist");
  ok(imgs.filter((i) => !i.hero).every((i) => i.loading === "lazy"), "below-fold images lazy");
  ok(imgs.filter((i) => i.hero).every((i) => i.fp === "high" && i.loading !== "lazy"), "hero fetchpriority=high, not lazy");
  const log = read("images/IMAGE-SOURCES.md");
  const files = fs.readdirSync(path.join(root, "images")).filter((f) => f.endsWith(".webp"));
  ok(files.every((f) => log.includes(f)), "every webp logged in IMAGE-SOURCES.md", files.filter((f) => !log.includes(f)));
  ok(!/wikimedia|shutterstock|istock|gettyimages/i.test(log), "only allowed sources in log");
  const phCount = await page.evaluate(() => document.querySelectorAll("figure.ph").length);
  ok(phCount === 4, "4 placeholder slots (3 photos + 1 video)", phCount);
  let sharp = null;
  try { sharp = require("sharp"); } catch (e) { /* optional */ }
  if (sharp) {
    const want = { "auto-repair-etobicoke-norseman-auto-repair-og.webp": [1200, 630], "auto-repair-etobicoke-norseman-auto-repair.webp": [1600, 1000] };
    for (const f of Object.keys(want)) {
      const m = await sharp(path.join(root, "images", f)).metadata();
      ok(m.width === want[f][0] && m.height === want[f][1] && !m.exif, f + " is " + want[f].join("x") + ", no EXIF");
    }
    const metas = await Promise.all(files.map((f) => sharp(path.join(root, "images", f)).metadata()));
    ok(metas.every((m) => !m.exif && !m.xmp), "no metadata on any webp");
  }

  console.log("\nCopy rules");
  const visible = await page.evaluate(() => document.body.innerText);
  const all = src + read("css/styles.css") + read("js/main.js") + read("DESIGN-RULES.md") + log + read("images/IMAGE-LIST.md") + read("tools/sync-faq.js");
  ok(!/[–—]|&mdash;|&ndash;/.test(all), "no em or en dashes in any file");
  const banned = ["look no further", "in today's world", "elevate", "seamless", "unparalleled", "top-notch", "one-stop shop", "pride ourselves", "state-of-the-art", "peace of mind", "hassle-free", "#1", "best in etobicoke", "cheapest", "free diagnos", "same-day guarantee"];
  const lowVis = visible.toLowerCase();
  ok(banned.every((b) => !lowVis.includes(b)), "no banned phrases", banned.filter((b) => lowVis.includes(b)));
  const competitors = ["canadian tire", "midas", "mr. lube", "mr lube", "jiffy", "kal tire", "speedy", "meineke", "pep boys", "firestone", "ok tire", "active green", "monro", "costco", "walmart"];
  const lowSrc = src.toLowerCase();
  ok(competitors.every((c) => !lowSrc.includes(c)), "no competitor names", competitors.filter((c) => lowSrc.includes(c)));
  ok(!/(Alex|Ben|Adam|Vlad|Victor|Walter)/.test(src), "no staff named except Eddie");
  ok(/Eddie owns the shop/.test(visible), "Eddie named as owner");
  ok(!/muffler|exhaust/i.test(visible), "no muffler/exhaust services");
  ok(!/walk-in|walk in|no appointment/i.test(visible), "no walk-in promise");
  ok(!/viking|norse(?!man)|helmet/i.test(visible), "no Viking/Norse imagery words");
  ok(!/language|punjabi|russian|ukrainian|spanish|portuguese|arabic|polish/i.test(visible), "no languages mentioned");
  ok(!/Norseman Auto(?! Repair)/.test(seo.h2s.join(" ") + seo.h1), "brand never shortened in headings");

  console.log("\nStructure");
  const st = await page.evaluate(() => ({
    offers: document.querySelectorAll(".offer").length,
    places: [".hero .offer", ".glance .offer", "#compare .offer", ".faq details:first-child .offer", ".offer-banner .offer"].map((s) => !!document.querySelector(s)),
    brand: [...document.querySelectorAll(".brand-line")].map((b) => b.textContent.trim()),
    brandWhere: [".hero .brand-line", "#why-us .brand-line", ".site-footer .brand-line"].map((s) => !!document.querySelector(s)),
    ctaPairs: document.querySelectorAll(".cta-pair").length,
    sections: [...document.querySelectorAll("main > section")].map((s) => ({
      id: s.id || s.className,
      lab: s.getAttribute("aria-labelledby") || s.getAttribute("aria-label"),
      cta: !!s.querySelector(".cta-pair, .btn--big, .btn--black"),
    })),
    confirms: document.querySelectorAll(".confirm").length,
    skip: !!document.querySelector('a.skip-link[href="#main"]'),
  }));
  ok(st.offers === 5 && st.places.every(Boolean), "signature offer in hero, strip, table, FAQ #1, banner", st.places);
  ok(st.brand.length === 3 && st.brandWhere.every(Boolean) && st.brand.every((b) => b === "We find the real problem first. Then we fix only that."), "brand line in hero, why us, footer");
  ok(st.sections.every((s) => s.lab), "every section labelled");
  const noCta = st.sections.filter((s) => !/glance/.test(s.id) && !s.cta);
  ok(noCta.length === 0, "every major section ends with a CTA", noCta);
  ok(st.skip, "skip link");
  console.log("  INFO " + st.confirms + " [CONFIRM] placeholders visible, " + st.ctaPairs + " CTA pairs");

  console.log("\nContrast (every visible text element vs its painted background)");
  const contrast = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const blend = (top, bot) => { const a = top.length === 4 ? top[3] : 1; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)); };
    const bgOf = (el) => {
      const stack = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length === 4 && c[3] === 0) continue;
        stack.push(c);
        if (c.length === 3 || c[3] === 1) break;
      }
      let base = [255, 255, 255];
      for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
      return base;
    };
    const fails = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; const el = n.parentElement;
      if (!n.textContent.trim() || !el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest(".visually-hidden, .sprite, script, style, .skip-link, .site-nav:not(.is-open) ~ x")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || el.getClientRects().length === 0) continue;
      const bg = bgOf(el);
      const fg = blend(parse(cs.color), bg);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need) fails.push(el.tagName + "." + el.className + ' "' + n.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2));
    }
    return fails;
  });
  ok(contrast.length === 0, "all text meets WCAG AA", contrast.slice(0, 12));

  console.log("\nResponsive");
  for (const w of [360, 390, 768, 1024, 1440]) {
    await page.setViewport({ width: w, height: 800 });
    await page.reload({ waitUntil: "networkidle0" });
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll("body *")].filter((e) => {
        if (e.closest(".reviews, .sprite, .visually-hidden, .skip-link")) return false;
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > de.clientWidth + 1 || b.left < -1);
      }).map((e) => e.tagName + "." + e.className).slice(0, 5);
      return {
        sw: de.scrollWidth, cw: de.clientWidth, wide,
        bar: getComputedStyle(document.querySelector(".mobile-bar")).display !== "none",
        tableBlock: getComputedStyle(document.querySelector(".compare__table tr")).display,
        smallTargets: [...document.querySelectorAll(".btn, .mobile-bar a, .nav-toggle, .header-call")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 47.5).map((b) => b.className),
      };
    });
    ok(r.sw <= r.cw && r.wide.length === 0, "no horizontal overflow at " + w + "px", r.wide);
    ok(r.bar === (w < 900), "mobile bar " + (w < 900 ? "shown" : "hidden") + " at " + w + "px");
    ok(r.smallTargets.length === 0, "buttons at least 48px tall at " + w + "px", r.smallTargets);
    if (w < 768) ok(r.tableBlock === "block", "comparison table stacks at " + w + "px");
  }

  await page.setViewport({ width: 390, height: 800 });
  await page.reload({ waitUntil: "networkidle0" });
  const cover = await page.evaluate(async () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 300));
    return {
      lastBottom: document.querySelector(".site-footer__base").getBoundingClientRect().bottom,
      barTop: document.querySelector(".mobile-bar").getBoundingClientRect().top,
    };
  });
  ok(cover.lastBottom <= cover.barTop + 1, "mobile bar does not cover footer", cover);

  console.log("\nInteraction");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => document.querySelector(".nav-toggle").click());
  const menu = await page.evaluate(() => ({ exp: document.querySelector(".nav-toggle").getAttribute("aria-expanded"), vis: getComputedStyle(document.getElementById("site-nav")).display }));
  ok(menu.exp === "true" && menu.vis !== "none", "hamburger opens menu");
  await page.keyboard.press("Escape");
  ok(await page.evaluate(() => document.querySelector(".nav-toggle").getAttribute("aria-expanded") === "false"), "Escape closes menu");
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await new Promise((r) => setTimeout(r, 250));
  ok(await page.evaluate(() => document.querySelector(".site-header").classList.contains("is-compact")), "header compacts on scroll");
  ok(await page.evaluate(() => document.querySelectorAll(".hours tr.is-today").length === 1), "today's hours row highlighted");
  const before = await page.evaluate(() => [...document.querySelectorAll(".count")].map((c) => c.textContent));
  await page.evaluate(() => document.querySelector(".stats").scrollIntoView({ behavior: "instant" }));
  await new Promise((r) => setTimeout(r, 700));
  const mid = await page.evaluate(() => [...document.querySelectorAll(".count")].map((c) => +c.textContent));
  await new Promise((r) => setTimeout(r, 1800));
  const after = await page.evaluate(() => [...document.querySelectorAll(".count")].map((c) => c.textContent + "/" + c.dataset.count));
  ok(before.every((v) => v === "0") && mid[0] > 0 && mid[0] < 65 && after.every((v) => v.split("/")[0] === v.split("/")[1]), "stats roll from 0 up to their real values", { before, mid, after });
  ok(await page.evaluate(() => [...document.querySelectorAll(".stats__num .visually-hidden")].map((e) => e.textContent).join() === "65,3,6"), "screen readers get final stat values");

  await page.evaluate(() => document.querySelector("#quote button[type=submit]").click());
  const empty = await page.evaluate(() => ({ s: document.querySelector(".quote__status").className, inv: document.querySelectorAll('#quote [aria-invalid="true"]').length }));
  ok(/is-error/.test(empty.s) && empty.inv >= 4, "empty form shows errors", empty);
  await page.evaluate(() => {
    const f = document.getElementById("quote");
    f.elements.name.value = "Test"; f.elements.phone.value = "4165550100"; f.elements.vehicle.value = "2014 Honda Civic";
    f.elements.issue.value = "won't start"; f.elements.service.value = "Mechanical";
    f.querySelector("button[type=submit]").click();
  });
  ok(await page.evaluate(() => /is-success/.test(document.querySelector(".quote__status").className)), "valid form shows inline success");
  ok(await page.evaluate(() => [...document.querySelectorAll("#quote input:not([type=radio]), #quote select, #quote textarea")].every((i) => document.querySelector('label[for="' + i.id + '"]'))), "every form field has a label");

  ok(errors.length === 0, "no console or page errors", errors);

  await browser.close();
  server.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
