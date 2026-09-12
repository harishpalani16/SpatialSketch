'use client';

import { Crosshair, Eye, Hand, Layers, PenLine, Scan, Settings2 } from 'lucide-react';
import type { SketchFrame } from '@/lib/model';
import type { SpatialMode } from './model-view';
import NumberField from './number-field';

export type PlaneAdjustment = { tilt: number; turn: number; shift: number };
type Props = { mode: SpatialMode; onMode: (mode: SpatialMode) => void; frame: SketchFrame; adjustment: PlaneAdjustment; onAdjust: (a: PlaneAdjustment) => void; onViewPlane: () => void; onGround: () => void; onAlign: () => void; showPlane: boolean; onShowPlane: (v: boolean) => void };
export default function SpatialToolbar(p: Props) {
  return <div className="spatial-tools">
    <div className="spatial-tool-row">
      <div className="spatial-modes"><button className={p.mode === 'draw' ? 'active' : ''} onClick={() => p.onMode('draw')} aria-pressed={p.mode === 'draw'}><PenLine size={15} />Draw in 3D</button><button className={p.mode === 'navigate' ? 'active' : ''} onClick={() => p.onMode('navigate')} aria-pressed={p.mode === 'navigate'}><Hand size={15} />Orbit / select</button></div>
      <span className="toolbar-divider" />
      <button className={p.mode === 'pick-face' ? 'active' : ''} onClick={() => p.onMode('pick-face')} aria-pressed={p.mode === 'pick-face'}><Scan size={15} />Pick face</button>
      <button onClick={p.onViewPlane} title="Freeze a drawing plane facing the current camera, through the orbit center"><Eye size={15} />View plane</button>
      <button onClick={p.onGround}><Layers size={15} />Ground</button>
    </div>
    <div className="spatial-plane-row"><span className="plane-badge"><span className="status-dot" />{p.mode === 'pick-face' ? 'Tap a face to place your sketch plane' : p.frame.label || 'Spatial plane'}</span><span className="spatial-hint">{p.mode === 'draw' ? 'Pencil draws · fingers orbit' : p.mode === 'navigate' ? 'Drag to orbit · tap a form to select' : 'Plane extends beyond the picked face'}</span>
      <details className="plane-settings"><summary><Settings2 size={13} />Plane settings</summary><div className="plane-popover"><p>Position the next sketch in space.</p><div className="number-grid"><NumberField label="Plane tilt" value={p.adjustment.tilt} min={-180} max={180} unit="°" step={5} onChange={tilt => p.onAdjust({ ...p.adjustment, tilt })} /><NumberField label="Plane turn" value={p.adjustment.turn} min={-180} max={180} unit="°" step={5} onChange={turn => p.onAdjust({ ...p.adjustment, turn })} /><NumberField label="Plane depth" value={p.adjustment.shift} min={-200} max={200} onChange={shift => p.onAdjust({ ...p.adjustment, shift })} /></div><label className="plane-visibility"><input type="checkbox" checked={p.showPlane} onChange={e => p.onShowPlane(e.target.checked)} />Show drawing grid</label><button onClick={p.onAlign}><Crosshair size={14} />Align view to plane</button><small>1 grid step = 1 m. Existing ink stays fixed.</small></div></details>
    </div>
  </div>;
}
