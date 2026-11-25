export type PreviewState = "idle" | "loading" | "playing" | "blocked" | "error";
export type PreviewViewport = {top: number; bottom: number; left: number; width: number; hidden: boolean};
type Candidate = {id: number; automatic: boolean; requested: boolean; ratio: number; center: number; paired?: boolean};

/** Prefer the visible reading position; a fully visible bloodline pair can play together. */
export function visiblePreviews(candidates: Candidate[], viewport: PreviewViewport) {
  if (viewport.hidden) return [];
  const height=viewport.bottom-viewport.top,middle=viewport.top+height*.3;
  const visible=candidates.filter(item=>item.ratio>=(item.automatic ? .15 : .01));
  const manual=visible.filter(item=>item.requested);
  const ranked=(manual.length?manual:visible.filter(item=>item.automatic))
    .sort((a,b)=>(b.ratio-Math.abs(b.center-middle)/height*.25)-(a.ratio-Math.abs(a.center-middle)/height*.25)||a.id-b.id);
  const pair=ranked.length>1&&ranked.slice(0,2).every(item=>item.paired&&item.ratio>=.75);
  const count=manual.length?1:viewport.width>760||pair?2:1;
  return ranked.slice(0,count).map(item=>item.id);
}

type Options = {host: HTMLElement; media: HTMLVideoElement; source: string; mobileSource?: string;
  automatic: boolean; paired?: boolean; poster?: string; onState: (state: PreviewState)=>void; onHidden?: ()=>void};
type Entry = Options & {id: number; requested: boolean; selected: boolean; state: PreviewState;
  alive: boolean; pending: boolean; blocked: boolean; token: number; intersecting?: boolean; cleanup: ()=>void};

