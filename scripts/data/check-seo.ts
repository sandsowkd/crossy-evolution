/** Checks the actual release HTML and route configuration, without rendering game episodes. */
import assert from "node:assert/strict";
import {readFile, stat} from "node:fs/promises";
import {INDEXABLE_PATHS, pageMetadata, SITE_ORIGIN} from "../../src/visualization/page-metadata";
import {prerenderFile} from "../../src/visualization/prerender-route";
const dir = process.argv[2] ?? "dist";
// Canonical files would shadow query-conditioned rewrites on Vercel.
for (const file of ["index.html", "play.html", "explore.html"])
  await assert.rejects(stat(`${dir}/${file}`), {code: "ENOENT"});
for (const route of INDEXABLE_PATHS) {
  const url = new URL(route, SITE_ORIGIN), file = prerenderFile(url)!;
  const html = await readFile(dir + file, "utf8"), metadata = pageMetadata(url);
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/name="description"/g) ?? []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  assert.ok(html.includes(`<title>${metadata.title}</title>`));
  assert.ok(html.includes('name="robots" content="index, follow'));
  assert.ok(html.includes('<div id="root">') && !html.includes('<div id="root"></div>'));
  assert.ok(html.includes("<h1") && html.includes("<main"));
  assert.ok(html.includes('id="site-bootstrap"'));
  const graph = JSON.parse(html.match(/id="site-structured-data">(.*?)<\/script>/s)![1]);
  assert.equal(graph["@context"], "https://schema.org");
  for (const ref of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[^\"]*)"/g)) {
    if (/\.(?:css|js|jpg|png|svg|ico)$/.test(ref[1])) await stat(dir + ref[1]);
  }
  console.log(`PASS ${route}: rendered content, unique metadata, schema, referenced assets`);
}
const home = await readFile(`${dir}/_pages/home.html`, "utf8");
for (const text of ["Teaching the chicken to cross the road.", "The experiment", "Variant 2: Cars, trains, and logs", "Not affiliated with"]) assert.ok(home.includes(text));
const sitemap = await readFile(`${dir}/sitemap.xml`, "utf8");
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(item=>item[1]), INDEXABLE_PATHS.map(route=>SITE_ORIGIN + route));
assert.ok(!sitemap.includes("lastmod"));
assert.equal(await readFile(`${dir}/robots.txt`, "utf8"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
const config = JSON.parse(await readFile("vercel.json", "utf8"));
assert.ok(!config.headers.some((rule: {source: string})=>rule.source.includes("play|explore")));
assert.ok(config.redirects.some((rule: {has?: {type: string; value: string}[]})=>rule.has?.some(item=>item.type === "host" && item.value === "crossy-road-ai.vercel.app")));
console.log("PASS sitemap, robots, homepage text, and indexable-route/production-host configuration");
