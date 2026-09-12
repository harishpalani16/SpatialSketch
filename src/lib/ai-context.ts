import { bounds, type Project } from './model';
import { planeMatrix } from './spatial';
import { matrixFrame, strokeBounds, strokeGroup } from './session';
import { Vector3 } from 'three';

export function sketchContext(project:Project, activeGroupId?:string|null, selectedStrokeIds:string[]=[], activeStrokeId?:string|null) {
  const active=project.strokes.find(s=>s.id===activeStrokeId);
  const groupId=activeGroupId || (active?strokeGroup(project,active):project.groups[0].id);
  if(!project.groups.some(g=>g.id===groupId))throw new Error('The active sketch is no longer available. Select a sketch and try again.');
  if(selectedStrokeIds.some(id=>!project.strokes.some(s=>s.id===id)))throw new Error('The selected ink changed. Select the sketch again.');
  const focus=project.strokes.filter(s=>strokeGroup(project,s)===groupId || selectedStrokeIds.includes(s.id));
  const box=strokeBounds(focus);
  return {
    activeGroupId:groupId, selectedStrokeIds, focusStrokeIds:focus.map(s=>s.id),
    interpretation:'Interpret the complete active sketch and any additional selected strokes as one spatial idea. Raw ink can overlap or cross itself. Preserve it and propose separate clean model components.',
    worldBounds:box.isEmpty()?null:{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new Vector3()).toArray()},
    strokes:focus.map(s=>({id:s.id,groupId:strokeGroup(project,s),name:s.name,localBounds:bounds(s.points),frame:matrixFrame(planeMatrix(s.plane,s.offset,s.frame),s.frame?.label)})),
  };
}
