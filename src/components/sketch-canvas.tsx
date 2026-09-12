'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { distance, uid, type ModelObject, type Plane, type Point, type Stroke } from '@/lib/model';

export type SketchTool = 'pen' | 'rectangle' | 'line';
type Props = { plane: Plane; offset: number; tool: SketchTool; snap: boolean; touchDraw: boolean; strokes: Stroke[]; objects: ModelObject[]; activeStroke: string | null; onStroke: (s: Stroke) => void; onMessage: (message: string) => void };
const initialView = { x: -14, y: -14, width: 28, height: 28 };
const path = (points: Point[], closed = false) => points.map((p, i) => (i ? 'L' : 'M') + p.x + ',' + p.y).join(' ') + (closed ? ' Z' : '');

export default function SketchCanvas({ plane, offset, tool, snap, touchDraw, strokes, objects, activeStroke, onStroke, onMessage }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ id: number; points: Point[]; tool: SketchTool } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const [draft, setDraft] = useState<Point[]>([]);
  const [view, setView] = useState(initialView);
  const viewRef = useRef(view); viewRef.current = view;
  const viewString = [view.x, view.y, view.width, view.height].join(' ');
  function toPoint(clientX: number, clientY: number): Point {
    const point = svg.current!.createSVGPoint(); point.x = clientX; point.y = clientY;
    const local = point.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: snap ? Math.round(local.x * 4) / 4 : local.x, y: snap ? Math.round(-local.y * 4) / 4 : -local.y };
  }
  function zoom(factor: number) {
    setView(v => { const width = Math.max(4, Math.min(200, v.width * factor)); return { x: v.x + (v.width - width) / 2, y: v.y + (v.height - width) / 2, width, height: width }; });
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch' && gesture.current) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch' && !touchDraw) { touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); return; }
    if (gesture.current) return;
    touches.current.clear();
    const p = toPoint(event.clientX, event.clientY);
    gesture.current = { id: event.pointerId, points: [p], tool }; setDraft([p]);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (touches.current.has(event.pointerId)) {
      const old = touches.current.get(event.pointerId)!;
      const other = [...touches.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      const rect = svg.current!.getBoundingClientRect();
      if (other) {
        const before = Math.hypot(old.x - other.x, old.y - other.y);
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        if (before > 10 && after > 10) zoom(before / after);
      } else {
        const scale = viewRef.current.width / Math.min(rect.width, rect.height);
        setView(v => ({ ...v, x: Math.max(-1000, Math.min(1000, v.x - (event.clientX - old.x) * scale)), y: Math.max(-1000, Math.min(1000, v.y - (event.clientY - old.y) * scale)) }));
      }
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); return;
    }
    const g = gesture.current; if (!g || g.id !== event.pointerId) return;
    const events = event.nativeEvent.getCoalescedEvents?.() || [event.nativeEvent];
    for (const e of events.length ? events : [event.nativeEvent]) {
      const p = toPoint(e.clientX, e.clientY);
      if (g.tool === 'rectangle') {
        const a = g.points[0]; g.points = [a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }, a];
      } else if (g.tool === 'line') g.points = [g.points[0], p];
      else if (distance(g.points[g.points.length - 1], p) > 0.035 && g.points.length < 1500) g.points.push(p);
    }
    setDraft([...g.points]);
  }
  function finish(event: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    touches.current.delete(event.pointerId);
    const g = gesture.current; if (!g || g.id !== event.pointerId) return;
    gesture.current = null; setDraft([]);
    if (cancel) { onMessage('Stroke interrupted. Draw it again when ready.'); return; }
    if (g.points.length < 2 || g.points.every(p => distance(p, g.points[0]) < 0.08)) return;
    if (g.points.length === 1500) onMessage('Stroke limit reached. Split longer sketches into separate strokes.');
    onStroke({ id: uid(), points: g.points, plane, offset });
  }
  return <div className="sketch-surface">
    <svg ref={svg} className="sketch-svg" viewBox={viewString} data-testid="sketch-canvas" role="img" aria-label="Sketch canvas. Draw with Pencil or mouse. Touch pans; two fingers zoom."
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onLostPointerCapture={e => { if (gesture.current?.id === e.pointerId) finish(e, true); }}>
      <defs><pattern id="sketch-dots" width="1" height="1" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.022" fill="#b8bcb0" /></pattern></defs>
      <rect x={view.x - 200} y={view.y - 200} width={view.width + 400} height={view.height + 400} fill="url(#sketch-dots)" />
      <path d={'M ' + (view.x - 200) + ',0 H ' + (view.x + 400) + ' M 0,' + (view.y - 200) + ' V ' + (view.y + 400)} stroke="#dcded3" strokeWidth="0.025" />
      <g transform="scale(1 -1)" pointerEvents="none">
        {objects.filter(o => o.plane === plane).map(o => <path key={o.id} d={path(o.profile, o.kind !== 'wall')} fill={o.kind === 'wall' ? 'none' : o.color} fillOpacity="0.2" stroke="#a9ae9c" strokeWidth="0.05" strokeDasharray="0.15 0.14" />)}
        {strokes.filter(s => s.plane === plane).map(s => <path key={s.id} d={path(s.points)} fill="none" stroke={s.id === activeStroke ? '#9b6434' : '#9ba18d'} strokeWidth={s.id === activeStroke ? 0.10 : 0.06} strokeLinecap="round" strokeLinejoin="round" />)}
        {draft.length > 0 && <><path d={path(draft)} fill={tool === 'rectangle' ? '#d8dbbb' : 'none'} fillOpacity="0.3" stroke="#48573d" strokeWidth="0.09" strokeLinecap="round" strokeLinejoin="round" /><circle cx={draft[0].x} cy={draft[0].y} r="0.17" fill="#fffdf3" stroke="#48573d" strokeWidth="0.06" /></>}
      </g>
    </svg>
    {!strokes.length && !objects.length && !draft.length && <div className="sketch-empty"><span className="sketch-loop">⌁</span><h3>Every form starts<br />with a little sketch.</h3><p>Draw a closed outline.<br />We’ll give it a new dimension.</p></div>}
    <div className="canvas-corner"><span className="scale-line" /> 1 grid step = 1 m</div>
    <div className="canvas-zoom"><button title="Zoom out sketch" aria-label="Zoom out sketch" onClick={() => zoom(1.25)}><Minus size={15} /></button><button title="Reset sketch view" aria-label="Reset sketch view" onClick={() => setView(initialView)}><Maximize2 size={14} /></button><button title="Zoom in sketch" aria-label="Zoom in sketch" onClick={() => zoom(0.8)}><Plus size={15} /></button></div>
  </div>;
}
