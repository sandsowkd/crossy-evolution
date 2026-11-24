/** Reuse identical archived payloads across public aliases; never alter a genome. */
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const files=["public/explorer-catalog.json","public/highlights.json","public/flock-preview.json","public/variant-2/flock-preview.json","public/demo.json","public/trained-checkpoint.json"];
const documents=files.filter(f=>fs.existsSync(f)).map(file=>({file,data:JSON.parse(fs.readFileSync(file,"utf8"))}));
type Ref={cohortFile:string;cohortHash:string};const references:Ref[]=[];
function collect(value:unknown){if(Array.isArray(value))value.forEach(collect);else if(value && typeof value==="object"){
 const ref=value as Partial<Ref>;if(ref.cohortFile?.startsWith("/training-cohorts/") && ref.cohortHash)references.push(ref as Ref);
 Object.values(value).forEach(collect);
}}
documents.forEach(d=>collect(d.data));const canonical=new Map<string,string>(),verified=new Set<string>();
for(const ref of references){
 if(!verified.has(ref.cohortFile)){const text=gunzipSync(fs.readFileSync(`public${ref.cohortFile}`));assert.equal(createHash("sha256").update(text).digest("hex"),ref.cohortHash);verified.add(ref.cohortFile);}
 const previous=canonical.get(ref.cohortHash);
 if(!previous || ref.cohortFile.length<previous.length || ref.cohortFile.length===previous.length && ref.cohortFile<previous)canonical.set(ref.cohortHash,ref.cohortFile);
}
let aliases=0;for(const ref of references){const file=canonical.get(ref.cohortHash)!;if(file!==ref.cohortFile){ref.cohortFile=file;aliases++;}}
for(const doc of documents)fs.writeFileSync(doc.file,JSON.stringify(doc.data)+"\n");
console.log(JSON.stringify({originalPaths:verified.size,uniquePayloads:canonical.size,aliasReferencesReused:aliases,genomesChanged:0}));
