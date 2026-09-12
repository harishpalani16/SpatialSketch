import { z } from 'zod';

export const planeSchema = z.enum(['ground', 'front', 'side']);
export const kindSchema = z.enum(['mass', 'wall', 'slab', 'box', 'cylinder']);
export const pointSchema = z.object({ x: z.number().finite().min(-1000).max(1000), y: z.number().finite().min(-1000).max(1000) }).strict();
const idSchema = z.string().min(1).max(80);
export const strokeSchema = z.object({
  id: idSchema, plane: planeSchema, offset: z.number().finite().min(-200).max(200),
  points: z.array(pointSchema).min(2).max(1500),
}).strict();
export const objectSchema = z.object({
  id: idSchema, name: z.string().min(1).max(80), kind: kindSchema, plane: planeSchema,
  profile: z.array(pointSchema).min(2).max(256),
  offset: z.number().finite().min(-200).max(200), height: z.number().finite().min(0.05).max(200),
  thickness: z.number().finite().min(0.05).max(10), floors: z.number().int().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sourceStrokeId: idSchema.optional(),
}).strict();
export const projectSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(80),
  objects: z.array(objectSchema).max(100), strokes: z.array(strokeSchema).max(100),
}).strict();
export type Point = z.infer<typeof pointSchema>;
export type Plane = z.infer<typeof planeSchema>;
export type Kind = z.infer<typeof kindSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type ModelObject = z.infer<typeof objectSchema>;
export type Project = z.infer<typeof projectSchema>;
export const planeNames: Record<Plane, string> = { ground: 'Ground · XZ', front: 'Front · XY', side: 'Side · YZ' };
export const kindNames: Record<Kind, string> = { mass: 'Building mass', wall: 'Wall', slab: 'Slab', box: 'Box', cylinder: 'Cylinder' };
export const palette = ['#c3c9aa', '#ddd2b6', '#b9c9ca', '#d3bbae', '#c6bfd0', '#dadbd5'];
export function uid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works on local HTTP iPad previews, where randomUUID may be absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
export function emptyProject(): Project { return { version: 1, name: 'Untitled study', objects: [], strokes: [] }; }
export function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((a, p, i) => { const q = points[(i + 1) % points.length]; return a + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
export function bounds(points: Point[]) {
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}
function cross(a: Point, b: Point, c: Point) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a: Point, b: Point, p: Point) {
  return Math.abs(cross(a, b, p)) < 1e-8 && p.x >= Math.min(a.x, b.x) - 1e-8 && p.x <= Math.max(a.x, b.x) + 1e-8 && p.y >= Math.min(a.y, b.y) - 1e-8 && p.y <= Math.max(a.y, b.y) + 1e-8;
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function validateProfile(points: Point[], closed: boolean) {
  if (points.length < (closed ? 3 : 2)) throw new Error(closed ? 'Draw a closed outline with at least three corners.' : 'Draw a longer wall path.');
  for (let i = 1; i < points.length; i++) if (distance(points[i - 1], points[i]) < 0.001) throw new Error('The outline contains overlapping points. Please redraw that section.');
  const edges = closed ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++) for (let j = i + 2; j < edges; j++) {
    if (closed && i === 0 && j === edges - 1) continue;
    if (intersects(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) throw new Error('The outline crosses itself. Use a simple outline, or separate the shapes.');
  }
  if (closed && polygonArea(points) < 0.04) throw new Error('This outline is too small. Draw a larger shape.');
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (!length) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length));
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
export function simplify(points: Point[], tolerance = 0.08): Point[] {
  if (points.length <= 2) return points;
  let max = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) { const d = segmentDistance(points[i], points[0], points[points.length - 1]); if (d > max) { max = d; index = i; } }
  if (max <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}
export function profileFromStroke(stroke: Stroke, kind: Kind): Point[] {
  const raw = stroke.points.filter((p, i, a) => !i || distance(p, a[i - 1]) > 0.005);
  if (raw.length < 2) throw new Error('Draw a shape first.');
  const b = bounds(raw);
  if (kind === 'box') {
    const profile = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }];
    validateProfile(profile, true); return profile;
  }
  if (kind === 'cylinder') {
    const rx = (b.maxX - b.minX) / 2, ry = (b.maxY - b.minY) / 2;
    if (Math.min(rx, ry) < 0.1) throw new Error('Draw an outline with some width and depth for the cylinder.');
    return Array.from({ length: 48 }, (_, i) => ({ x: (b.minX + b.maxX) / 2 + rx * Math.cos(i / 48 * Math.PI * 2), y: (b.minY + b.maxY) / 2 + ry * Math.sin(i / 48 * Math.PI * 2) }));
  }
  if (kind !== 'wall' && distance(raw[0], raw[raw.length - 1]) > Math.max(0.6, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 0.12)) throw new Error('Close the outline by ending near its starting point, or choose Wall for an open path.');
  let points = simplify(raw);
  if (kind !== 'wall' && distance(points[0], points[points.length - 1]) < Math.max(0.6, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 0.12)) points = points.slice(0, -1);
  if (points.length > 256) throw new Error('This outline has too many corners. Try a simpler stroke.');
  validateProfile(points, kind !== 'wall'); return points;
}
export function createObject(stroke: Stroke, kind: Kind, params: Partial<Pick<ModelObject, 'name' | 'height' | 'thickness' | 'floors' | 'color'>> = {}): ModelObject {
  return objectSchema.parse({ id: uid(), name: kindNames[kind], kind, plane: stroke.plane, profile: profileFromStroke(stroke, kind), offset: stroke.offset, height: kind === 'slab' ? 0.25 : 3.6, thickness: 0.25, floors: 1, color: palette[0], sourceStrokeId: stroke.id, ...params });
}
export function parseProject(value: unknown): Project {
  const p = projectSchema.parse(value);
  if (new Set(p.objects.map(o => o.id)).size !== p.objects.length || new Set(p.strokes.map(s => s.id)).size !== p.strokes.length) throw new Error('Project IDs must be unique.');
  p.objects.forEach(o => validateProfile(o.profile, o.kind !== 'wall'));
  return p;
}
export function sampleProject(): Project {
  const profile = [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 5 }, { x: -6, y: 5 }];
  return { version: 1, name: 'Courtyard study', strokes: [], objects: [
    { id: 'sample-ground', name: 'Site plinth', kind: 'slab', plane: 'ground', profile: [{ x: -8, y: -6 }, { x: 8, y: -6 }, { x: 8, y: 7 }, { x: -8, y: 7 }], offset: 0, height: 0.2, thickness: 0.25, floors: 1, color: '#ddd8c9' },
    { id: 'sample-mass', name: 'Courtyard volume', kind: 'mass', plane: 'ground', profile, offset: 0.2, height: 7.2, thickness: 0.25, floors: 2, color: palette[0] },
  ] };
}
