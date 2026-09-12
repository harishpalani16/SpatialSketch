import * as THREE from 'three';
import { parseProject, uid, type Project, type Stroke, type SketchFrame, type Transform } from './model';
import { frameMatrix, planeMatrix } from './spatial';

export const strokeGroup = (project:Project,s:Stroke) => s.groupId || project.groups[0].id;
export function strokeBounds(strokes:Stroke[]) {
  const box=new THREE.Box3();
  for(const s of strokes) { const m=planeMatrix(s.plane,s.offset,s.frame); for(const p of s.points) box.expandByPoint(new THREE.Vector3(p.x,p.y,0).applyMatrix4(m)); }
  return box;
}
export function transformStrokes(strokes:Stroke[],delta:THREE.Matrix4):Stroke[] {
  return strokes.map(s=>{
    const original=planeMatrix(s.plane,s.offset,s.frame), combined=delta.clone().multiply(original);
    const origin=new THREE.Vector3().setFromMatrixPosition(combined);
    const u=new THREE.Vector3().setFromMatrixColumn(combined,0).normalize();
    const v=new THREE.Vector3().setFromMatrixColumn(combined,1);v.addScaledVector(u,-v.dot(u)).normalize();
    if (u.lengthSq()<.99 || v.lengthSq()<.99) throw new Error('A sketch cannot be flattened to zero size.');
    const frame:SketchFrame={origin:origin.toArray(),u:u.toArray(),v:v.toArray(),label:s.frame?.label || 'Transformed sketch'};
    const inverse=frameMatrix(frame).invert();
    const points=s.points.map(p=>{const world=new THREE.Vector3(p.x,p.y,0).applyMatrix4(combined).applyMatrix4(inverse);return {x:world.x,y:world.y};});
    return {...s,plane:'custom',offset:0,frame,points};
  });
}
export function transformSelection(project:Project,ids:string[],matrix:THREE.Matrix4) {
  const selected=project.strokes.filter(s=>ids.includes(s.id));
  if(selected.some(s=>project.groups.find(g=>g.id===strokeGroup(project,s))?.locked)) throw new Error('Unlock this sketch before transforming its ink.');
  const changed=new Map(transformStrokes(selected,matrix).map(s=>[s.id,s]));
  return parseProject({...project,strokes:project.strokes.map(s=>changed.get(s.id)||s)});
}
export function nextSketch(project:Project,currentId:string) {
  const group={id:uid(),name:'Sketch '+(project.groups.length+1),visible:true,locked:false,status:'drawing' as const};
  return {group,project:parseProject({...project,groups:[...project.groups.map(g=>g.id===currentId?{...g,status:'ready'}:g),group]})};
}
export function deleteSketch(project:Project,id:string) {
  const groups=project.groups.filter(g=>g.id!==id);
  if(!groups.length) groups.push({id:uid(),name:'Sketch 1',visible:true,locked:false,status:'drawing'});
  return parseProject({...project,groups,strokes:project.strokes.filter(s=>strokeGroup(project,s)!==id)});
}
export function transformMatrix(t:Transform) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...t.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(v=>v*Math.PI/180) as [number,number,number],'XYZ')),new THREE.Vector3(...t.scale));
}
export function centeredTransform(t:Transform,center:THREE.Vector3) { return new THREE.Matrix4().makeTranslation(...center.toArray()).multiply(transformMatrix(t)).multiply(new THREE.Matrix4().makeTranslation(...center.clone().negate().toArray())); }
export function matrixFrame(matrix:THREE.Matrix4,label='Spatial plane'):SketchFrame {
  return {origin:new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),u:new THREE.Vector3().setFromMatrixColumn(matrix,0).normalize().toArray(),v:new THREE.Vector3().setFromMatrixColumn(matrix,1).normalize().toArray(),label};
}
