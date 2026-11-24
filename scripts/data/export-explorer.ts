/** Export the reviewed replay catalog and complete saved populations; never train. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {parseEvolution} from "../../src/evolution/serialization";
import {validGenome} from "../../src/evolution/checkpoint";
import {isCohortArchivePath} from "../../src/evolution/archive-path";
import type {Genome} from "../../src/evolution/genome";
import type {ExplorerCatalog} from "../../src/visualization/explorer-data";

export function exportReplayArchive(variant?: 1 | 2) {
  const args=process.argv.slice(2),target=path.resolve(args.includes("--out") ? args[args.indexOf("--out")+1] : "public");
  const catalog=JSON.parse(fs.readFileSync("public/explorer-catalog.json","utf8")) as ExplorerCatalog;
  const seen=new Set<string>();
  for(const item of catalog.variants.filter(v=>variant===undefined || v.id===variant)) {
    assert.equal(item.sequence?.length,150);
    for(const row of [...item.phases.flatMap(p=>p.records),...item.sequence!]) {
      assert.ok(row.cohortFile && isCohortArchivePath(row.cohortFile));
      assert.ok(row.cohortFile.startsWith(`/training-cohorts/variant-${item.id}/`));
      if(seen.has(row.cohortFile))continue;
      const file=path.resolve(`public${row.cohortFile}`),body=fs.readFileSync(file),text=gunzipSync(body).toString();
      assert.equal(createHash("sha256").update(text).digest("hex"),row.cohortHash);
      const genomes=parseEvolution<{contenders:Genome[]}>(text).contenders;
      assert.equal(genomes.length,row.populationSize);assert.ok(genomes.every(validGenome));
      assert.equal(new Set(genomes.map(g=>g.id)).size,genomes.length);
      const out=path.join(target,row.cohortFile.slice(1));
      if(out!==file){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,body);}
      seen.add(row.cohortFile);
    }
  }
  if(target!==path.resolve("public")){fs.mkdirSync(target,{recursive:true});fs.copyFileSync("public/explorer-catalog.json",path.join(target,"explorer-catalog.json"));}
  console.log(`Verified/exported ${seen.size} complete saved population files; no evaluation or training.`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))exportReplayArchive();
