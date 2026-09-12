'use client';

import { RotateCw } from 'lucide-react';
import { bounds, type ModelObject } from '@/lib/model';
import NumberField from './number-field';
export default function ProfileControls({ object, onChange }: { object: ModelObject; onChange: (changes: Partial<ModelObject>) => void }) {
  const b = bounds(object.profile);
  const width = b.maxX - b.minX, length = b.maxY - b.minY;
  const cx = (b.maxX + b.minX) / 2, cy = (b.maxY + b.minY) / 2;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return <details className="profile-controls"><summary>Profile size & position</summary><div className="number-grid">
    {width > 0.01 && <NumberField label="Width" value={round(width)} min={0.1} max={1000} onChange={v => onChange({ profile: object.profile.map(p => ({ x: cx + (p.x - cx) * v / width, y: p.y })) })} />}
    {length > 0.01 && <NumberField label={object.plane === 'ground' ? 'Length' : 'Profile height'} value={round(length)} min={0.1} max={1000} onChange={v => onChange({ profile: object.profile.map(p => ({ x: p.x, y: cy + (p.y - cy) * v / length })) })} />}
    <NumberField label="Center U" value={round(cx)} min={-500} max={500} onChange={v => onChange({ profile: object.profile.map(p => ({ x: p.x + v - cx, y: p.y })) })} />
    <NumberField label="Center V" value={round(cy)} min={-500} max={500} onChange={v => onChange({ profile: object.profile.map(p => ({ x: p.x, y: p.y + v - cy })) })} />
  </div><p className="form-hint">U and V follow the horizontal and vertical axes of the sketch plane.</p><button className="text-button" onClick={() => onChange({ profile: object.profile.map(p => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) })) })}><RotateCw size={13} />Rotate profile 90°</button></details>;
}
