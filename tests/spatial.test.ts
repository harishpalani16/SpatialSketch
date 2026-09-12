import { expect, it } from 'vitest';
import * as THREE from 'three';
import { applyIntent } from '../src/lib/intent';
import { createObject, emptyProject, parseProject, polygonArea, type Stroke } from '../src/lib/model';
import { adjustFrame, baseFrame, frameFromNormal, frameMatrix, frameNormal, projectRay } from '../src/lib/spatial';
import { buildObject, disposeGroup } from '../src/lib/geometry';
import { refinePoints } from '../src/lib/refine';

const outline = [{x:0,y:0},{x:8,y:0},{x:8,y:8},{x:5,y:8},{x:5,y:3},{x:3,y:3},{x:3,y:8},{x:0,y:8},{x:0,y:0}];
const stroke: Stroke = { id:'u-sketch',plane:'custom',frame:adjustFrame(baseFrame(),35,20,4),offset:0,points:outline };
it('projects screen rays onto an arbitrary 3D frame and rejects edge-on or rear intersections', () => {
  const f = stroke.frame!, normal = frameNormal(f), world = new THREE.Vector3(3,7,0).applyMatrix4(frameMatrix(f));
  const p = projectRay(new THREE.Ray(world.clone().addScaledVector(normal,10),normal.clone().negate()),f)!;
  expect(p.x).toBeCloseTo(3); expect(p.y).toBeCloseTo(7);
  expect(projectRay(new THREE.Ray(world.clone().addScaledVector(normal,10),new THREE.Vector3(...f.u)),f)).toBeNull();
  expect(projectRay(new THREE.Ray(world.clone().addScaledVector(normal,10),normal),f)).toBeNull();
});
it('produces orthonormal face frames even when the preferred axis is parallel to the face normal', () => {
  const f = frameFromNormal(new THREE.Vector3(4,5,6),new THREE.Vector3(1,0,0));
  expect(frameNormal(f).x).toBeCloseTo(1);
  expect(parseProject({...emptyProject(),strokes:[{...stroke,frame:f}]}).strokes[0].frame).toEqual(f);
});
it('extrudes perpendicular to the frozen frame and retains it through export/import', () => {
  const object = createObject(stroke,'mass',{height:6});
  const mesh = buildObject(object,false,false); mesh.updateMatrixWorld(true);
  const worldTop = new THREE.Vector3(0,0,6).applyMatrix4(mesh.matrixWorld);
  expect(worldTop.distanceTo(new THREE.Vector3(...stroke.frame!.origin).addScaledVector(frameNormal(stroke.frame!),6))).toBeLessThan(0.00001);
  expect(parseProject(JSON.parse(JSON.stringify({...emptyProject(),objects:[object],strokes:[stroke]})))).toEqual({...emptyProject(),objects:[object],strokes:[stroke]});
  disposeGroup(mesh);
});
it('migrates version 1 projects and rejects missing or malformed spatial frames', () => {
  expect(parseProject({...emptyProject(),version:1}).version).toBe(3);
  expect(() => parseProject({...emptyProject(),strokes:[{...stroke,frame:undefined}]})).toThrow(/frame/);
  expect(() => parseProject({...emptyProject(),strokes:[{...stroke,frame:{...baseFrame(),u:[1,0,1]}}]})).toThrow();
});
it('squares a noisy rotated U while preserving all eight corners and the courtyard notch', () => {
  const angle = 0.31, raw = outline.flatMap((p,i) => {
    if (!i) return [p]; const prev=outline[i-1];
    return [{x:(p.x+prev.x)/2+0.025,y:(p.y+prev.y)/2-0.015},p];
  }).map(p => ({x:p.x*Math.cos(angle)-p.y*Math.sin(angle),y:p.x*Math.sin(angle)+p.y*Math.cos(angle)}));
  const clean = refinePoints(raw,'orthogonal');
  expect(clean).toHaveLength(8); expect(polygonArea(clean)).toBeCloseTo(54,0);
  for(let i=0;i<clean.length;i++) { const a=clean[i],b=clean[(i+1)%8],c=clean[(i+2)%8]; expect((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)).toBeCloseTo(0,5); }
});
it('refines then builds the same concave stroke atomically without touching the original', () => {
  const original={...emptyProject(),strokes:[stroke]};
  const result=applyIntent(original,{summary:'Clean and build',actions:[{type:'refine',target:'stroke',id:stroke.id,mode:'orthogonal'},{type:'create',strokeId:stroke.id,kind:'mass',name:'Courtyard',height:4,thickness:.2,floors:1}]});
  expect(result.objects[0].profile).toHaveLength(8); expect(polygonArea(result.objects[0].profile)).toBeCloseTo(54); expect(original.objects).toHaveLength(0);
});
it('builds a table without ink, rotates the complete assembly, and arrays it on its local frame', () => {
  const p=applyIntent(emptyProject(),{summary:'Table',actions:[{type:'primitive',kind:'table',name:'Table',width:2,length:1,height:.75}]},stroke.frame);
  const id=p.objects[0].id;
  const result=applyIntent(p,{summary:'Rotate and repeat',actions:[{type:'update',objectId:id,changes:{rotate:90}},{type:'duplicate',objectId:id,count:2,axis:'normal',spacing:2}]});
  expect(result.objects).toHaveLength(3); expect(result.objects[2].offset).toBe(4); expect(result.objects[0].sourceStrokeId).toBeUndefined();
  const object={...result.objects[0],plane:'ground' as const,frame:undefined}, group=buildObject(object,false,false);
  expect(group.children).toHaveLength(5); group.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(1); expect(size.y).toBeCloseTo(.75); expect(size.z).toBeCloseTo(2); disposeGroup(group);
});
it('creates valid editable roofs, chairs, pavilions and ellipsoids and rejects malformed recipe imports', () => {
  for(const kind of ['gable','chair','pavilion','sphere'] as const) {
    const p=applyIntent(emptyProject(),{summary:kind,actions:[{type:'primitive',kind,name:kind,width:3,length:2,height:1}]});
    const g=buildObject(p.objects[0]); g.updateMatrixWorld(true); const size=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3); expect(size.y).toBeCloseTo(1); expect(size.z).toBeCloseTo(2); disposeGroup(g);
    expect(() => parseProject({...p,objects:[{...p.objects[0],profile:outline.slice(0,-1)}]})).toThrow();
  }
});
it('does not apply partial geometry if a later action fails', () => {
  const p=emptyProject();
  expect(() => applyIntent(p,{summary:'Invalid',actions:[{type:'primitive',kind:'box',name:'Box',width:2,length:2,height:2},{type:'update',objectId:'missing',changes:{height:5}}]})).toThrow();
  expect(p.objects).toEqual([]);
});
it('orients a newly generated chair so its back faces away from the table', () => {
  const p=applyIntent(emptyProject(),{summary:'Chair facing inward',actions:[{type:'primitive',kind:'chair',name:'Chair',width:.5,length:.5,height:.9,centerV:-1,rotation:180}]});
  const g=buildObject(p.objects[0],false,false);g.updateMatrixWorld(true);
  const back=new THREE.Box3().setFromObject(g.children.at(-1)!).getCenter(new THREE.Vector3());
  expect(back.z).toBeGreaterThan(1);expect(g.children).toHaveLength(6);disposeGroup(g);
});
it('retains the requested footprint when a rotated furniture assembly is resized', () => {
  const p=applyIntent(emptyProject(),{summary:'Rotated table',actions:[{type:'primitive',kind:'table',name:'Table',width:2,length:1,height:.75,rotation:30}]});
  const resized=applyIntent(p,{summary:'Resize',actions:[{type:'update',objectId:p.objects[0].id,changes:{width:5,length:1}}]});
  const g=buildObject(resized.objects[0],false,false);g.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(5);expect(size.z).toBeCloseTo(1);expect(size.y).toBeCloseTo(.75);disposeGroup(g);
});
