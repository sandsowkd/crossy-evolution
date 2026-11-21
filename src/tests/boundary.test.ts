import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
test("core and evolution evaluate with no renderer imports; core has no ambient randomness or clock", () => {
  for (const directory of ["core", "evolution"])
    for (const name of fs.readdirSync(`src/${directory}`)) {
      if (!name.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join("src", directory, name), "utf8");
      assert.doesNotMatch(
        source,
        /from\s+['"](?:three|react|gsap|expo|.*visualization)/,
      );
      if (directory === "core")
        assert.doesNotMatch(
          source,
          /Math\.random\(|Date\.now\(|requestAnimationFrame\(|setTimeout\(|\bdocument\.|\bwindow\./,
        );
    }
});
