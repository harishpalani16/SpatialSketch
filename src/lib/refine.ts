import { bounds, distance, simplify, validateProfile, type Point } from './model';

export type Refinement = 'straighten' | 'orthogonal';
export function refinePoints(raw: Point[], mode: Refinement, closed = true): Point[] {
  const b = bounds(raw), diagonal = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  if (raw.length < 2 || diagonal < 0.1) throw new Error('Draw a larger sketch to refine.');
  let points = raw.filter((p, i) => !i || distance(p, raw[i - 1]) > 0.001);
  if (closed && distance(points[0], points.at(-1)!) > Math.max(0.6, diagonal * 0.15)) throw new Error('Close the outline before making its corners square.');
  points = simplify(points, Math.max(0.035, diagonal * 0.016));
  if (closed && distance(points[0], points.at(-1)!) < Math.max(0.6, diagonal * 0.15)) points.pop();
  if (mode === 'straighten') { validateProfile(points, closed); return points; }
  if (closed && points.length < 4) throw new Error('Square corners need at least four distinct corners. Try Straighten for this outline.');
  // Estimate the sketch's own axis orientation so a rotated plan stays rotated.
  let cos = 0, sin = 0;
  points.forEach((p, i) => { if (!closed && i === points.length-1) return; const q = points[(i + 1) % points.length], angle = Math.atan2(q.y - p.y, q.x - p.x), weight = distance(p, q); cos += Math.cos(4 * angle) * weight; sin += Math.sin(4 * angle) * weight; });
  const angle = Math.atan2(sin, cos) / 4, c = Math.cos(angle), s = Math.sin(angle);
  points = points.map(p => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  const horizontal = (a: Point, b: Point) => Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (!closed) {
    const result = [{ ...points[0] }];
    for (let i = 1; i < points.length; i++) result.push(horizontal(points[i-1],points[i]) ? { x:points[i].x,y:result[i-1].y } : { x:result[i-1].x,y:points[i].y });
    const restored = result.map(p => ({ x:p.x*c-p.y*s,y:p.x*s+p.y*c })); validateProfile(restored,false); return restored;
  }
  let removed = true;
  while (removed && points.length > 4) {
    removed = false;
    for (let i = 0; i < points.length; i++) {
      if (horizontal(points[(i + points.length - 1) % points.length], points[i]) === horizontal(points[i], points[(i + 1) % points.length])) { points.splice(i, 1); removed = true; break; }
    }
  }
  const edges = points.map((p, i) => { const q = points[(i + 1) % points.length]; return { horizontal: horizontal(p, q), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; });
  const result = edges.map((line, i) => {
    const prev = edges[(i + edges.length - 1) % edges.length];
    if (prev.horizontal === line.horizontal) throw new Error('These corners cannot be squared reliably. Try Straighten instead.');
    const x = line.horizontal ? prev.x : line.x, y = line.horizontal ? line.y : prev.y;
    return { x: x * c - y * s, y: x * s + y * c };
  });
  validateProfile(result, true); return result;
}
