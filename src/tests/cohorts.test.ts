import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Trainer } from "../evolution/trainer";
import { DEFAULT_CONFIG } from "../core/types";
import { stringifyEvolution } from "../evolution/serialization";
import { loadCohort } from "../visualization/cohorts";

test("complete gzip populations load losslessly, cache by content hash and reject mismatched archives", async () => {
  const trainer = new Trainer({
    population: 50,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 24 },
  });
  const record = trainer.runGeneration();
  const text = stringifyEvolution({ contenders: record.contenders });
  const compressed = new Uint8Array(gzipSync(text));
  const manifest = {
    ...record,
    contenders: [record.champion],
    cohortFile: "/training-cohorts/99998.json.gz",
    cohortHash: createHash("sha256").update(text).digest("hex"),
  };
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(compressed.buffer, {
      headers: { "content-type": "application/gzip" },
    });
  };
  try {
    assert.deepEqual(
      (await loadCohort(manifest)).contenders,
      record.contenders,
    );
    assert.deepEqual(
      (await loadCohort(manifest)).contenders,
      record.contenders,
    );
    assert.equal(requests, 1);
    await assert.rejects(
      loadCohort({ ...manifest, cohortHash: "0".repeat(64) }),
      /different run|damaged/i,
    );
    await assert.rejects(
      loadCohort({
        ...manifest,
        cohortFile: "https://example.com/population.json",
      }),
      /path/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("population namespaces preserve legacy paths and reject unsafe or nested archive locations", async () => {
  const record = new Trainer({
    population: 50,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 12 },
  }).runGeneration();
  const text = stringifyEvolution({ contenders: record.contenders });
  const compressed = new Uint8Array(gzipSync(text));
  const manifest = {
    ...record,
    contenders: [record.champion],
    cohortHash: createHash("sha256").update(text).digest("hex"),
  };
  const originalFetch = globalThis.fetch;
  const fetched: string[] = [];
  globalThis.fetch = async (input) => {
    fetched.push(String(input));
    return new Response(compressed.buffer);
  };
  try {
    for (const file of [
      "/training-cohorts/99997.json.gz",
      "/training-cohorts/warm-v3-100/99997.json.gz",
      `/training-cohorts/${"a".repeat(64)}/99997.json.gz`,
      "/training-cohorts/0/99997.json.gz",
    ]) {
      assert.deepEqual(
        (await loadCohort({ ...manifest, cohortFile: file })).contenders,
        record.contenders,
      );
    }
    assert.equal(fetched.length, 4);
    for (const file of [
      "/training-cohorts/../99997.json.gz",
      "/training-cohorts/%2e%2e/99997.json.gz",
      "/training-cohorts/run/nested/99997.json.gz",
      "/training-cohorts/UPPER/99997.json.gz",
      "/training-cohorts/under_score/99997.json.gz",
      "/training-cohorts/-run/99997.json.gz",
      "/training-cohorts/run-/99997.json.gz",
      `/training-cohorts/${"a".repeat(65)}/99997.json.gz`,
      "/training-cohorts/run/9999.json.gz",
      "/training-cohorts/run/99997.json.gz?other=run",
    ]) {
      await assert.rejects(loadCohort({ ...manifest, cohortFile: file }), /path/i);
    }
    assert.equal(fetched.length, 4, "Unsafe paths must fail before fetching");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
