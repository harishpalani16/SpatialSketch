'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildReferences, disposeReferenceInstances, type AssetCache } from '@/lib/import-geometry';
import { strokeBounds } from '@/lib/session';
import { buildScene, disposeGroup, strokeLine } from '@/lib/geometry';
import { distance, uid, type ModelObject, type Point, type SketchFrame, type Stroke, type ReferenceModel } from '@/lib/model';
import { frameForCamera, frameFromNormal, frameMatrix, frameNormal, projectRay } from '@/lib/spatial';
import type { SketchTool } from './sketch-canvas';

export type SpatialMode = 'draw' | 'navigate' | 'pick-face' | 'transform';
export type TransformTarget = 'sketch' | 'plane' | 'reference';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ModelViewHandle = { fit: () => void; view: (direction: 'iso' | 'top') => void; viewPlane: () => void; alignPlane: () => void; exportGLB: () => Promise<ArrayBuffer> };
type Props = { objects: ModelObject[]; committedIds: string[]; strokes: Stroke[]; selectedId: string | null; onSelect: (id: string) => void; activeFrame: SketchFrame; mode: SpatialMode; tool: SketchTool; snap: boolean; touchDraw: boolean; showPlane: boolean; onFrame: (frame: SketchFrame) => void; onStroke: (s: Stroke) => void; onMessage: (message: string) => void; references:ReferenceModel[]; assets:AssetCache; selectedReferenceId:string|null; selectedStrokeIds:string[]; onSelectStroke:(id:string,additive:boolean)=>void; onSelectReference:(id:string)=>void; transformTarget:TransformTarget; gizmoMode:GizmoMode; onTransform:(matrix:THREE.Matrix4)=>void; planeWidth:number; planeHeight:number; canDraw:boolean };
type Engine = { scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls; root: THREE.Group; ink: THREE.Group; guide: THREE.Group; draft: THREE.Group; references:THREE.Group; gizmo:TransformControls; proxy:THREE.Group; transforming:boolean; dirty: boolean };

function fit(engine: Engine, direction?: 'iso' | 'top') {
  const box = new THREE.Box3().setFromObject(engine.root).union(new THREE.Box3().setFromObject(engine.ink)).union(new THREE.Box3().setFromObject(engine.references));
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? 12 : Math.max(4, box.getSize(new THREE.Vector3()).length());
  const distance = size * 1.35 * Math.max(1, 1 / engine.camera.aspect);
  const heading = direction === 'top' ? new THREE.Vector3(0, 1, 0.001) : direction === 'iso' ? new THREE.Vector3(1, 0.85, 1.2).normalize() : engine.camera.position.clone().sub(engine.controls.target).normalize();
  engine.controls.target.copy(center); engine.camera.position.copy(center).addScaledVector(heading, distance);
  engine.camera.up.set(0, 1, 0); engine.camera.far = Math.max(2000, distance * 10);
  engine.camera.updateProjectionMatrix(); engine.controls.update(); engine.dirty = true;
}

function planeGuide(frame: SketchFrame,width=24,height=24) {
  const group = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: '#b9cba3', side: THREE.DoubleSide, transparent: true, opacity: 0.07, depthWrite: false }));
  const points: THREE.Vector3[] = [];
  const step=Math.max(1,Math.ceil(Math.max(width,height)/80));
  for(let i=Math.ceil(-width/2/step)*step;i<=width/2;i+=step)points.push(new THREE.Vector3(i,-height/2,0),new THREE.Vector3(i,height/2,0));
  for(let i=Math.ceil(-height/2/step)*step;i<=height/2;i+=step)points.push(new THREE.Vector3(-width/2,i,0),new THREE.Vector3(width/2,i,0));
  group.add(plane, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#79936b', transparent: true, opacity: 0.24, depthWrite: false })));
  const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]].map(([x,y]) => new THREE.Vector3(x,y,0))), new THREE.LineBasicMaterial({ color: '#79936b', transparent: true, opacity: 0.6, depthWrite: false }));
  group.add(border, new THREE.AxesHelper(2)); group.applyMatrix4(frameMatrix(frame, 0.008)); return group;
}

