import {expect,it} from 'vitest';
import * as THREE from 'three';
import {emptyProject,parseProject,type Stroke} from '../src/lib/model';
import {nextSketch,deleteSketch,transformSelection,strokeBounds,centeredTransform} from '../src/lib/session';
import {adjustFrame,baseFrame,planeMatrix} from '../src/lib/spatial';
import {createFileResolver} from '../src/lib/import-geometry';
import {packageSession,openSession} from '../src/lib/session-file';
import {applyIntent} from '../src/lib/intent';
const stroke:Stroke={id:'ink',plane:'custom',frame:adjustFrame(baseFrame(),25,35,2),offset:0,points:[{x:0,y:0},{x:2,y:1},{x:3,y:0}]};
it('keeps finished sketches in the same session and moves to a new named sketch',()=>{
  const p={...emptyProject(),strokes:[stroke]};const next=nextSketch(p,p.groups[0].id);
  expect(next.project.strokes).toEqual(p.strokes);expect(next.project.groups[0].status).toBe('ready');expect(next.group.name).toBe('Sketch 2');
  const two={...next.project,strokes:[stroke,{...stroke,id:'other',groupId:next.group.id}]};
  expect(deleteSketch(two,two.groups[0].id).strokes.map(s=>s.id)).toEqual(['other']);expect(deleteSketch(p,p.groups[0].id).groups).toHaveLength(1);
});
it('transforms all selected ink in world space, preserving unselected ink and orthonormal frames',()=>{
  const p={...emptyProject(),strokes:[stroke,{...stroke,id:'fixed'}]},center=strokeBounds([stroke]).getCenter(new THREE.Vector3());
  const delta=centeredTransform({position:[3,4,5],rotation:[25,40,15],scale:[2,1,.5]},center),result=transformSelection(p,['ink'],delta),changed=result.strokes[0];
  for(let i=0;i<stroke.points.length;i++){
    const a=new THREE.Vector3(stroke.points[i].x,stroke.points[i].y,0).applyMatrix4(planeMatrix(stroke.plane,stroke.offset,stroke.frame)).applyMatrix4(delta);
    const b=new THREE.Vector3(changed.points[i].x,changed.points[i].y,0).applyMatrix4(planeMatrix(changed.plane,changed.offset,changed.frame));expect(a.distanceTo(b)).toBeLessThan(.000001);
  }
  expect(result.strokes[1]).toEqual(p.strokes[1]);expect(parseProject(result)).toEqual(result);
});
it('prevents editing locked sketch groups',()=>{
  const p={...emptyProject(),strokes:[stroke]};p.groups[0].locked=true;expect(()=>transformSelection(p,['ink'],new THREE.Matrix4().makeTranslation(1,0,0))).toThrow(/Unlock/);
  expect(()=>applyIntent(p,{summary:'Clean ink',actions:[{type:'refine',target:'stroke',id:'ink',mode:'straighten'}]})).toThrow(/Unlock/);
});
it('resolves selected local companion files and rejects missing, ambiguous and remote resources',()=>{
  const bytes=new Uint8Array([1]),resolve=createFileResolver([{name:'Interior/scene.bin',bytes},{name:'Interior/textures/fabric.png',bytes}]);
  expect(resolve('textures/fabric.png').name).toContain('fabric.png');expect(resolve('scene.bin').bytes).toEqual(bytes);
  expect(()=>resolve('missing.png')).toThrow(/Missing/);expect(()=>resolve('https://example.com/fabric.png')).toThrow(/External/);
  expect(()=>createFileResolver([{name:'a/wood.png',bytes},{name:'b/wood.png',bytes}])('wood.png')).toThrow(/Ambiguous/);
  expect(createFileResolver([{name:'room/a/wood.png',bytes},{name:'room/b/wood.png',bytes}])('room/a/../b/wood.png').name).toBe('room/b/wood.png');
});
it('round-trips a full sketch session package without browser storage or credentials',async()=>{
  const p={...emptyProject(),strokes:[stroke]},next=nextSketch(p,p.groups[0].id).project;
  const bytes=packageSession(next,new Map());const reopened=await openSession(bytes);expect(reopened.project).toEqual(next);expect(reopened.assets).toEqual([]);
});
