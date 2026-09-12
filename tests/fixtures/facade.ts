import {emptyProject,type Project} from '../../src/lib/model';
import type {Intent} from '../../src/lib/intent';
export function facadeSketch():Project {
  const points=[{x:0,y:0},{x:2,y:3},{x:0,y:3},{x:2,y:0},{x:0,y:0}];
  return {...emptyProject(),name:'Facade concept',strokes:[
    {id:'panel-ink',groupId:'sketch-1',plane:'custom',offset:0,frame:{origin:[0,0,0],u:[1,0,0],v:[0,1,0],label:'Facade'},points},
    {id:'return-ink',groupId:'sketch-1',plane:'custom',offset:0,frame:{origin:[2,0,0],u:[0,0,1],v:[0,1,0],label:'Return'},points:points.map(p=>({x:p.x*.2,y:p.y}))},
  ]};
}
export const facadeProposal:Intent={summary:'Interpret the overlapping ink as a 2 × 3 m facade panel, 0.4 m return, and a top edge member. Assume 25 mm panels; retain the original sketch. Concept geometry only.',actions:[
  {type:'component',kind:'slab',name:'Facade panel',frameStrokeId:'panel-ink',sourceStrokeIds:['panel-ink','return-ink'],profile:[{x:0,y:0},{x:2,y:0},{x:2,y:3},{x:0,y:3}],height:.025},
  {type:'component',kind:'slab',name:'Facade return',frameStrokeId:'return-ink',profile:[{x:0,y:0},{x:.4,y:0},{x:.4,y:3},{x:0,y:3}],height:.025},
  {type:'component',kind:'wall',name:'Top edge member',frameStrokeId:'panel-ink',profile:[{x:0,y:3},{x:2,y:3}],height:.08,thickness:.04},
]};
