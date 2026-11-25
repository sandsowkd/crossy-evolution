import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {HomepagePlayback,visiblePreviews,type PreviewState,type PreviewViewport} from "../visualization/homepage-playback";

const phone: PreviewViewport={top:0,bottom:800,left:0,width:390,hidden:false};
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));};
class Media extends EventTarget {
  src="";paused=true;readyState=0;muted=false;defaultMuted=false;playsInline=false;autoplay=false;preload="none";
  plays=0;pauses=0;denied=false;deferred?: Promise<void>;
  attributes=new Map<string,string>();
  getAttribute(name:string){return name==="src"?this.src||null:this.attributes.get(name)??null;}
  setAttribute(name:string,value:string){this.attributes.set(name,value);}
  removeAttribute(name:string){if(name==="src")this.src="";else this.attributes.delete(name);}
  load(){this.readyState=0;}
  play(){
    this.plays++;
    if(this.denied)return Promise.reject(new DOMException("Autoplay declined","NotAllowedError"));
    this.paused=false;return this.deferred??Promise.resolve();
  }
  pause(){if(!this.paused){this.paused=true;this.pauses++;this.dispatchEvent(new Event("pause"));}}
}
function add(playback: HomepagePlayback,top:number,automatic=true){
  const media=new Media(),states: PreviewState[]=[],position={top};
  const host={getBoundingClientRect:()=>({top:position.top,bottom:position.top+180,left:0,right:390,width:390,height:180})};
  const control=playback.register({host:host as HTMLElement,media:media as unknown as HTMLVideoElement,
    source:"/desktop.mp4",mobileSource:"/mobile.mp4",automatic,onState:state=>states.push(state)});
  return {media,position,states,control};
}

test("phone playback follows the visible reading order; desktop can play both bloodlines",()=>{
  const candidates=[{id:0,automatic:true,requested:false,ratio:1,center:190},
    {id:1,automatic:true,requested:false,ratio:1,center:530}];
  assert.deepEqual(visiblePreviews(candidates,phone),[0]);
  assert.deepEqual(visiblePreviews(candidates.map((item,i)=>({...item,ratio:i?1:0})),phone),[1]);
  assert.equal(visiblePreviews(candidates,{...phone,width:1280}).length,2);
  assert.equal(visiblePreviews(candidates.map(item=>({...item,paired:true})),phone).length,2,"Both fully visible bloodlines should run");
  assert.deepEqual(visiblePreviews(candidates,{...phone,hidden:true}),[]);
  assert.deepEqual(visiblePreviews([...candidates,{id:2,automatic:false,requested:true,ratio:1,center:240}],phone),[2]);
});

test("only a visible preview loads and plays; scrolling pauses it and starts the next phone source",async()=>{
  const playback=new HomepagePlayback(),first=add(playback,100),second=add(playback,1300);
  playback.refresh(phone);await settle();
  assert.equal(first.media.src,"/mobile.mp4");assert.equal(first.media.paused,false);
  assert.equal(second.media.src,"");assert.equal(second.media.plays,0);
  first.position.top=-1200;second.position.top=100;
  playback.refresh(phone);await settle();
  assert.equal(first.media.paused,true);assert.equal(first.media.src,"","Distant decoders and downloads are released");
  assert.equal(second.media.src,"/mobile.mp4");assert.equal(second.media.paused,false);
  playback.refresh({...phone,hidden:true});await settle();
  assert.equal(second.media.paused,true);assert.equal(second.media.src,"");
});

test("only the next nearby main video warms metadata after current playback is ready",async()=>{
  const playback=new HomepagePlayback(),first=add(playback,100),next=add(playback,1000),far=add(playback,1700);
  playback.refresh(phone);await settle();assert.equal(next.media.src,"");
  first.media.readyState=3;first.media.dispatchEvent(new Event("canplay"));await settle();
  assert.equal(next.media.src,"/mobile.mp4");assert.equal(next.media.preload,"metadata");
  assert.equal(next.media.autoplay,false);assert.equal(next.media.plays,0);assert.equal(far.media.src,"");
});

test("autoplay rejection becomes a recoverable tap action, without retrying on every scroll",async()=>{
  const playback=new HomepagePlayback(),entry=add(playback,100);entry.media.denied=true;
  playback.refresh(phone);await settle();
  assert.equal(entry.states.at(-1),"blocked");assert.equal(entry.media.plays,1);
  assert.ok(entry.media.muted&&entry.media.defaultMuted&&entry.media.playsInline);
  playback.refresh(phone);await settle();assert.equal(entry.media.plays,1);
  entry.media.denied=false;entry.control.retry();await settle();
  assert.equal(entry.media.paused,false);assert.equal(entry.states.at(-1),"playing");
});

test("late play promises cannot restart an off-screen or unmounted video",async()=>{
  const playback=new HomepagePlayback(),entry=add(playback,100);
  let finish!: ()=>void;entry.media.deferred=new Promise(resolve=>{finish=resolve;});
  playback.refresh(phone);entry.position.top=2000;playback.refresh(phone);entry.control.dispose();
  finish();await settle();assert.equal(entry.media.paused,true);assert.notEqual(entry.states.at(-1),"playing");
});

test("a stale playback callback cannot pause a remounted video or misreport a queued pause event",async()=>{
  const playback=new HomepagePlayback(),old=add(playback,100);
  let finish!: ()=>void;old.media.deferred=new Promise(resolve=>{finish=resolve;});
  playback.refresh(phone);old.control.dispose();old.media.deferred=undefined;
  const states: PreviewState[]=[];
  playback.register({host:{getBoundingClientRect:()=>({top:100,bottom:280,left:0,right:390,width:390,height:180})} as HTMLElement,
    media:old.media as unknown as HTMLVideoElement,source:"/desktop.mp4",mobileSource:"/mobile.mp4",automatic:true,onState:state=>states.push(state)});
  playback.refresh(phone);await settle();assert.equal(old.media.paused,false);
  finish();await settle();assert.equal(old.media.paused,false,"The new owner is already playing");
  old.media.dispatchEvent(new Event("pause"));
  assert.equal(states.at(-1),"playing","Ignore a queued pause event when the video has already resumed");
});

test("phone encodes are smaller, inline-compatible, seekable copies of every website recording",()=>{
  const read=(file:string)=>fs.readFileSync(new URL(`../../${file}`,import.meta.url));
  const data=JSON.parse(read("public/homepage-data.json").toString());
  const encoded=JSON.parse(read("docs/media/mobile-previews.json").toString());
  assert.equal(encoded.clips.length,data.clips.length);
  for(const clip of encoded.clips){
    const source=data.clips.find((row:{id:string})=>row.id===clip.id);
    assert.equal(source.mobileVideo,clip.file);assert.equal(source.video,clip.source);
    const bytes=read(`public${clip.file}`);assert.equal(bytes.length,clip.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),clip.sha256);
    assert.ok(clip.bytes<clip.originalBytes);assert.equal(clip.width,480);
    assert.equal(clip.profile,"Constrained Baseline");assert.equal(clip.pixelFormat,"yuv420p");
    let offset=0;const atoms=[];
    while(offset+8<bytes.length){const size=bytes.readUInt32BE(offset);atoms.push(bytes.toString("ascii",offset+4,offset+8));if(!size)break;offset+=size;}
    assert.ok(atoms.indexOf("moov")<atoms.indexOf("mdat"),"Fast-start metadata must precede video data");
  }
});
