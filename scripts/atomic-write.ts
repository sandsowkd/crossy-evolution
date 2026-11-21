import fs from "node:fs";
/** Readers see the old or completed new snapshot, never a partially written checkpoint. */
export function writeAtomic(filename:string,data:string|Uint8Array){
 const temporary=`${filename}.${process.pid}.tmp`;
 fs.writeFileSync(temporary,data);
 fs.renameSync(temporary,filename);
}
