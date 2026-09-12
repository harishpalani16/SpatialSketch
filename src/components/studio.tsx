'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, Box, Check, ChevronDown, CircleHelp, Columns2, Download, Expand, FilePlus2, FolderOpen, Grid2X2, Hand, KeyRound, LoaderCircle, Maximize2, MousePointer2, MoveUpRight, PanelRightClose, PenLine, Plus, Redo2, Settings2, SlidersHorizontal, Sparkles, Square, Trash2, Undo2, X } from 'lucide-react';
import ModelView, { type ModelViewHandle, type SpatialMode } from './model-view';
import SpatialToolbar from './spatial-toolbar';
import * as THREE from 'three';
import SketchSessionPanel from './sketch-session-panel';
import ReferencePanel from './reference-panel';
import { centeredTransform, deleteSketch, matrixFrame, nextSketch, strokeBounds, strokeGroup, transformMatrix, transformSelection } from '@/lib/session';
import { frameMatrix, planeMatrix } from '@/lib/spatial';
import { loadGeometry, readSourceFiles, referenceForAsset, disposeAssetRoot, MAX_IMPORT_BYTES, type AssetCache } from '@/lib/import-geometry';
import { packageSession, openSession } from '@/lib/session-file';
import type { GizmoMode, TransformTarget } from './model-view';
import type { Transform, ReferenceModel, SketchGroup, Workplane } from '@/lib/model';
import SketchCanvas, { type SketchTool } from './sketch-canvas';
import ConnectionPanel from './connection-panel';
import SpeechInput from './speech-input';
import NumberField from './number-field';
import ProfileControls from './profile-controls';
import { bounds, createObject, emptyProject, kindNames, objectSchema, palette, parseProject, planeNames, polygonArea, sampleProject, uid, type Kind, type ModelObject, type Plane, type Project, type SketchFrame, type Stroke } from '@/lib/model';
import { baseFrame } from '@/lib/spatial';
import { applyIntent, intentSchema, type Intent } from '@/lib/intent';
import type { Connection } from '@/lib/api-server';

