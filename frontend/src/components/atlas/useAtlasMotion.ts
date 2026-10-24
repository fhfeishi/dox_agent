import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { atlasLayout } from "../../domainAtlas";

type Layout = ReturnType<typeof atlasLayout>;
/** Transitions are display geometry only. Statistics always belong to the final selected window. */
export function useAtlasMotion(target: Layout, selectionKey: string, layerKey: string) {
  const [layout,setLayout]=useState(target),[moving,setMoving]=useState(false);
  const shown=useRef(target),previous=useRef({selectionKey,layerKey});
  const [reduced,setReduced]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(()=>{const media=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReduced(media.matches);media.addEventListener("change",change);return()=>media.removeEventListener("change",change);},[]);
  useLayoutEffect(()=>{
    const old=previous.current;previous.current={selectionKey,layerKey};
    const start=shown.current;
    if(reduced||old.layerKey!==layerKey||old.selectionKey===selectionKey||!start.points.length||!target.points.length){shown.current=target;setLayout(target);setMoving(false);return;}
    const points=new Map(start.points.map(p=>[p.d.node.id,p]));
    const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
    let frame=0,begin:number|null=null;setMoving(true);
    const draw=(now:number)=>{
      begin??=now;const elapsed=Math.min(1,(now-begin)/420),t=1-(1-elapsed)**3;
      const current:Layout={...target,medianX:mix(start.medianX,target.medianX,t),medianY:mix(start.medianY,target.medianY,t),
        points:target.points.map(p=>{const a=points.get(p.d.node.id);return{...p,cx:mix(a?.cx??p.cx,p.cx,t),cy:mix(a?.cy??p.cy,p.cy,t),r:mix(a?.r??0,p.r,t)};}),
        seats:new Map([...target.seats].map(([id,b])=>{const a=start.seats.get(id)??b;return[id,{x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)}];}))};
      shown.current=current;setLayout(current);
      if(elapsed<1)frame=requestAnimationFrame(draw);else{shown.current=target;setLayout(target);setMoving(false);}
    };
    frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[target,selectionKey,layerKey,reduced]);
  return{layout,moving};
}
