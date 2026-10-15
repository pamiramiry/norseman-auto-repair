// Rebuilds the FAQPage JSON-LD in index.html from the visible FAQ <details> blocks,
// so the schema always matches the page word for word. Run: node tools/sync-faq.js
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
let html = fs.readFileSync(file, "utf8");

const text = (s) => s
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ")
  .trim();

const faqBlock = html.slice(html.indexOf('<div class="faq">'), html.indexOf("<!-- ============ 5.16"));
const items = [...faqBlock.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<div class="faq__a">([\s\S]*?)<\/div>/g)]
  .map(([, q, a]) => ({
    "@type": "Question",
    name: text(q),
    acceptedAnswer: { "@type": "Answer", text: text(a) },
  }));

if (!items.length) throw new Error("No FAQ items found");

const schema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items };
const json = JSON.stringify(schema, null, 2).replace(/^/gm, "");
html = html.replace(
  /(<script type="application\/ld\+json" id="faq-schema">)[\s\S]*?(<\/script>)/,
  `$1\n${json}\n$2`
);
fs.writeFileSync(file, html);
console.log(`FAQPage schema written with ${items.length} questions.`);
