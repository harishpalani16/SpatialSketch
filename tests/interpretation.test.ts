import {expect,it,vi} from 'vitest';
import {applyIntent,intentSchema} from '../src/lib/intent';
import {sketchContext} from '../src/lib/ai-context';
import {runAI} from '../src/lib/api-server';
import {buildObject,disposeGroup} from '../src/lib/geometry';
import {facadeSketch,facadeProposal} from './fixtures/facade';
import {Box3,Vector3} from 'three';
it('interprets crossing ink into separate parts on its original 3D planes without editing ink',()=>{
  const source=facadeSketch(),result=applyIntent(source,intentSchema.parse(facadeProposal));
  expect(result.strokes).toEqual(source.strokes);expect(source.objects).toEqual([]);expect(result.objects).toHaveLength(3);
  expect(result.objects[1].frame).toEqual(source.strokes[1].frame);expect(result.objects[0].sourceStrokeIds).toEqual(['panel-ink','return-ink']);
  const mesh=buildObject(result.objects[1],false,false);mesh.updateMatrixWorld(true);const size=new Box3().setFromObject(mesh).getSize(new Vector3());expect(size.x).toBeCloseTo(.025);expect(size.y).toBeCloseTo(3);expect(size.z).toBeCloseTo(.4);disposeGroup(mesh);
});
it('still rejects self-crossing generated solids, missing source planes and conflicting frames atomically',()=>{
  const source=facadeSketch(),first=facadeProposal.actions[0];if(first.type!=='component')throw new Error();
  expect(()=>applyIntent(source,{summary:'Invalid',actions:[first,{...first,profile:source.strokes[0].points}]})).toThrow(/crosses/);
  expect(()=>applyIntent(source,{summary:'Invalid',actions:[{...first,frameStrokeId:'missing'}]})).toThrow(/missing/);
  expect(()=>applyIntent(source,{summary:'Invalid',actions:[{...first,frame:source.strokes[0].frame}]})).toThrow(/either/);
  expect(source.objects).toHaveLength(0);
});
it('supports thin detail parts and records the source plane offset',()=>{
  const source=facadeSketch();source.strokes[0].offset=.12;
  const p=applyIntent(source,{summary:'Thin trim',actions:[{type:'component',kind:'slab',name:'Trim',frameStrokeId:'panel-ink',profile:[{x:0,y:0},{x:.1,y:0},{x:.1,y:.01},{x:0,y:.01}],height:.004}]});
  expect(p.objects[0].height).toBe(.004);expect(p.objects[0].frame!.origin[2]).toBeCloseTo(.12);
});
it('gives AI the complete active sketch even when only the last stroke is selected',()=>{
  const source=facadeSketch(),context=sketchContext(source,'sketch-1',['return-ink'],'return-ink');
  expect(context.focusStrokeIds).toEqual(['panel-ink','return-ink']);expect(context.worldBounds!.size).toEqual([2,3,.4]);expect(context.strokes[1].frame.origin).toEqual([2,0,0]);
});
it('repairs a raw-outline extrusion failure once, with the same deadline and unchanged source ink',async()=>{
  const source=facadeSketch(),before=structuredClone(source),responses=[{summary:'Extrude',actions:[{type:'create',strokeId:'panel-ink',kind:'mass',name:'Wrong raw outline',height:3,thickness:.2,floors:1}]},facadeProposal];
  const fetcher=vi.fn().mockImplementation(async()=>Response.json({choices:[{message:{content:JSON.stringify(responses.shift())}}]}));
  const result=await runAI({mode:'interpret',connection:{endpoint:'https://api.ifm.ai/v1/chat/completions',model:'test',key:'test-key'},instruction:'make a facade edge detail',project:source,activeGroupId:'sketch-1',selectedStrokeIds:['return-ink']},fetcher);
  expect(result).toEqual({intent:facadeProposal});expect(source).toEqual(before);expect(fetcher).toHaveBeenCalledTimes(2);
  const first=fetcher.mock.calls[0][1],second=fetcher.mock.calls[1][1];expect(second.signal).toBe(first.signal);
  const messages=JSON.parse(second.body).messages;expect(messages).toHaveLength(4);expect(JSON.parse(messages[1].content).sketchContext.focusStrokeIds).toHaveLength(2);expect(messages[3].content).toContain('crosses itself');
});
