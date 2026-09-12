'use client';

import { RotateCw } from 'lucide-react';
import { bounds, type ModelObject } from '@/lib/model';
import NumberField from './number-field';
export default function ProfileControls({ object, onChange }: { object: ModelObject; onChange: (changes: Partial<ModelObject>) => void }) {
  const b = bounds(object.profile);
  const width = b.maxX - b.minX, length = b.maxY - b.minY;
  const cx = (b.maxX + b.minX) / 2, cy = (b.maxY + b.minY) / 2;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const angle = Math.atan2(object.profile[1].y-object.profile[0].y,object.profile[1].x-object.profile[0].x)*180/Math.PI;
  function rotate(degrees: number) { const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a); onChange({profile:object.profile.map(p=>({x:cx+(p.x-cx)*c-(p.y-cy)*s,y:cy+(p.x-cx)*s+(p.y-cy)*c}))}); }
  return <details className="profile-controls"><summary>Profile size & position</summary><div className="number-grid">
    {width >= 0.001 && <NumberField label="Width" value={round(width)} min={0.001} max={1000} onChange={v => onChange({ profile: object.profile.map(p => ({ x: cx + (p.x - cx) * v / width, y: p.y })) })} />}
    {length >= 0.001 && <NumberField label="Length" value={round(length)} min={0.001} max={1000} onChange={v => onChange({ profile: object.profile.map(p => ({ x: p.x, y: cy + (p.y - cy) * v / length })) })} />}
    <NumberField label="Center U" value={round(cx)} min={-500} max={500} onChange={v => onChange({ profile: object.profile.map(p => ({ x: p.x + v - cx, y: p.y })) })} />
    <NumberField label="Center V" value={round(cy)} min={-500} max={500} onChange={v => onChange({ profile: object.profile.map(p => ({ x: p.x, y: p.y + v - cy })) })} />
    <NumberField label="Profile angle" value={round(angle)} min={-180} max={180} step={5} unit="°" onChange={v => rotate(v-angle)} />
  </div><p className="form-hint">U and V follow the horizontal and vertical axes of the sketch plane.</p><button className="text-button" onClick={() => onChange({ profile: object.profile.map(p => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) })) })}><RotateCw size={13} />Rotate profile 90°</button></details>;
}