const ModelView = forwardRef<ModelViewHandle, Props>(function ModelView(props, ref) {
  const host = useRef<HTMLDivElement>(null), engineRef = useRef<Engine | null>(null);
  const propsRef = useRef(props); propsRef.current = props;
  // Session validation clones metadata. Keep large mesh instances across unrelated ink/history edits.
  const referenceKey = JSON.stringify(props.references);
  const stableReferences = useMemo<ReferenceModel[]>(() => JSON.parse(referenceKey), [referenceKey]);
  const [error, setError] = useState('');
  useImperativeHandle(ref, () => ({
    fit() { if (engineRef.current) fit(engineRef.current); },
    view(direction) { if (engineRef.current) fit(engineRef.current, direction); },
    viewPlane() { const e = engineRef.current; if (e) { e.camera.updateMatrixWorld(); propsRef.current.onFrame(frameForCamera(e.camera, e.controls.target)); } },
    alignPlane() {
      const e = engineRef.current; if (!e) return;
      const f = propsRef.current.activeFrame, d = Math.max(8, e.camera.position.distanceTo(e.controls.target));
      e.controls.target.set(...f.origin); e.camera.position.copy(e.controls.target).addScaledVector(frameNormal(f), d); e.camera.up.set(...f.v); e.controls.update(); e.dirty = true;
    },
    async exportGLB() {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const scene = buildScene(propsRef.current.objects, null, false);
      const references=buildReferences(propsRef.current.references,propsRef.current.assets);scene.add(references);
      try { return await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer; }
      finally { scene.remove(references);disposeReferenceInstances(references);disposeGroup(scene); }
    },
  }), []);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
    catch { setError('3D needs WebGL. Try Safari or a browser with hardware acceleration enabled.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); renderer.setClearColor('#efeee7');
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', '3D sketch canvas. Pencil draws; fingers orbit.'); canvas.setAttribute('data-testid', 'model-canvas'); canvas.style.touchAction = 'none';
    element.appendChild(canvas);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#efeee7');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000); camera.position.set(20, 17, 24);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.minDistance = 0.5; controls.maxDistance = 1500;
    scene.add(new THREE.HemisphereLight('#fffef2', '#b3b7a7', 2.5));
    const sun = new THREE.DirectionalLight('#fff9e9', 3.2); sun.position.set(-14, 30, 16); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 100; sun.shadow.normalBias = 0.03; sun.shadow.bias = -0.0001; scene.add(sun);
    const grid = new THREE.GridHelper(100, 100, '#c9cbbf', '#d7d8ce'); grid.position.y = -0.025;
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.4; scene.add(grid);
    const root = buildScene(propsRef.current.objects), ink = new THREE.Group(), guide = new THREE.Group(), draft = new THREE.Group(); scene.add(root, ink, guide, draft);
    const references=new THREE.Group(),proxy=new THREE.Group();scene.add(references,proxy);
    const gizmo=new TransformControls(camera,canvas);gizmo.setSize(1.15);scene.add(gizmo.getHelper());
    const engine: Engine = { scene, renderer, camera, controls, root, ink, guide, draft, references, proxy, gizmo, transforming:false, dirty: true }; engineRef.current = engine;
    let startMatrix=new THREE.Matrix4(),startToken='',moving:{object:THREE.Object3D;matrix:THREE.Matrix4}[]=[];
    const token=()=>JSON.stringify([propsRef.current.transformTarget,propsRef.current.selectedStrokeIds,propsRef.current.selectedReferenceId]);
    gizmo.addEventListener('mouseDown',()=>{
      proxy.updateMatrix();startMatrix.copy(proxy.matrix);startToken=token();engine.transforming=true;controls.enabled=false;
      const p=propsRef.current,targets=p.transformTarget==='plane'?[guide]:p.transformTarget==='reference'?engine.references.children.filter(c=>c.userData.referenceId===p.selectedReferenceId):ink.children.filter(c=>p.selectedStrokeIds.includes(c.userData.strokeId));
      moving=targets.map(object=>({object,matrix:object.matrix.clone()}));
    });
    gizmo.addEventListener('objectChange',()=>{
      if(!engine.transforming)return;proxy.updateMatrix();const delta=proxy.matrix.clone().multiply(startMatrix.clone().invert());
      moving.forEach(({object,matrix})=>{object.matrixAutoUpdate=false;object.matrix.copy(delta).multiply(matrix);object.matrixWorldNeedsUpdate=true;});engine.dirty=true;
    });
    gizmo.addEventListener('mouseUp',()=>{
      if(!engine.transforming)return;proxy.updateMatrix();const delta=proxy.matrix.clone().multiply(startMatrix.clone().invert());
      moving.forEach(({object,matrix})=>{object.matrix.copy(matrix);object.matrixWorldNeedsUpdate=true;});engine.transforming=false;
      if(startToken===token())propsRef.current.onTransform(delta);engine.dirty=true;
    });
    gizmo.addEventListener('change',()=>{engine.dirty=true;});
    controls.addEventListener('change', () => { engine.dirty = true; });
    const resize = new ResizeObserver(() => { const { width, height } = element.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); engine.dirty = true; }); resize.observe(element);
    const rect = element.getBoundingClientRect(); renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(1, rect.height); fit(engine, 'iso');
    let gesture: { id: number; frame: SketchFrame; points: Point[]; tool: SketchTool; snap: boolean } | null = null;
    let down: { id: number; x: number; y: number } | null = null;
    const ignored = new Set<number>();
    const rayAt = (event: PointerEvent) => { const r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(); camera.updateMatrixWorld(); engine.root.updateMatrixWorld(true);engine.references.updateMatrixWorld(true);ink.updateMatrixWorld(true);ray.params.Line.threshold=Math.max(.03,Math.min(.4,camera.position.distanceTo(controls.target)*.004)); ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1, -(event.clientY-r.top)/r.height*2+1), camera); return ray; };
    const consume = (e: PointerEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const clearDraft = () => { disposeGroup(draft); draft.clear(); engine.dirty = true; };
    const pointAt = (event: PointerEvent, f: SketchFrame, snap: boolean) => { const p = projectRay(rayAt(event).ray, f); return p && snap ? { x: Math.round(p.x*4)/4, y: Math.round(p.y*4)/4 } : p; };
    const update = (event: PointerEvent) => {
      if (!gesture) return;
      const g = gesture, events = event.getCoalescedEvents?.() || [];
      for (const e of events.length ? events : [event]) {
        const p = pointAt(e, g.frame, g.snap); if (!p) continue;
        if (g.tool === 'rectangle') { const a = g.points[0]; g.points = [a,{x:p.x,y:a.y},p,{x:a.x,y:p.y},a]; }
        else if (g.tool === 'line') g.points = [g.points[0],p];
        else if (distance(g.points.at(-1)!,p) > 0.025 && g.points.length < 1500) g.points.push(p);
      }
      clearDraft(); if (g.points.length > 1) draft.add(strokeLine(g.points,'custom',0,g.frame));
    };
    const pointerDown = (event: PointerEvent) => {
      const p = propsRef.current;
      if (gesture) { if (event.pointerId !== gesture.id) ignored.add(event.pointerId); consume(event); return; }
      down = { id:event.pointerId,x:event.clientX,y:event.clientY };
      const canInk = event.pointerType !== 'touch' || p.touchDraw;
      if (p.mode === 'pick-face' && event.button === 0) {
        consume(event); ignored.add(event.pointerId);
        const hit = rayAt(event).intersectObjects([...engine.root.children,...engine.references.children],true).find(h => h.object instanceof THREE.Mesh && (h.object.userData.referenceId || p.committedIds.includes(h.object.userData.objectId)));
        if (!hit?.face) { p.onMessage('Tap a face on an existing form, or choose View plane for empty space.'); return; }
        const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
        const frame = frameFromNormal(hit.point, normal, new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),'Face plane');
        frame.hostObjectId = hit.object.userData.objectId || hit.object.userData.referenceId; p.onFrame(frame); return;
      }
      if (p.mode !== 'draw' || !canInk || event.button !== 0 || event.altKey) return;
      consume(event);
      if(!p.canDraw){ignored.add(event.pointerId);p.onMessage('Show and unlock the active sketch before drawing, or start the next sketch.');return;}
      const frame = structuredClone(p.activeFrame), point = pointAt(event,frame,p.snap);
      if (!point) { ignored.add(event.pointerId); p.onMessage('This plane is edge-on or behind the camera. Choose View plane or Align view.'); return; }
      controls.enabled = false;
      // Flush residual orbit damping before freezing the camera for a complete stroke.
      controls.enableDamping = false; controls.update(); controls.enableDamping = true;
      const start = pointAt(event,frame,p.snap); if (!start) { controls.enabled = true; return; }
      gesture = { id:event.pointerId,frame,points:[start],tool:p.tool,snap:p.snap };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => { if (ignored.has(event.pointerId)) { consume(event); return; } if (gesture?.id === event.pointerId) { consume(event); update(event); } };
    const finish = (event: PointerEvent, cancel = false) => {
      if (ignored.delete(event.pointerId)) { consume(event); return; }
      if (gesture?.id === event.pointerId) {
        consume(event); if (!cancel) update(event);
        const g = gesture; gesture = null; clearDraft(); controls.enabled = true;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (cancel) propsRef.current.onMessage('Stroke interrupted. Draw it again when ready.');
        else if (g.points.length > 1 && g.points.some(p => distance(p,g.points[0]) > 0.08)) propsRef.current.onStroke({ id:uid(),plane:'custom',frame:g.frame,offset:0,points:g.points });
        down = null; return;
      }
      if (!cancel && down?.id === event.pointerId && propsRef.current.mode === 'navigate' && Math.hypot(event.clientX-down.x,event.clientY-down.y) < 5) {
        const hit = rayAt(event).intersectObjects([...ink.children,...engine.root.children,...engine.references.children],true).find(h => h.object.userData.strokeId || h.object instanceof THREE.Mesh);
        if(hit?.object.userData.strokeId)propsRef.current.onSelectStroke(hit.object.userData.strokeId,event.shiftKey);
        else if(hit?.object.userData.referenceId)propsRef.current.onSelectReference(hit.object.userData.referenceId);
        else if (hit?.object.userData.objectId) propsRef.current.onSelect(hit.object.userData.objectId);
      }
      down = null;
    };
    const cancelTransform = () => {
      if (!engine.transforming) return;
      // A canceled Pencil gesture must restore the preview and release the control's drag state.
      gizmo.reset(); startToken = ''; gizmo.pointerUp(null);
      gizmo.disconnect(); gizmo.connect(canvas);
      propsRef.current.onMessage('Transform interrupted. Its previous position is restored.');
    };
    const pointerUp = (e: PointerEvent) => finish(e);
    const pointerCancel = (e: PointerEvent) => { cancelTransform(); finish(e,true); if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId); };
    const lostCapture = (e: PointerEvent) => { cancelTransform(); if (gesture?.id === e.pointerId) finish(e,true); };
    const lost = (event: Event) => { event.preventDefault(); setError('The browser paused 3D. Download your project before refreshing to restore it.'); };
    canvas.addEventListener('pointerdown',pointerDown,true); canvas.addEventListener('pointermove',pointerMove,true); canvas.addEventListener('pointerup',pointerUp,true); canvas.addEventListener('pointercancel',pointerCancel,true); canvas.addEventListener('lostpointercapture',lostCapture,true); canvas.addEventListener('webglcontextlost',lost);
    let animation = 0;
    const render = () => { animation = requestAnimationFrame(render); if (!gesture && !engine.transforming && controls.enabled) controls.update(); if (engine.dirty && element.clientWidth && element.clientHeight && document.visibilityState === 'visible') { renderer.render(scene,camera); engine.dirty = false; } }; render();
    return () => {
      cancelAnimationFrame(animation); resize.disconnect(); controls.dispose();
      canvas.removeEventListener('pointerdown',pointerDown,true); canvas.removeEventListener('pointermove',pointerMove,true); canvas.removeEventListener('pointerup',pointerUp,true); canvas.removeEventListener('pointercancel',pointerCancel,true); canvas.removeEventListener('lostpointercapture',lostCapture,true); canvas.removeEventListener('webglcontextlost',lost);
      gizmo.dispose();scene.remove(gizmo.getHelper(),engine.references);disposeReferenceInstances(engine.references);disposeGroup(scene); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); engineRef.current = null;
    };
  }, []);
  useEffect(() => {
    const e = engineRef.current; if (!e) return;
    e.scene.remove(e.root); disposeGroup(e.root); e.root = buildScene(props.objects,props.selectedId); e.scene.add(e.root); e.dirty = true;
  }, [props.objects,props.selectedId]);
  useEffect(() => { const e = engineRef.current; if (!e) return; disposeGroup(e.ink); e.ink.clear(); props.strokes.forEach(s => {const line=strokeLine(s.points,s.plane,s.offset,s.frame);line.userData.strokeId=s.id;if(props.selectedStrokeIds.includes(s.id))(line.material as THREE.LineBasicMaterial).color.set('#4564b4');e.ink.add(line);}); e.dirty = true; }, [props.strokes,props.selectedStrokeIds]);
  useEffect(()=>{const e=engineRef.current;if(!e)return;e.scene.remove(e.references);disposeReferenceInstances(e.references);e.references=buildReferences(stableReferences,props.assets);e.scene.add(e.references);e.dirty=true;},[stableReferences,props.assets]);
  useEffect(() => { const e = engineRef.current; if (!e) return; disposeGroup(e.guide); e.guide.clear();e.guide.matrix.identity(); if (props.showPlane) e.guide.add(planeGuide(props.activeFrame,props.planeWidth,props.planeHeight)); e.renderer.domElement.style.cursor = props.mode === 'navigate' ? 'grab' : 'crosshair'; e.dirty = true; }, [props.activeFrame,props.showPlane,props.mode,props.planeWidth,props.planeHeight]);
  useEffect(()=>{
    const e=engineRef.current;if(!e || e.transforming)return;
    e.gizmo.detach();e.controls.enabled=props.mode!=='transform';
    if(props.mode==='transform') {
      const box=props.transformTarget==='sketch'?strokeBounds(props.strokes.filter(s=>props.selectedStrokeIds.includes(s.id))):props.transformTarget==='reference'?new THREE.Box3().setFromObject(e.references.children.find(c=>c.userData.referenceId===props.selectedReferenceId)||new THREE.Group()):null;
      if(box?.isEmpty())return;
      e.proxy.position.copy(box?box.getCenter(new THREE.Vector3()):new THREE.Vector3(...props.activeFrame.origin));e.proxy.rotation.set(0,0,0);e.proxy.scale.set(1,1,1);
      if(props.gizmoMode==='scale' && props.transformTarget==='plane')e.proxy.quaternion.setFromRotationMatrix(frameMatrix(props.activeFrame));
      if(props.gizmoMode==='scale' && props.transformTarget==='reference'){const r=props.references.find(r=>r.id===props.selectedReferenceId);if(r)e.proxy.rotation.set(...r.transform.rotation.map(v=>v*Math.PI/180) as [number,number,number]);}
      e.proxy.updateMatrix();e.gizmo.showZ=!(props.gizmoMode==='scale'&&props.transformTarget==='plane');e.gizmo.showXZ=e.gizmo.showYZ=e.gizmo.showZ;
      e.gizmo.setMode(props.gizmoMode);e.gizmo.setSpace(props.gizmoMode==='scale'&&props.transformTarget!=='sketch'?'local':'world');e.gizmo.setTranslationSnap(props.snap?0.25:null);e.gizmo.setRotationSnap(props.snap?Math.PI/12:null);e.gizmo.attach(e.proxy);
    }e.dirty=true;
  },[props.mode,props.transformTarget,props.gizmoMode,props.selectedStrokeIds,props.selectedReferenceId,props.strokes,props.references,props.activeFrame,props.snap]);
  return <div className="model-renderer" ref={host}>{error && <div className="canvas-error" role="alert">{error}</div>}</div>;
});
export default ModelView;
