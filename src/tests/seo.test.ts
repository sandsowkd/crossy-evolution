import {strict as assert} from "node:assert";
import {test} from "node:test";
import {HOME_DESCRIPTION, HOME_TITLE, INDEXABLE_PATHS, metadataHtml, pageMetadata, safeJson, SITE_ORIGIN, structuredData} from "../visualization/page-metadata";
import {prerenderFile} from "../visualization/prerender-route";

test("published pages have unique metadata and a stable production canonical on every host", () => {
  const titles = new Set<string>(), descriptions = new Set<string>();
  for (const path of INDEXABLE_PATHS) {
    const metadata = pageMetadata(new URL(path, "http://localhost:4173"));
    assert.equal(metadata.canonical, SITE_ORIGIN + path);
    assert.equal(metadata.indexable, true);
    titles.add(metadata.title); descriptions.add(metadata.description);
    assert.equal((metadataHtml(metadata).match(/<title>/g) ?? []).length, 1);
    const graph = structuredData(metadata)["@graph"];
    assert.ok(graph.some(entity=>entity["@type"] === "WebSite"));
    assert.ok(!JSON.stringify(graph).includes("aggregateRating"));
  }
  assert.equal(titles.size, INDEXABLE_PATHS.length);
  assert.equal(descriptions.size, INDEXABLE_PATHS.length);
  const home = pageMetadata(new URL(SITE_ORIGIN));
  assert.equal(home.title, HOME_TITLE); assert.equal(home.description, HOME_DESCRIPTION);
});
test("replay state never becomes an indexable duplicate or gets homepage prerendering", () => {
  for (const path of ["/?generation=150&seed=0&variant=2", "/generation/85/seed/4294967295?variant=2", "/lab/variant-1"]) {
    const url = new URL(path, SITE_ORIGIN);
    assert.equal(pageMetadata(url).indexable, false);
    assert.ok(prerenderFile(url)?.startsWith("/_pages/"));
    assert.equal(url.href, new URL(path, SITE_ORIGIN).href);
  }
  assert.equal(pageMetadata(new URL("/play?variant=2&seed=42", SITE_ORIGIN)).canonical, `${SITE_ORIGIN}/play`);
  assert.equal(pageMetadata(new URL("/play?variant=2&seed=42", SITE_ORIGIN)).indexable, true);
  assert.equal(prerenderFile(new URL("/does-not-exist", SITE_ORIGIN)), undefined);
  assert.equal(prerenderFile(new URL("/lab/does-not-exist", SITE_ORIGIN)), undefined);
  assert.equal(prerenderFile(new URL("/replay/variant-1/does-not-exist", SITE_ORIGIN)), undefined);
  assert.equal(pageMetadata(new URL("/explore?variant=1", SITE_ORIGIN)).canonical, `${SITE_ORIGIN}/explore`);
});
test("bootstrap and schema JSON cannot terminate their script element", () => {
  const data = {value: '</script><img src=x onerror="alert(1)">\u2028&'};
  assert.ok(!safeJson(data).includes("</script>"));
  assert.deepEqual(JSON.parse(safeJson(data)), data);
});
