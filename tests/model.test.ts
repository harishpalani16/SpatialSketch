import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createObject, parseProject, polygonArea, sampleProject, uid, type Stroke } from '../src/lib/model';
import { buildObject, disposeGroup } from '../src/lib/geometry';
import { applyIntent, parseIntentText } from '../src/lib/intent';

const square: Stroke = { id: 'stroke-one', plane: 'ground', offset: 0, points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 0 }] };
describe('sketch to editable geometry', () => {
  it('creates IDs on local HTTP tablet previews without randomUUID', () => {
    const source = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: source.getRandomValues.bind(source) });
    try { expect(uid()).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/); }
    finally { vi.unstubAllGlobals(); }
  });
  it('creates a closed profile with a known footprint and editable height', () => {
    const object = createObject(square, 'mass', { height: 9, floors: 3 });
    expect(object.profile).toHaveLength(4); expect(polygonArea(object.profile)).toBe(48);
    const mesh = buildObject(object); mesh.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(8); expect(size.y).toBeCloseTo(9); expect(size.z).toBeCloseTo(6); disposeGroup(mesh);
  });
  it('preserves the front plane and its offset when extruding', () => {
    const object = createObject({ ...square, plane: 'front', offset: 4 }, 'mass', { height: 2 });
    const mesh = buildObject(object); mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.toArray()).toEqual([0, 0, 4]); expect(box.max.toArray()).toEqual([8, 6, 6]); disposeGroup(mesh);
  });
  it('rejects crossing outlines and accepts open wall paths', () => {
    expect(() => createObject({ ...square, points: [{ x: 0, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }, { x: 8, y: 0 }, { x: 0, y: 0 }] }, 'mass')).toThrow(/crosses/);
    const line = { ...square, points: [{ x: 0, y: 0 }, { x: 8, y: 0 }] };
    expect(createObject(line, 'wall').profile).toHaveLength(2);
    expect(() => createObject(line, 'mass')).toThrow(/Close/);
  });
  it('does not silently accept corrupt projects, duplicate IDs, or secrets', () => {
    const project = sampleProject();
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(() => parseProject({ ...project, apiKey: 'test-only-secret' })).toThrow();
    expect(() => parseProject({ ...project, objects: [project.objects[0], project.objects[0]] })).toThrow(/unique/);
    expect(() => parseProject({ ...project, objects: [{ ...project.objects[0], height: -5 }] })).toThrow();
  });
  it('applies an AI edit to the target only and leaves the source unchanged', () => {
    const project = sampleProject();
    const result = applyIntent(project, { summary: 'Three floors at 3.6m each.', actions: [{ type: 'update', objectId: 'sample-mass', changes: { height: 10.8, floors: 3 } }] });
    expect(result.objects[1].height).toBe(10.8); expect(result.objects[1].floors).toBe(3);
    expect(result.objects[0]).toEqual(project.objects[0]); expect(project.objects[1].height).toBe(7.2);
    expect(() => applyIntent(project, { summary: 'Invalid target', actions: [{ type: 'update', objectId: 'unknown', changes: { height: 3 } }] })).toThrow(/no longer available/);
  });
  it('allows only structured supported actions, without evaluating generated code', () => {
    expect(parseIntentText('```json\n{"summary":"Choose a stroke.","actions":[]}\n```').actions).toEqual([]);
    expect(() => parseIntentText('{"summary":"run code","actions":[{"type":"execute","code":"alert(1)"}]}')).toThrow(/valid modeling proposal/);
  });
});
