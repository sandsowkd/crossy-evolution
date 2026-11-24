/** Publish only the files used by the app, never the working training archives. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const build=path.resolve(".publication/friends-preview-build");
const destination=path.resolve(process.argv[2] ?? ".publication/friends-website/crossyroadai");
assert.equal(path.basename(destination),"crossyroadai");
assert.ok(fs.readFileSync(path.join(build,"index.html"),"utf8").includes("/crossyroadai/assets/"),"Build with --base=/crossyroadai/ first");
const staging=`${destination}-next`;
fs.rmSync(staging,{recursive:true,force:true});fs.mkdirSync(staging,{recursive:true});
const copy=(file:string)=>{
  const target=path.join(staging,file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(path.join(build,file),target,{recursive:true});
};
for(const file of ["index.html","assets","previews","upstream","homepage-data.json","highlights.json","explorer-catalog.json",
  "demo.json","trained-checkpoint.json","flock-preview.json","replay-audit.html","replay-audit","variant-2"]) copy(file);
const archives=new Map<string,string>();
function collect(value:unknown) {
  if(!value || typeof value!=="object")return;
  const record=value as Record<string,unknown>;
  if(typeof record.cohortFile==="string"){
    assert.match(record.cohortFile,/^\/training-cohorts\/[a-z0-9/-]+\.json\.gz$/);
    archives.set(record.cohortFile,record.cohortHash as string);
  }
  for(const child of Object.values(record))collect(child);
}
for(const name of ["explorer-catalog.json","highlights.json","demo.json","trained-checkpoint.json"])collect(JSON.parse(fs.readFileSync(path.join(staging,name),"utf8")));
let bytes=0;
for(const [file,hash]of archives){
  const buffer=fs.readFileSync(path.join(build,file));
  if(hash)assert.equal(createHash("sha256").update(gunzipSync(buffer)).digest("hex"),hash,file);
  copy(file.slice(1));bytes+=buffer.length;
}
// Keep the public homepage indexable. The host excludes parameterized replay
// pages and data assets through its scoped X-Robots-Tag headers and robots.txt.
// The optional audit is a standalone HTML document, outside Vite's URL handling.
const audit=path.join(staging,"replay-audit.html");
fs.writeFileSync(audit,fs.readFileSync(audit,"utf8")
  .replaceAll('href="/replay-audit/','href="/crossyroadai/replay-audit/')
  .replaceAll("fetch('/replay-audit/","fetch('/crossyroadai/replay-audit/")
  .replaceAll('href="/explore?','href="/crossyroadai/explore?')
  .replaceAll('href="/"','href="/crossyroadai/"')
  .replace('href="/generation/${r.generation}/seed/${data.seeds[0]}?variant=1"','href="/crossyroadai/?generation=${r.generation}&seed=${data.seeds[0]}&variant=1"'));
fs.writeFileSync(path.join(staging,"preview-release.json"),JSON.stringify({builtAt:new Date().toISOString(),base:"/crossyroadai/",archives:archives.size,archiveBytes:bytes})+"\n");
if(fs.existsSync(destination))fs.renameSync(destination,`${destination}-previous-${Date.now()}`);
fs.renameSync(staging,destination);
console.log(`Packaged ${archives.size} verified population archives (${(bytes/1024/1024).toFixed(1)} MiB) at ${destination}`);