/** Shared visibility, loading and recovery for homepage recordings. No simulation runs here. */
export class HomepagePlayback {
  private entries=new Map<number,Entry>();
  private nextId=0;
  private root?: HTMLElement;
  private observer?: IntersectionObserver;
  private frame=0;
  private viewport?: PreviewViewport;
  register(options: Options) {
    const entry: Entry={...options,id:this.nextId++,requested:false,selected:false,state:"idle",alive:true,
      pending:false,blocked:false,token:0,cleanup:()=>{}};
    const ready=()=>this.refresh();
    const playing=()=>{if(entry.selected&&!entry.media.paused)this.state(entry,"playing");else if(!entry.selected)entry.media.pause();};
    const paused=()=>{if(entry.selected&&entry.media.paused&&!entry.pending){entry.blocked=true;this.state(entry,"blocked");}};
    const error=()=>{entry.blocked=true;this.state(entry,"error");};
    for(const event of ["loadeddata","canplay"])entry.media.addEventListener(event,ready);
    entry.media.addEventListener("playing",playing);entry.media.addEventListener("pause",paused);entry.media.addEventListener("error",error);
    entry.cleanup=()=>{
      for(const event of ["loadeddata","canplay"])entry.media.removeEventListener(event,ready);
      entry.media.removeEventListener("playing",playing);entry.media.removeEventListener("pause",paused);entry.media.removeEventListener("error",error);
    };
    this.entries.set(entry.id,entry);this.observer?.observe(entry.host);this.schedule();
    return {
      request:(requested: boolean)=>{entry.requested=requested;entry.blocked=false;this.refresh();},
      retry:()=>{
        entry.blocked=false;
        if(entry.state==="error")entry.media.load();
        this.refresh();
        if(entry.selected)this.play(entry);
      },
      dispose:()=>{
        entry.alive=false;entry.selected=false;entry.token++;entry.cleanup();this.observer?.unobserve(entry.host);
        entry.media.pause();entry.media.removeAttribute("src");entry.media.load();this.entries.delete(entry.id);this.schedule();
      },
    };
  }
  connect(root: HTMLElement) {
    this.root=root;
    this.observer=new IntersectionObserver(entries=>{
      for(const observation of entries){
        const entry=[...this.entries.values()].find(item=>item.host===observation.target);
        if(entry)entry.intersecting=observation.isIntersecting;
      }
      this.schedule();
    },{root,threshold:[0,.01,.15,.25,.5,.75,1]});
    for(const entry of this.entries.values())this.observer.observe(entry.host);
    const wake=()=>{for(const entry of this.entries.values())entry.blocked=false;this.refresh();};
    const gesture=()=>{for(const entry of this.entries.values())if(entry.selected&&entry.blocked){entry.blocked=false;this.play(entry);}};
    root.addEventListener("scroll",this.schedule,{passive:true});
    window.addEventListener("resize",this.schedule);window.addEventListener("focus",wake);
    document.addEventListener("visibilitychange",wake);document.addEventListener("pointerdown",gesture,true);
    this.refresh();
    return ()=>{
      this.observer?.disconnect();this.observer=undefined;this.root=undefined;
      cancelAnimationFrame(this.frame);this.frame=0;
      root.removeEventListener("scroll",this.schedule);window.removeEventListener("resize",this.schedule);window.removeEventListener("focus",wake);
      document.removeEventListener("visibilitychange",wake);document.removeEventListener("pointerdown",gesture,true);
      for(const entry of this.entries.values()){entry.selected=false;entry.token++;entry.media.pause();}
    };
  }
  private schedule=()=>{
    if(!this.root||this.frame)return;
    this.frame=requestAnimationFrame(()=>{this.frame=0;this.refresh();});
  };
  refresh(viewport?: PreviewViewport) {
    if(viewport)this.viewport=viewport;
    else if(this.root){const box=this.root.getBoundingClientRect();this.viewport={top:box.top,bottom:box.bottom,left:box.left,width:box.width,hidden:document.hidden};}
    const area=this.viewport;if(!area)return;
    const measurements=[...this.entries.values()].map(entry=>{
      const box=entry.host.getBoundingClientRect();
      const height=Math.max(0,Math.min(box.bottom,area.bottom)-Math.max(box.top,area.top));
      const width=Math.max(0,Math.min(box.right,area.left+area.width)-Math.max(box.left,area.left));
      return {entry,box,id:entry.id,automatic:entry.automatic,requested:entry.requested,paired:entry.paired,
        ratio:entry.intersecting===false?0:height*width/Math.max(1,box.height*box.width),center:(box.top+box.bottom)/2};
    });
    const selected=new Set(visiblePreviews(measurements,area));
    // Start the pair in sequence, so the second download cannot delay the first frame.
    if(area.width<=760&&selected.size>1){
      const [first,second]=[...selected];
      if(this.entries.get(first)!.media.readyState<3)selected.delete(second);
    }
    for(const {entry,ratio} of measurements){
      const next=selected.has(entry.id);
      if(next!==entry.selected){
        entry.selected=next;entry.blocked=false;entry.token++;entry.pending=false;
        if(!next){entry.media.autoplay=false;entry.media.pause();this.state(entry,"idle");}
      }
      if(!ratio&&entry.requested){entry.requested=false;entry.onHidden?.();}
    }
    // Warm only the next nearby automatic preview after the current one can play.
    const active=measurements.filter(item=>selected.has(item.id));
    const last=active.at(-1)?.id??-1;
    const warm=!area.hidden&&active.some(item=>item.entry.media.readyState>=3)
      ?measurements.find(item=>item.id>last&&item.automatic&&!selected.has(item.id)&&item.box.top<area.bottom+320&&item.box.bottom>area.top)?.id:undefined;
    for(const {entry,box} of measurements){
      if(entry.selected){this.source(entry,area.width<=760);this.play(entry);}
      else if(entry.id===warm){entry.media.autoplay=false;this.source(entry,area.width<=760,"metadata");}
      else if(entry.media.getAttribute("src")&&(area.hidden||box.bottom<area.top-(area.bottom-area.top)||box.top>area.bottom+(area.bottom-area.top))){
        entry.media.autoplay=false;entry.media.removeAttribute("src");entry.media.load();this.state(entry,"idle");
      }
    }
  }
  private state(entry: Entry,state: PreviewState){if(entry.alive&&state!==entry.state){entry.state=state;entry.onState(state);}}
  private source(entry: Entry,narrow: boolean,preload: "auto"|"metadata"="auto"){
    entry.media.muted=true;entry.media.defaultMuted=true;entry.media.playsInline=true;
    entry.media.setAttribute("muted","");entry.media.setAttribute("playsinline","");
    entry.media.preload=preload;entry.media.autoplay=entry.selected&&entry.automatic;
    if(!entry.media.getAttribute("src")){
      if(entry.poster)entry.media.poster=entry.poster;
      entry.media.src=narrow&&entry.mobileSource?entry.mobileSource:entry.source;
      this.state(entry,"loading");entry.media.load();
    }
  }
  private play(entry: Entry){
    if(!entry.selected||entry.pending||entry.blocked||!entry.media.paused)return;
    entry.pending=true;const token=++entry.token;
    void entry.media.play().then(()=>{
      if(!entry.alive)return;
      if(!entry.selected){entry.media.pause();return;}
      if(token===entry.token)this.state(entry,"playing");
    }).catch(error=>{
      if(!entry.alive||!entry.selected||token!==entry.token)return;
      entry.blocked=true;
      this.state(entry,error?.name==="NotAllowedError"||error?.name==="AbortError"?"blocked":"error");
    }).finally(()=>{if(token===entry.token)entry.pending=false;});
  }
}
