/** Smaller, inline-compatible copies of the existing recordings; no replay is simulated. */
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import type {HomepageData} from "../../src/visualization/homepage-data";

const run = (command: string, args: string[]) => new Promise<string>((resolve,reject)=>{
  const child=spawn(command,args), chunks: Buffer[]=[];
  child.stdout.on("data",chunk=>chunks.push(chunk));
  child.stderr.on("data",chunk=>{if(command==="ffmpeg")process.stderr.write(chunk);});
  child.on("error",reject);
  child.on("exit",code=>code===0?resolve(Buffer.concat(chunks).toString()):reject(new Error(`${command} exited ${code}`)));
});
const probe = async (file: string) => JSON.parse(await run("ffprobe",["-v","error","-show_entries",
  "format=duration:stream=width,height,nb_frames,pix_fmt,profile,level","-of","json",file])) as {
  format:{duration:string};streams:{width:number;height:number;nb_frames:string;pix_fmt:string;profile:string;level:number}[]};
let source=await fs.readFile("public/homepage-data.json","utf8");
const data=JSON.parse(source) as HomepageData;
await fs.mkdir("public/previews/mobile",{recursive:true});
const clips=[];
for(const clip of data.clips){
  const input=path.join("public",clip.video.split("?")[0]), mobileVideo=`/previews/mobile/${clip.id}.mp4`;
  const output=path.join("public",mobileVideo);
  await run("ffmpeg",["-y","-loglevel","error","-i",input,"-vf","scale=480:-2:flags=lanczos:out_range=tv,format=yuv420p",
    "-c:v","libx264","-profile:v","baseline","-level:v","3.0","-preset","slow","-crf","26",
    "-maxrate","600k","-bufsize","1200k","-g","30","-keyint_min","30","-sc_threshold","0",
    "-pix_fmt","yuv420p","-color_range","tv","-an","-movflags","+faststart",output]);
  const before=await probe(input),after=await probe(output),stream=after.streams[0];
  if(before.format.duration!==after.format.duration||before.streams[0].nb_frames!==stream.nb_frames)
    throw new Error(`Timing changed for ${clip.id}`);
  const bytes=await fs.readFile(output),originalBytes=(await fs.stat(input)).size;
  if(bytes.length>=originalBytes)throw new Error(`Mobile copy grew: ${clip.id}`);
  clips.push({id:clip.id,source:clip.video,file:mobileVideo,bytes:bytes.length,originalBytes,
    seconds:Number(after.format.duration),frames:Number(stream.nb_frames),width:stream.width,height:stream.height,
    profile:stream.profile,pixelFormat:stream.pix_fmt,level:stream.level,sha256:createHash("sha256").update(bytes).digest("hex")});
  if(!clip.mobileVideo){
    const original=`"video":${JSON.stringify(clip.video)}`;
    if(!source.includes(original))throw new Error(`Missing video metadata: ${clip.id}`);
    source=source.replace(original,`${original},"mobileVideo":${JSON.stringify(mobileVideo)}`);
  }
  console.log(`${clip.id}: ${Math.round(bytes.length/originalBytes*100)}% of original bytes`);
}
await fs.writeFile("public/homepage-data.json",source);
await fs.writeFile("docs/media/mobile-previews.json",JSON.stringify({createdAt:new Date().toISOString(),
  description:"Phone-sized transcodes of the same complete website recordings, with unchanged frames and timing.",clips},null,2)+"\n");
