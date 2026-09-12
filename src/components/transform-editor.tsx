'use client';
import { useState } from 'react';
import { Move3D, Rotate3D, Scaling } from 'lucide-react';
import type { Transform } from '@/lib/model';
import type { GizmoMode } from './model-view';
import NumberField from './number-field';
export const identityTransform=():Transform=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
export default function TransformEditor({onApply,onGizmo,initial,disabled=false}:{onApply:(t:Transform)=>void;onGizmo:(mode:GizmoMode)=>void;initial?:Transform;disabled?:boolean}) {
  const [draft,setDraft]=useState<Transform>(()=>initial||identityTransform());
  function set(part:keyof Transform,i:number,value:number){setDraft(t=>({...t,[part]:t[part].map((v,n)=>n===i?value:v)}));}
  return <div className="transform-editor"><div className="gizmo-buttons">{([{mode:'translate',name:'Move',icon:Move3D},{mode:'rotate',name:'Rotate',icon:Rotate3D},{mode:'scale',name:'Scale',icon:Scaling}] as const).map(t=><button key={t.mode} disabled={disabled} onClick={()=>onGizmo(t.mode)}><t.icon size={15}/>{t.name}</button>)}</div>
    <details><summary>Precise transform</summary><div className="transform-numbers">{(['position','rotation','scale'] as const).map(part=><div className="transform-row" key={part}>{['X','Y','Z'].map((axis,i)=><NumberField key={axis} label={(part==='position'?(initial?'Position':'Move'):part==='rotation'?'Rotate':'Scale')+' '+axis} value={draft[part][i]} min={part==='scale'?.001:-2000} max={part==='scale'?1000:2000} step={part==='rotation'?5:part==='scale'?.1:.1} unit={part==='rotation'?'°':part==='scale'?'×':'m'} onChange={v=>set(part,i,v)}/>)}</div>)}</div><button className="secondary-button" disabled={disabled} onClick={()=>{onApply(draft);if(!initial)setDraft(identityTransform());}}>Apply transform</button><p className="form-hint">{initial?'Position, rotation and scale in world space.':'Move in world axes; rotate and scale around the selection center.'}</p></details>
  </div>;
}