type History = { past: Project[]; present: Project; future: Project[] };
type HistoryAction = { type: 'commit'; project: Project } | { type: 'undo' | 'redo' };
function reducer(state: History, action: HistoryAction): History {
  if (action.type === 'commit') return { past: [...state.past.slice(-29), state.present], present: action.project, future: [] };
  if (action.type === 'undo' && state.past.length) return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  if (action.type === 'redo' && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}
function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Studio() {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({ past: [], present: emptyProject(), future: [] }));
  const project = history.present;
  const projectRef = useRef(project); projectRef.current = project;
  const revision = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStroke, setActiveStroke] = useState<string | null>(null);
  const [plane, setPlane] = useState<Plane>('ground');
  const [offset, setOffset] = useState(0);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [snap, setSnap] = useState(false);
  const [touchDraw, setTouchDraw] = useState(false);
  const [view, setView] = useState<'split' | 'sketch' | 'model'>('model');
  const [spatialMode, setSpatialMode] = useState<SpatialMode>('draw');
  const [showPlane, setShowPlane] = useState(true);
  const [previewMode,setPreviewMode]=useState<'shaded'|'materials'>('shaded');
  const activeFrame = project.workplane.frame;
  const [inspector, setInspector] = useState<'sketches' | 'references' | 'create' | 'edit'>('sketches');
  const [activeGroup, setActiveGroup] = useState('sketch-1');
  const [selectedStrokes, setSelectedStrokes] = useState<string[]>([]);
  const [selectedReference, setSelectedReference] = useState<string|null>(null);
  const [transformTarget, setTransformTarget] = useState<TransformTarget>('sketch');
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [importBusy, setImportBusy] = useState(false);
  const assets = useRef<AssetCache>(new Map());
  const geometryFile = useRef<HTMLInputElement>(null), geometryFolder = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  const group = project.groups.find(g=>g.id===activeGroup) || project.groups[0];
  const selectedStrokeIds = useMemo(()=>selectedStrokes.filter(id=>project.strokes.some(s=>s.id===id)),[selectedStrokes,project.strokes]);
  useEffect(()=>{
    const used=new Set([...history.past,history.present,...history.future].flatMap(p=>p.references.map(r=>r.assetId)));
    for(const [id,asset] of assets.current)if(!used.has(id)){disposeAssetRoot(asset.root);assets.current.delete(id);}
  },[history]);
  const [kind, setKind] = useState<Kind>('mass');
  const [height, setHeight] = useState(3.6);
  const [thickness, setThickness] = useState(0.25);
  const [floors, setFloors] = useState(1);
  const [sidebar, setSidebar] = useState(true);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connection, setConnection] = useState<Connection>({ endpoint: '', model: '', key: '' });
  const [verified, setVerified] = useState(false);
  const [speechBusy,setSpeechBusy]=useState(false);
  const [speechSession,setSpeechSession]=useState(0);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ intent: Intent; project: Project; revision: number } | null>(null);
  const [notice, setNotice] = useState('Your session keeps every sketch together. Import an interior, or start drawing an idea.');
  const modelView = useRef<ModelViewHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const selected = project.objects.find(o => o.id === selectedId);
  const stroke = project.strokes.find(s => s.id === activeStroke);
  const newForm = useMemo(() => {
    if (!stroke || inspector !== 'create') return { object: null, error: '' };
    try { return { object: createObject(stroke, kind, { height, thickness, floors, name: kindNames[kind] + ' ' + (project.objects.length + 1) }), error: '' }; }
    catch (error) { return { object: null, error: error instanceof Error ? error.message : 'Check this outline.' }; }
  }, [stroke, inspector, kind, height, thickness, floors, project.objects.length]);
  const displayObjects = useMemo(() => proposal ? proposal.project.objects : newForm.object ? [...project.objects, newForm.object] : project.objects, [proposal, newForm.object, project.objects]);
  const displayStrokes = useMemo(() => (proposal ? proposal.project.strokes : project.strokes).filter(s=>project.groups.find(g=>g.id===strokeGroup(project,s))?.visible),[proposal,project]);
  const committedIds = useMemo(() => project.objects.map(o => o.id), [project.objects]);
  const preview = !!proposal || !!newForm.object;
  function commit(next: Project) { const valid=parseProject(next);revision.current++; projectRef.current=valid;dispatch({ type: 'commit', project: valid }); setProposal(null); }
  function undo() { revision.current++; dispatch({ type: 'undo' }); setProposal(null); setNotice('Undone.'); }
  function redo() { revision.current++; dispatch({ type: 'redo' }); setProposal(null); setNotice('Redone.'); }
  const actions = useRef({ undo, redo, deleteInk }); actions.current = { undo, redo, deleteInk:()=>{if(inspector==='sketches')deleteInk();} };
  useEffect(() => {
    if (window.innerWidth <= 900) setSidebar(false);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.current.deleteInk(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) actions.current.redo(); else actions.current.undo(); }
    };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); request.current?.abort(); };
  }, []);
  function select(id: string) { setSelectedId(id);setSelectedStrokes([]);setActiveStroke(null);setInspector('edit');setProposal(null); }
  function chooseFrame(frame: SketchFrame) { commit({...projectRef.current,workplane:{...projectRef.current.workplane,frame}});setSpatialMode('draw');setShowPlane(true);setNotice((frame.label || 'Spatial plane')+' placed. Existing ink stays fixed.'); }
  function startNew() { setSpeechSession(n=>n+1); importGeneration.current++;commit(emptyProject());setActiveGroup('sketch-1');setSelectedStrokes([]);setSelectedReference(null);setSelectedId(null);setActiveStroke(null);setInspector('sketches');setSpatialMode('draw');setMenu(false);requestAnimationFrame(()=>modelView.current?.view('iso'));setNotice('New session. Develop your first sketch, then use Finish & next to keep it and begin another.'); }
  function addStroke(s: Stroke) {
    if (projectRef.current.strokes.length >= 1000) { setNotice('This session has 1,000 strokes. Clear unused ink before drawing more.'); return; }
    if(!group.visible||group.locked){setNotice('Show and unlock this sketch before drawing.');return;}
    try { commit(parseProject({ ...projectRef.current, groups:projectRef.current.groups.map(g=>g.id===group.id?{...g,status:'drawing'}:g),strokes: [...projectRef.current.strokes, {...s,groupId:group.id}] })); setActiveStroke(s.id);setSelectedStrokes([s.id]);setInspector('sketches');setNotice('Ink added to '+group.name+'. Keep developing the idea.'); }
    catch { setNotice('That stroke is outside the supported study size. Reset the sketch view and try again.'); }
  }
  function createForm() {
    if (!newForm.object) { setNotice(newForm.error || 'Draw an outline first.'); return; }
    try { commit(parseProject({ ...project, objects: [...project.objects, newForm.object] })); setSelectedId(newForm.object.id); setInspector('edit'); setNotice(newForm.object.name + ' created. Its dimensions are ready to edit.'); }
    catch { setNotice('This study has reached its object limit. Remove an object before adding another.'); }
  }
  function changeObject(changes: Partial<ModelObject>) {
    if (!selected) return;
    try { const changed = objectSchema.parse({ ...selected, ...changes }); commit(parseProject({ ...project, objects: project.objects.map(o => o.id === selected.id ? changed : o) })); }
    catch { setNotice('Use dimensions within the supported range.'); }
  }
  function removeSelected() { if (!selected) return; commit({ ...project, objects: project.objects.filter(o => o.id !== selected.id) }); setSelectedId(null); setInspector('create'); setNotice('Object removed. You can undo this.'); }
  function exportProject() { try {const name=project.name.replace(/[^a-z0-9_-]/gi,'-');if(project.references.length)download(packageSession(project,assets.current) as BlobPart,name+'.spatial.zip','application/zip');else download(JSON.stringify(parseProject(project),null,2),name+'.spatial.json','application/json');setMenu(false);setNotice('Session downloaded with every sketch and imported model. API settings are excluded.');}catch(e){setNotice(e instanceof Error?e.message:'Could not download this session.');} }
  async function importProject(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile=e.target.files?.[0];e.target.value='';if(!selectedFile||importBusy)return;
    const initialRevision=revision.current;setImportBusy(true);
    try {
      let next:Project,loaded:Awaited<ReturnType<typeof openSession>>['assets']=[];
      if(selectedFile.name.toLowerCase().endsWith('.zip')){if(selectedFile.size>MAX_IMPORT_BYTES*2)throw new Error('Use a session package smaller than 300 MB.');const session=await openSession(new Uint8Array(await selectedFile.arrayBuffer()));next=session.project;loaded=session.assets;}
      else {if(selectedFile.size>25*1024*1024)throw new Error('Use a session JSON smaller than 25 MB.');next=parseProject(JSON.parse(await selectedFile.text()));if(next.references.some(r=>!assets.current.has(r.assetId)))throw new Error('This JSON refers to missing model files. Open the complete .spatial.zip package instead.');}
      if(initialRevision!==revision.current){loaded.forEach(a=>disposeAssetRoot(a.root));throw new Error('The session changed while the file was opening. Try opening it again when ready.');}
      const retained=[...assets.current.values(),...loaded].reduce((n,a)=>n+a.files.reduce((m,f)=>m+f.bytes.byteLength,0),0);
      if(retained>MAX_IMPORT_BYTES*2){loaded.forEach(a=>disposeAssetRoot(a.root));throw new Error('Opening this package exceeds 300 MB of models including undo history. Open it in a new tab.');}
      loaded.forEach(a=>{if(assets.current.has(a.id)){const old=a.id;a.id=uid();next.references=next.references.map(r=>r.assetId===old?{...r,assetId:a.id}:r);}assets.current.set(a.id,a);});setSpeechSession(n=>n+1);commit(next);setActiveGroup(next.groups[0].id);setSelectedStrokes([]);setActiveStroke(null);setSelectedReference(next.references[0]?.id||null);setSelectedId(next.objects[0]?.id||null);setInspector('sketches');setSpatialMode('navigate');setNotice('Session opened. All sketches and reference geometry are available.');requestAnimationFrame(()=>modelView.current?.fit());
    }catch(e){setNotice(e instanceof Error&&!('issues' in e)?e.message:'This is not a valid Spatial Sketch session.');}finally{setImportBusy(false);}
  }
  async function exportGLB() {
    if (!project.objects.length && !project.references.length) { setNotice('Import or create geometry before exporting a model. Use Download session to keep ink.'); return; }
    if (preview) { setNotice('Apply or dismiss the preview before exporting the model.'); return; }
    try { const data = await modelView.current?.exportGLB(); if (!data) throw new Error(); download(data, project.name.replace(/[^a-z0-9_-]/gi, '-') + '.glb', 'model/gltf-binary'); setNotice('GLB exported. Download the project too if you want to keep editable parameters.'); }
    catch { setNotice('The model could not be exported. Try a smaller study.'); }
    setMenu(false);
  }
  async function askAI() {
    if (!connection.key) { setConnectionOpen(true); return; }
    if (!instruction.trim() || busy || speechBusy) return;
    const sourceRevision = revision.current; const source = project;
    setBusy(true); setProposal(null); setNotice('Interpreting your instruction…');
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'interpret', connection, project: source, instruction, selectedId, strokeId: activeStroke, activeGroupId:group.id, selectedStrokeIds, activeFrame: view === 'sketch' ? baseFrame(plane, offset) : activeFrame }), signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The AI request failed.');
      if (controller.signal.aborted) return;
      if (sourceRevision !== revision.current) { setNotice('Your study changed while AI was working. Ask again to use the current version.'); return; }
      const intent = intentSchema.parse(data.intent);
      if (!intent.actions.length) { setNotice(intent.summary); return; }
      setProposal({ intent, project: applyIntent(source, intent, view === 'sketch' ? baseFrame(plane, offset) : activeFrame), revision: sourceRevision }); setNotice('AI proposal ready. Review the preview before applying it.');
    } catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : 'AI interpretation failed.'); }
    finally { if (request.current === controller) setBusy(false); }
  }
  function applyProposal() {
    if (!proposal) return;
    if (proposal.revision !== revision.current) { setProposal(null); setNotice('The study changed. Please request a new proposal.'); return; }
    commit(proposal.project); setInspector('edit'); setSelectedId(proposal.project.objects.at(-1)?.id || null); setNotice(proposal.intent.summary); setInstruction('');
  }
  function clearInk() { if(group.locked)return;commit({ ...project, strokes: project.strokes.filter(s => s.plane !== plane || strokeGroup(project,s)!==group.id) }); setActiveStroke(null); setNotice('Ink cleared on this plane. Existing forms are preserved.'); }
  function refine(mode: 'straighten' | 'orthogonal') {
    const target = inspector !== 'edit' && stroke ? 'stroke' : selected ? 'object' : stroke ? 'stroke' : null;
    const id = target === 'stroke' ? stroke?.id : selected?.id;
    if (!id || !target) return;
    if(target==='stroke' && project.groups.find(g=>g.id===strokeGroup(project,stroke!))?.locked){setNotice('Unlock this sketch before changing its ink.');return;}
    try { commit(applyIntent(project, { summary: 'Outline refined.', actions: [{ type: 'refine', target, id, mode }] })); setNotice(mode === 'orthogonal' ? 'Corners squared; the outline and its notches are preserved. Undo to compare.' : 'Noisy ink simplified into straight edges. Undo to compare.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'This outline could not be refined.'); }
  }
  function duplicateSelected() {
    if (!selected) return;
    const b = bounds(selected.profile);
    try { const next = applyIntent(project, { summary: 'Duplicate', actions: [{ type: 'duplicate', objectId: selected.id, count: 1, axis: 'u', spacing: Math.min(200, b.maxX-b.minX+1) }] }); commit(next); setSelectedId(next.objects.at(-1)!.id); setNotice('Copy created alongside the original. Edit its position in Properties.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not duplicate this object.'); }
  }
  function openSketch(id:string) {setActiveGroup(id);setSelectedStrokes(project.strokes.filter(s=>strokeGroup(project,s)===id).map(s=>s.id));setActiveStroke(null);setInspector('sketches');setSpatialMode('draw');setProposal(null);}
  function updateGroup(id:string,changes:Partial<SketchGroup>) {commit({...project,groups:project.groups.map(g=>g.id===id?{...g,...changes}:g)});}
  function finishNext() {try{const next=nextSketch(project,group.id);commit(next.project);setActiveGroup(next.group.id);setSelectedStrokes([]);setActiveStroke(null);setInspector('sketches');setSpatialMode('draw');setNotice(group.name+' kept in this session. Continue with '+next.group.name+'.');}catch(e){setNotice(e instanceof Error?e.message:'Could not add a sketch.');}}
  function removeSketch(id:string) {if(project.groups.find(g=>g.id===id)?.locked)return;const next=deleteSketch(project,id);commit(next);setActiveGroup(next.groups[0].id);setSelectedStrokes([]);setActiveStroke(null);setNotice('Sketch deleted. Undo restores its ink.');}
  function selectInk(ids:string[]) {setSelectedStrokes(ids);setActiveStroke(ids[0]||null);const first=project.strokes.find(s=>s.id===ids[0]);if(first)setActiveGroup(strokeGroup(project,first));setInspector('sketches');setProposal(null);}
  function deleteInk() {if(!selectedStrokeIds.length)return;if(project.strokes.some(s=>selectedStrokeIds.includes(s.id)&&project.groups.find(g=>g.id===strokeGroup(project,s))?.locked)){setNotice('Unlock the sketch before deleting its ink.');return;}commit({...project,strokes:project.strokes.filter(s=>!selectedStrokeIds.includes(s.id))});setSelectedStrokes([]);setActiveStroke(null);setNotice('Selected ink deleted. Undo restores it.');}
  function moveInk(id:string) {const target=project.groups.find(g=>g.id===id);if(!target||target.locked||project.strokes.some(s=>selectedStrokeIds.includes(s.id)&&project.groups.find(g=>g.id===strokeGroup(project,s))?.locked))return;commit({...project,strokes:project.strokes.map(s=>selectedStrokeIds.includes(s.id)?{...s,groupId:id}:s)});setActiveGroup(id);setNotice('Selected ink moved to '+target.name+'.');}
  function changePlane(workplane:Workplane) {try{commit({...project,workplane});setShowPlane(true);setNotice('Drawing plane updated. Existing sketches stay fixed.');}catch{setSpatialMode('navigate');setNotice('Use a valid plane position and size.');}}
  function startTransform(target:TransformTarget,mode:GizmoMode) {if(target==='sketch'&&(!selectedStrokeIds.length||group.locked||!group.visible))return;setTransformTarget(target);setGizmoMode(mode);setSpatialMode('transform');if(target==='plane')setShowPlane(true);setNotice('Drag the '+mode+' handles. Each completed drag is one undoable change.');}
  function applyInkTransform(matrix:THREE.Matrix4) {try{commit(transformSelection(project,selectedStrokeIds,matrix));setNotice('Sketch transformed. Undo restores its previous position.');}catch(e){setSpatialMode('navigate');setNotice(e instanceof Error&&!('issues'in e)?e.message:'That transform exceeds the supported sketch size.');}}
  function applyGizmo(delta:THREE.Matrix4) {
    if(delta.elements.every((v,i)=>Math.abs(v-new THREE.Matrix4().elements[i])<1e-8))return;
    if(transformTarget==='sketch'){applyInkTransform(delta);return;}
    if(transformTarget==='plane') {const m=delta.clone().multiply(frameMatrix(activeFrame));changePlane({...project.workplane,frame:matrixFrame(m,'Transformed plane'),width:project.workplane.width*new THREE.Vector3().setFromMatrixColumn(m,0).length(),height:project.workplane.height*new THREE.Vector3().setFromMatrixColumn(m,1).length()});return;}
    const reference=project.references.find(r=>r.id===selectedReference);if(!reference)return;
    const matrix=delta.clone().multiply(transformMatrix(reference.transform)),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(position,rotation,scale);const angles=new THREE.Euler().setFromQuaternion(rotation,'XYZ');
    changeReference({transform:{position:position.toArray(),rotation:[angles.x,angles.y,angles.z].map(v=>v*180/Math.PI) as [number,number,number],scale:scale.toArray()}});
  }
  function selectReference(id:string) {setSelectedReference(id);setSelectedStrokes([]);setActiveStroke(null);setInspector('references');setProposal(null);}
  function changeReference(changes:Partial<ReferenceModel>) {try{commit({...project,references:project.references.map(r=>r.id===selectedReference?{...r,...changes}:r)});setNotice('Reference model updated.');}catch{setSpatialMode('navigate');setNotice('Use positive scale and supported model dimensions.');}}
  function removeReference() {commit({...project,references:project.references.filter(r=>r.id!==selectedReference)});setSelectedReference(null);setSpatialMode('navigate');setNotice('Reference removed. Sketches remain in place; Undo restores the model.');}
  async function importGeometry(e:React.ChangeEvent<HTMLInputElement>) {
    const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length||importBusy)return;const generation=importGeneration.current;setImportBusy(true);setNotice('Reading your model and its companion files…');
    try {
      if(projectRef.current.references.length>=12)throw new Error('This session already has 12 imported models.');
      const sources=await readSourceFiles(files),retained=[...assets.current.values()].reduce((n,a)=>n+a.files.reduce((m,f)=>m+f.bytes.byteLength,0),0);
      if(retained+sources.reduce((n,f)=>n+f.bytes.byteLength,0)>MAX_IMPORT_BYTES*2)throw new Error('This session has reached 300 MB of source models. Download it and continue in a new tab to release undo history.');
      const asset=await loadGeometry(sources);
      if(generation!==importGeneration.current){disposeAssetRoot(asset.root);throw new Error('Import canceled because a new session was started.');}
      assets.current.set(asset.id,asset);const reference=referenceForAsset(asset);commit({...projectRef.current,references:[...projectRef.current.references,reference]});setSelectedReference(reference.id);setSelectedStrokes([]);setInspector('references');setSpatialMode('navigate');setView('model');setSidebar(true);setNotice(reference.name+' imported. Check Source units, then use Pick face to sketch on it.');requestAnimationFrame(()=>modelView.current?.fit());
    }catch(e){setNotice(e instanceof Error?e.message:'Could not read this model.');}finally{setImportBusy(false);}
  }
  const activeMetric = selected ? (selected.kind === 'wall' ? selected.profile.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - selected.profile[i].x, p.y - selected.profile[i].y) * selected.thickness, 0) : polygonArea(selected.profile)) : 0;

  return <main className="studio">
    <header className="app-header">
      <a className="brand" href="/" aria-label="Spatial Sketch home"><span className="brand-mark"><Box size={25} strokeWidth={1.45} /></span><span>spatial<span className="brand-light">sketch</span><small>IDEAS, IN DIMENSION.</small></span></a>
      <div className="document-title"><span className="header-divider" /><input aria-label="Project name" value={project.name} maxLength={80} onChange={e => { if (e.target.value.trim()) commit({ ...project, name: e.target.value }); }} /><ChevronDown size={13} className="muted" /></div>
      <div className="header-actions"><button className="secondary-button import-trigger" disabled={importBusy} onClick={()=>{setInspector('references');setSidebar(true);geometryFile.current?.click();}}><FolderOpen size={15}/><span>Import geometry</span></button><span className="session-badge"><span />Session only</span><button className={'connection-button ' + (connection.key ? 'configured' : '')} onClick={() => setConnectionOpen(true)}><KeyRound size={15} /><span>{verified ? 'AI connected' : connection.key ? 'API configured' : 'Connect API'}</span></button>
        <div className="file-menu"><button className="secondary-button export-trigger" onClick={() => setMenu(!menu)} aria-expanded={menu}><Download size={15} /><span>Project</span><ChevronDown size={13} /></button>{menu && <div className="menu-popover"><button onClick={startNew}><FilePlus2 size={16} />New session</button><button onClick={() => { file.current?.click(); setMenu(false); }}><FolderOpen size={16} />Open session</button><button onClick={exportProject}><Download size={16} />Download session</button><button onClick={exportGLB}><Box size={16} />Export model · GLB</button><button onClick={()=>{setSpeechSession(n=>n+1);commit(sampleProject());setInspector('edit');setSelectedId('sample-mass');setMenu(false);requestAnimationFrame(()=>modelView.current?.fit());}}>Load example forms</button></div>}</div>
      </div>
    </header>
    <input type="file" ref={file} accept=".json,.zip" hidden onChange={importProject} data-testid="session-file" /><input type="file" ref={geometryFile} multiple hidden onChange={importGeometry} data-testid="geometry-file" accept=".glb,.gltf,.obj,.fbx,.bin,.mtl,.png,.jpg,.jpeg,.webp,.ktx2,.tga,.bmp" /><input type="file" ref={geometryFolder} multiple hidden onChange={importGeometry} data-testid="geometry-folder" {...{webkitdirectory:''}} />
    <div className="workspace-toolbar"><div className="tool-group"><span className="toolbar-label">DRAW</span>{([{ id: 'pen', label: 'Freehand', icon: PenLine }, { id: 'rectangle', label: 'Rectangle', icon: Square }, { id: 'line', label: 'Line', icon: MoveUpRight }] as const).map(t => <button key={t.id} className={'tool-button ' + (tool === t.id ? 'active' : '')} title={t.label} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => { setTool(t.id); setSpatialMode('draw'); }}><t.icon size={17} /><span>{t.label}</span></button>)}<span className="toolbar-divider" /><button className={'icon-button ' + (snap ? 'active' : '')} title="Snap to quarter-meter grid" aria-label="Snap to grid" aria-pressed={snap} onClick={() => setSnap(!snap)}><Grid2X2 size={16} /></button><button className={'icon-button ' + (touchDraw ? 'active' : '')} title={touchDraw ? 'Finger drawing enabled' : 'Fingers navigate; Pencil draws'} aria-label="Finger drawing" aria-pressed={touchDraw} onClick={() => setTouchDraw(!touchDraw)}><Hand size={16} /></button></div>
      <div className="toolbar-right"><div className="history-buttons"><button className="icon-button" title="Undo · Ctrl Z" aria-label="Undo" disabled={!history.past.length} onClick={undo}><Undo2 size={17} /></button><button className="icon-button" title="Redo · Ctrl Shift Z" aria-label="Redo" disabled={!history.future.length} onClick={redo}><Redo2 size={17} /></button></div><span className="toolbar-divider" /><div className="view-switch">{([{ id: 'sketch', label: '2D pad', icon: PenLine }, { id: 'split', label: 'Split', icon: Columns2 }, { id: 'model', label: '3D', icon: Box }] as const).map(v => <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)} aria-pressed={view === v.id}><v.icon size={14} /><span>{v.label}</span></button>)}</div><button className="icon-button inspector-toggle" aria-label="Toggle properties" onClick={() => setSidebar(!sidebar)}><SlidersHorizontal size={17} /></button></div>
    </div>
    <div className={'workspace ' + (!sidebar ? 'sidebar-hidden' : '')}>
      <section className="design-area">
        <div className={'canvas-panes view-' + view}>
          <section className="canvas-panel sketch-panel"><div className="panel-heading"><div><span className="panel-number">01</span><h2>Sketch</h2></div><select aria-label="Sketch plane" value={plane} onChange={e => { setPlane(e.target.value as Plane); setActiveStroke(null); }}><option value="ground">Ground plane</option><option value="front">Front plane</option><option value="side">Side plane</option></select></div>
            <div className="sketch-context"><span><span className="status-dot" />{touchDraw ? 'Pencil + touch ink' : 'Pencil or mouse to draw'}</span><button onClick={clearInk} disabled={!project.strokes.some(s => s.plane === plane)} title="Clear ink on this plane"><Trash2 size={13} />Clear ink</button></div>
            <SketchCanvas key={plane} plane={plane} offset={offset} tool={tool} snap={snap} touchDraw={touchDraw} strokes={displayStrokes} objects={proposal?.project.objects || project.objects} activeStroke={activeStroke} onStroke={addStroke} onMessage={setNotice} />
            <div className="sketch-footer"><span>{project.strokes.filter(s => s.plane === plane).length} strokes</span><label>Plane offset <input type="number" aria-label="Sketch plane offset" min={-200} max={200} step={0.1} value={offset} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= -200 && n <= 200) setOffset(n); }} /> m</label></div>
          </section>
          <section className="canvas-panel model-panel"><div className="panel-heading"><div><span className="panel-number">02</span><h2>Spatial canvas</h2>{preview && <span className="preview-tag">Preview</span>}</div><button className="icon-button" title="Fit model to view" aria-label="Fit model" onClick={() => modelView.current?.fit()}><Expand size={16} /></button></div>
            <SpatialToolbar mode={spatialMode} onMode={setSpatialMode} plane={project.workplane} onChange={changePlane} onGizmo={mode=>startTransform('plane',mode)} onViewPlane={()=>modelView.current?.viewPlane()} onGround={()=>chooseFrame(baseFrame())} onAlign={()=>modelView.current?.alignPlane()} showPlane={showPlane} onShowPlane={setShowPlane} />
            <div className="model-surface"><ModelView previewMode={previewMode} ref={modelView} objects={displayObjects} committedIds={committedIds} strokes={displayStrokes} selectedId={newForm.object?.id || selectedId} onSelect={id => { if (project.objects.some(o => o.id === id)) select(id); }} activeFrame={activeFrame} mode={spatialMode} tool={tool} snap={snap} touchDraw={touchDraw} showPlane={showPlane} onFrame={chooseFrame} onStroke={addStroke} onMessage={setNotice} references={project.references} assets={assets.current} selectedReferenceId={selectedReference} selectedStrokeIds={selectedStrokeIds} onSelectStroke={(id,additive)=>selectInk(additive?[...new Set([...selectedStrokeIds,id])]:[id])} onSelectReference={selectReference} transformTarget={transformTarget} gizmoMode={gizmoMode} onTransform={applyGizmo} planeWidth={project.workplane.width} planeHeight={project.workplane.height} canDraw={group.visible&&!group.locked} /><div className="model-context"><span className="model-context-dot" />{preview ? 'Review your next dimension' : 'Draw • orbit • build'}<span>METERS</span></div>{!displayObjects.length && !project.references.length && !project.strokes.length && <div className="model-empty"><Box size={42} strokeWidth={1} /><h3>Sketch in space.</h3><p>Develop an idea across multiple planes.<br />Import your interior to sketch in context.</p></div>}<div className="preview-mode-switch" role="group" aria-label="Viewport shading">{(["shaded","materials"] as const).map(mode=><button key={mode} aria-pressed={previewMode===mode} title={mode==="shaded"?"Lightweight surfaces without textures or shadows":"Original materials, textures and shadows"} onClick={()=>setPreviewMode(mode)}>{mode==="shaded"?"Shaded":"Materials"}</button>)}</div><div className="model-view-controls"><button onClick={() => modelView.current?.view('iso')}>ISO</button><button onClick={() => modelView.current?.view('top')}>TOP</button><button aria-label="Reset camera" onClick={() => modelView.current?.fit()}><Maximize2 size={14} /></button></div><div className="compass"><span>N</span><MoveUpRight size={25} strokeWidth={1.2} /></div></div>
            <div className="model-footer"><MousePointer2 size={12} /><span>{spatialMode === 'draw' ? (touchDraw ? 'Finger + Pencil ink · Orbit mode to navigate' : 'Pencil / mouse draws · fingers orbit · Alt-drag to orbit') : 'Drag to orbit · scroll or pinch to zoom'}</span><span>{project.strokes.length} strokes · {project.groups.length} sketches · {project.references.length} imports</span></div>
          </section>
        </div>
        <div className="assistant-area">{proposal && <div className="proposal-card"><div><Sparkles size={17} /><p>{proposal.intent.summary}</p></div><div className="proposal-actions"><button className="text-button" onClick={() => { setProposal(null); setNotice('AI proposal dismissed.'); }}>Dismiss</button><button className="primary-button" onClick={applyProposal}><Check size={15} />Apply {proposal.intent.actions.length === 1 ? 'change' : 'changes'}</button></div></div>}
          <form className="prompt-form" onSubmit={e => { e.preventDefault(); askAI(); }}><span className="prompt-icon"><Sparkles size={20} strokeWidth={1.5} /></span><div className="prompt-input"><label htmlFor="ai-instruction">A little direction goes a long way.</label><input id="ai-instruction" value={instruction} maxLength={3000} onChange={e => setInstruction(e.target.value)} placeholder="Describe the idea in your sketches, or ask for a change…" /></div>{busy ? <button type="button" className="ask-button" onClick={() => { request.current?.abort(); setBusy(false); setNotice('AI request cancelled.'); }}><LoaderCircle className="spin" size={16} />Cancel</button> : <button className="ask-button" type="submit" disabled={speechBusy || (!!connection.key && !instruction.trim())}>{connection.key ? 'Ask AI' : 'Connect AI'}<ArrowRight size={16} /></button>}</form><SpeechInput disabled={busy} sessionId={String(speechSession)} onBusy={setSpeechBusy} onText={text=>{const combined=[instruction.trim(),text].filter(Boolean).join(' ');if(combined.length>3000){setNotice('The combined prompt exceeds 3,000 characters. Shorten the transcript or prompt.');return false;}setInstruction(combined);return true;}}/><div className="ai-caption"><span>AI suggests. You decide.</span><span>{connection.key ? (verified ? 'Connection tested' : 'Connection configured') : 'Create forms without AI, or bring your own API key.'}</span></div>
        </div>
      </section>
      <aside className="inspector"><div className="inspector-heading"><span className="eyebrow">THE DETAILS</span><button className="icon-button" aria-label="Hide properties" onClick={() => setSidebar(false)}><PanelRightClose size={16} /></button></div><h2>Your sketch session.</h2><div className="inspector-tabs session-tabs"><button className={inspector==='sketches'?'active':''} onClick={()=>setInspector('sketches')}>Sketches</button><button className={inspector==='references'?'active':''} onClick={()=>setInspector('references')}>Imports</button></div><details className="manual-tools"><summary>Model tools</summary><div className="inspector-tabs"><button className={inspector === 'create' ? 'active' : ''} onClick={() => { setInspector('create'); setProposal(null); }}><Plus size={14} />New form</button><button className={inspector === 'edit' ? 'active' : ''} onClick={() => { setInspector('edit'); setProposal(null); }}><Settings2 size={14} />Properties</button></div></details>
        {inspector==='sketches'?<SketchSessionPanel project={project} activeGroupId={group.id} selectedIds={selectedStrokeIds} onGroup={openSketch} onUpdateGroup={updateGroup} onNext={finishNext} onDeleteGroup={removeSketch} onSelect={selectInk} onDelete={deleteInk} onTransform={t=>applyInkTransform(centeredTransform(t,strokeBounds(project.strokes.filter(s=>selectedStrokeIds.includes(s.id))).getCenter(new THREE.Vector3())))} onGizmo={mode=>startTransform('sketch',mode)} onMoveTo={moveInk} onUpdateStroke={(id,changes)=>commit({...project,strokes:project.strokes.map(s=>s.id===id?{...s,...changes}:s)})} onContinuePlane={()=>{if(stroke)chooseFrame(matrixFrame(planeMatrix(stroke.plane,stroke.offset,stroke.frame),stroke.frame?.label));}}/>:inspector==='references'?<ReferencePanel references={project.references} assets={assets.current} selectedId={selectedReference} onSelect={selectReference} onChange={changeReference} onDelete={removeReference} onImport={()=>geometryFile.current?.click()} onFolder={()=>geometryFolder.current?.click()} busy={importBusy} onGizmo={mode=>startTransform('reference',mode)} onFit={()=>modelView.current?.fit()}/>:inspector === 'create' ? <div className="properties-content"><label className="field-label" htmlFor="form-kind">MAKE IT A</label><select id="form-kind" value={kind} onChange={e => { const next = e.target.value as Kind; setKind(next); setHeight(next === 'slab' ? 0.25 : next === 'table' ? 0.75 : next === 'chair' ? 0.9 : next === 'gable' ? 2 : 3.6); }}>{Object.entries(kindNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label className="field-label" htmlFor="source-stroke">FROM SKETCH</label><select id="source-stroke" value={activeStroke || ''} onChange={e => setActiveStroke(e.target.value || null)}><option value="">Choose a stroke</option>{project.strokes.map((s, i) => <option key={s.id} value={s.id}>Stroke {i + 1} · {s.frame?.label || s.plane}</option>)}</select><div className="number-grid"><NumberField label="Height" value={height} min={0.05} max={200} onChange={setHeight} />{['wall', 'table', 'chair', 'pavilion'].includes(kind) ? <NumberField label="Thickness" value={thickness} min={0.05} max={10} onChange={setThickness} /> : kind === 'mass' ? <NumberField label="Floors" value={floors} min={1} max={60} step={1} unit="" onChange={setFloors} /> : null}</div>{newForm.error ? <p className="form-hint error">{newForm.error}</p> : <p className="form-hint">{stroke ? 'Your form is previewed in 3D. Adjust it, then add it to the study.' : 'Draw an outline or select a stroke to preview a form.'}</p>}<button className="primary-button create-button" onClick={createForm} disabled={!newForm.object}><Box size={17} />Create form<ArrowRight size={16} /></button><span className="no-key-note">Height extends out from the sketch plane.</span>{stroke && <button className="text-button" onClick={() => { chooseFrame(stroke.frame || baseFrame(stroke.plane, stroke.offset)); setView('model'); }}>Continue on this sketch plane <MoveUpRight size={13} /></button>}</div> : selected ? <div className="properties-content"><div className="selected-object-heading"><span className="object-icon" style={{ background: selected.color }}><Box size={21} strokeWidth={1.3} /></span><div><input aria-label="Object name" value={selected.name} maxLength={80} onChange={e => { if (e.target.value.trim()) changeObject({ name: e.target.value }); }} /><span>{kindNames[selected.kind]} · {selected.frame?.label || selected.plane}</span></div></div><div className="number-grid"><NumberField label="Height" value={selected.height} min={0.001} max={200} onChange={v => changeObject({ height: v })} />{['wall', 'table', 'chair', 'pavilion'].includes(selected.kind) ? <NumberField label="Thickness" value={selected.thickness} min={0.001} max={10} onChange={v => changeObject({ thickness: v })} /> : <NumberField label="Plane offset" value={selected.offset} min={-200} max={200} onChange={v => changeObject({ offset: v })} />}{['wall', 'table', 'chair', 'pavilion'].includes(selected.kind) && <NumberField label="Plane offset" value={selected.offset} min={-200} max={200} onChange={v => changeObject({ offset: v })} />}{selected.kind === 'mass' && <NumberField label="Floors" value={selected.floors} min={1} max={60} step={1} unit="" onChange={v => changeObject({ floors: v })} />}</div>{selected.kind === 'mass' && <p className="form-hint">{(selected.height / selected.floors).toFixed(2)} m per floor · conceptual divisions</p>}<ProfileControls object={selected} onChange={changeObject} /><div className="profile-metrics"><span>Profile area<strong>{activeMetric < .1 ? activeMetric.toPrecision(3) : activeMetric.toFixed(1)} <small>m²</small></strong></span><span>Outline points<strong>{selected.profile.length}</strong></span></div><span className="field-label">MATERIAL TONE</span><div className="color-swatches">{palette.map(color => <button key={color} style={{ background: color }} className={selected.color === color ? 'chosen' : ''} aria-label={'Set material ' + color} aria-pressed={selected.color === color} onClick={() => changeObject({ color })}>{selected.color === color && <Check size={15} />}</button>)}</div><button className="text-button" onClick={duplicateSelected}><Plus size={14} />Duplicate alongside</button><button className="text-button remove-object" onClick={removeSelected}><Trash2 size={14} />Remove object</button></div> : <div className="empty-properties"><MousePointer2 size={24} strokeWidth={1.3} /><p>Select a form in the model<br />to explore its dimensions.</p></div>}
        {inspector!=='references' && <div className="refine-section"><span className="field-label">REFINE {inspector === 'create' && stroke ? 'ACTIVE SKETCH' : selected ? 'SELECTED FORM' : 'SKETCH'}</span><div className="refine-buttons"><button disabled={!stroke && !selected} onClick={() => refine('straighten')}><PenLine size={14} />Straighten</button><button disabled={!stroke && !selected} onClick={() => refine('orthogonal')}><Grid2X2 size={14} />Square corners</button></div></div>}
        <div className="objects-section"><div className="section-label"><span>IN YOUR STUDY</span><span>{project.objects.length.toString().padStart(2, '0')}</span></div><div className="object-list">{project.objects.map(o => <button key={o.id} className={'object-row ' + (selectedId === o.id && inspector === 'edit' ? 'selected' : '')} onClick={() => select(o.id)}><span className="object-swatch" style={{ background: o.color }}><Box size={14} strokeWidth={1.4} /></span><span>{o.name}<small>{kindNames[o.kind]}</small></span>{selectedId === o.id && inspector === 'edit' && <span className="selected-dot" />}</button>)}{!project.objects.length && <p className="empty-list">A blank page, full of possibility.</p>}</div></div>
        <div className="studio-note"><span className="note-decoration">✳</span><p>Keep it loose.<br /><strong>See where it takes you.</strong></p><button onClick={startNew}>New empty session <MoveUpRight size={13} /></button></div>
      </aside>
    </div>
    <footer className="status-bar"><div className="status-message" role="status" aria-live="polite"><span className="status-dot" />{notice}</div><div className="status-right"><span>{view === 'sketch' ? planeNames[plane] : activeFrame.label}</span><span>POC / 0.3.3</span><button aria-label="How to use Spatial Sketch" onClick={() => setHelp(!help)}><CircleHelp size={15} /></button></div></footer>
    {help && <div className="help-card"><button className="icon-button" aria-label="Close help" onClick={() => setHelp(false)}><X size={16} /></button><h3>Your first little dimension.</h3><ol><li>Draw directly on the 3D grid with Pencil or mouse. Fingers orbit; two fingers pan and zoom.</li><li>Pick face places a plane on a model face. View plane places one facing the camera through the orbit center. Plane settings adjust its angle and depth.</li><li>Organize strokes in named sketches. Finish & next retains the current sketch. Move, rotate, scale, hide, lock or delete selected ink.</li><li>Import your interior model from Imports. Download session includes every sketch and the original geometry files.</li><li>Select a form to change its dimensions. Undo works with Ctrl/⌘ Z.</li><li>Connect an API for text instructions. Review the preview, then apply.</li><li>Download your project before leaving. Refreshing clears the study and key.</li></ol><p>Ink stays fixed in space when you orbit. One stroke has one drawing plane; change planes between strokes to build in 3D. On curved forms, Pick face uses the flat tangent at the tap. Face planes stay fixed when the original object changes.</p></div>}
    {connectionOpen && <ConnectionPanel value={connection} verified={verified} onClose={() => setConnectionOpen(false)} onUse={(c, tested) => { request.current?.abort(); setBusy(false); setConnection(c); setVerified(tested); setConnectionOpen(false); setNotice('API configured for this session. Refreshing clears the key.'); }} onDisconnect={() => { request.current?.abort(); setBusy(false); setConnection({ endpoint: '', model: '', key: '' }); setVerified(false); setConnectionOpen(false); setNotice('API disconnected. The key has been cleared from the app.'); }} />}
  </main>;
}
