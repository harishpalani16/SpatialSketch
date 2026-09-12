'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, Box, Check, ChevronDown, CircleHelp, Columns2, Download, Expand, FilePlus2, FolderOpen, Grid2X2, Hand, KeyRound, LoaderCircle, Maximize2, MousePointer2, MoveUpRight, PanelRightClose, PenLine, Plus, Redo2, Settings2, SlidersHorizontal, Sparkles, Square, Trash2, Undo2, X } from 'lucide-react';
import ModelView, { type ModelViewHandle, type SpatialMode } from './model-view';
import SpatialToolbar, { type PlaneAdjustment } from './spatial-toolbar';
import SketchCanvas, { type SketchTool } from './sketch-canvas';
import ConnectionPanel from './connection-panel';
import NumberField from './number-field';
import ProfileControls from './profile-controls';
import { bounds, createObject, emptyProject, kindNames, objectSchema, palette, parseProject, planeNames, polygonArea, sampleProject, type Kind, type ModelObject, type Plane, type Project, type SketchFrame, type Stroke } from '@/lib/model';
import { adjustFrame, baseFrame } from '@/lib/spatial';
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
  const [history, dispatch] = useReducer(reducer, undefined, () => ({ past: [], present: sampleProject(), future: [] }));
  const project = history.present;
  const projectRef = useRef(project); projectRef.current = project;
  const revision = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>('sample-mass');
  const [activeStroke, setActiveStroke] = useState<string | null>(null);
  const [plane, setPlane] = useState<Plane>('ground');
  const [offset, setOffset] = useState(0);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [snap, setSnap] = useState(false);
  const [touchDraw, setTouchDraw] = useState(false);
  const [view, setView] = useState<'split' | 'sketch' | 'model'>('model');
  const [spatialMode, setSpatialMode] = useState<SpatialMode>('draw');
  const [planeAnchor, setPlaneAnchor] = useState<SketchFrame>(() => baseFrame());
  const [planeAdjustment, setPlaneAdjustment] = useState<PlaneAdjustment>({ tilt: 0, turn: 0, shift: 0 });
  const [showPlane, setShowPlane] = useState(true);
  const activeFrame = useMemo(() => planeAdjustment.tilt || planeAdjustment.turn || planeAdjustment.shift ? adjustFrame(planeAnchor, planeAdjustment.tilt, planeAdjustment.turn, planeAdjustment.shift) : planeAnchor, [planeAnchor, planeAdjustment]);
  const [inspector, setInspector] = useState<'create' | 'edit'>('edit');
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
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ intent: Intent; project: Project; revision: number } | null>(null);
  const [notice, setNotice] = useState('Draw directly in 3D. Pick a face or choose View plane to sketch at any angle.');
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
  const displayStrokes = proposal ? proposal.project.strokes : project.strokes;
  const committedIds = useMemo(() => project.objects.map(o => o.id), [project.objects]);
  const preview = !!proposal || !!newForm.object;
  function commit(next: Project) { revision.current++; dispatch({ type: 'commit', project: next }); setProposal(null); }
  function undo() { revision.current++; dispatch({ type: 'undo' }); setProposal(null); setNotice('Undone.'); }
  function redo() { revision.current++; dispatch({ type: 'redo' }); setProposal(null); setNotice('Redone.'); }
  const actions = useRef({ undo, redo, project, selectedId }); actions.current = { undo, redo, project, selectedId };
  useEffect(() => {
    if (window.innerWidth <= 900) setSidebar(false);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) actions.current.redo(); else actions.current.undo(); }
    };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); request.current?.abort(); };
  }, []);
  function select(id: string) { setSelectedId(id); setInspector('edit'); setProposal(null); }
  function chooseFrame(frame: SketchFrame) { revision.current++; setProposal(null); setPlaneAnchor(frame); setPlaneAdjustment({ tilt: 0, turn: 0, shift: 0 }); setSpatialMode('draw'); setShowPlane(true); setNotice((frame.label || 'Spatial plane') + ' placed. Draw here, then orbit to see the stroke in space.'); }
  function startNew() { commit(emptyProject()); setSelectedId(null); setActiveStroke(null); setInspector('create'); setMenu(false); chooseFrame(baseFrame()); requestAnimationFrame(() => modelView.current?.view('iso')); setNotice('A fresh 3D canvas. Draw a closed outline, or ask AI to build an object.'); }
  function addStroke(s: Stroke) {
    if (projectRef.current.strokes.length >= 100) { setNotice('This study has 100 strokes. Clear unused ink before drawing more.'); return; }
    try { commit(parseProject({ ...projectRef.current, strokes: [...projectRef.current.strokes, s] })); setActiveStroke(s.id); setInspector('create'); setNotice('Sketch captured. Choose a form and adjust its dimensions.'); }
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
  function exportProject() { download(JSON.stringify(parseProject(project), null, 2), project.name.replace(/[^a-z0-9_-]/gi, '-') + '.spatial.json', 'application/json'); setMenu(false); setNotice('Project downloaded. API settings are excluded.'); }
  async function importProject(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]; e.target.value = ''; if (!selectedFile) return;
    try {
      if (selectedFile.size > 2 * 1024 * 1024) throw new Error('Use a project file smaller than 2 MB.');
      const next = parseProject(JSON.parse(await selectedFile.text())); commit(next); setSelectedId(next.objects[0]?.id || null); setActiveStroke(next.strokes.at(-1)?.id || null); setInspector(next.objects.length ? 'edit' : 'create'); setNotice('Project opened. API settings stay separate.');
      requestAnimationFrame(() => modelView.current?.fit());
    } catch (error) { setNotice(error instanceof Error && !('issues' in error) ? error.message : 'This is not a valid Spatial Sketch project.'); }
  }
  async function exportGLB() {
    if (!project.objects.length) { setNotice('Create a form before exporting a model.'); return; }
    if (preview) { setNotice('Apply or dismiss the preview before exporting the model.'); return; }
    try { const data = await modelView.current?.exportGLB(); if (!data) throw new Error(); download(data, project.name.replace(/[^a-z0-9_-]/gi, '-') + '.glb', 'model/gltf-binary'); setNotice('GLB exported. Download the project too if you want to keep editable parameters.'); }
    catch { setNotice('The model could not be exported. Try a smaller study.'); }
    setMenu(false);
  }
  async function askAI() {
    if (!connection.key) { setConnectionOpen(true); return; }
    if (!instruction.trim() || busy) return;
    const sourceRevision = revision.current; const source = project;
    setBusy(true); setProposal(null); setNotice('Interpreting your instruction…');
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'interpret', connection, project: source, instruction, selectedId, strokeId: activeStroke, activeFrame: view === 'sketch' ? baseFrame(plane, offset) : activeFrame }), signal: controller.signal });
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
  function clearInk() { commit({ ...project, strokes: project.strokes.filter(s => s.plane !== plane) }); setActiveStroke(null); setNotice('Ink cleared on this plane. Existing forms are preserved.'); }
  function refine(mode: 'straighten' | 'orthogonal') {
    const target = inspector === 'create' && stroke ? 'stroke' : selected ? 'object' : stroke ? 'stroke' : null;
    const id = target === 'stroke' ? stroke?.id : selected?.id;
    if (!id || !target) return;
    try { commit(applyIntent(project, { summary: 'Outline refined.', actions: [{ type: 'refine', target, id, mode }] })); setNotice(mode === 'orthogonal' ? 'Corners squared; the outline and its notches are preserved. Undo to compare.' : 'Noisy ink simplified into straight edges. Undo to compare.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'This outline could not be refined.'); }
  }
  function duplicateSelected() {
    if (!selected) return;
    const b = bounds(selected.profile);
    try { const next = applyIntent(project, { summary: 'Duplicate', actions: [{ type: 'duplicate', objectId: selected.id, count: 1, axis: 'u', spacing: Math.min(200, b.maxX-b.minX+1) }] }); commit(next); setSelectedId(next.objects.at(-1)!.id); setNotice('Copy created alongside the original. Edit its position in Properties.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not duplicate this object.'); }
  }
  const activeMetric = selected ? (selected.kind === 'wall' ? selected.profile.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - selected.profile[i].x, p.y - selected.profile[i].y) * selected.thickness, 0) : polygonArea(selected.profile)) : 0;

  return <main className="studio">
    <header className="app-header">
      <a className="brand" href="/" aria-label="Spatial Sketch home"><span className="brand-mark"><Box size={25} strokeWidth={1.45} /></span><span>spatial<span className="brand-light">sketch</span><small>IDEAS, IN DIMENSION.</small></span></a>
      <div className="document-title"><span className="header-divider" /><input aria-label="Project name" value={project.name} maxLength={80} onChange={e => { if (e.target.value.trim()) commit({ ...project, name: e.target.value }); }} /><ChevronDown size={13} className="muted" /></div>
      <div className="header-actions"><span className="session-badge"><span />Session only</span><button className={'connection-button ' + (connection.key ? 'configured' : '')} onClick={() => setConnectionOpen(true)}><KeyRound size={15} /><span>{verified ? 'AI connected' : connection.key ? 'API configured' : 'Connect API'}</span></button>
        <div className="file-menu"><button className="secondary-button export-trigger" onClick={() => setMenu(!menu)} aria-expanded={menu}><Download size={15} /><span>Project</span><ChevronDown size={13} /></button>{menu && <div className="menu-popover"><button onClick={startNew}><FilePlus2 size={16} />New study</button><button onClick={() => { file.current?.click(); setMenu(false); }}><FolderOpen size={16} />Open project</button><button onClick={exportProject}><Download size={16} />Download project</button><button onClick={exportGLB}><Box size={16} />Export model · GLB</button></div>}</div>
      </div>
    </header>
    <input type="file" ref={file} accept=".json,application/json" hidden onChange={importProject} />
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
            <SpatialToolbar mode={spatialMode} onMode={setSpatialMode} frame={activeFrame} adjustment={planeAdjustment} onAdjust={a => { revision.current++; setProposal(null); setPlaneAdjustment(a); }} onViewPlane={() => modelView.current?.viewPlane()} onGround={() => chooseFrame(baseFrame())} onAlign={() => modelView.current?.alignPlane()} showPlane={showPlane} onShowPlane={setShowPlane} />
            <div className="model-surface"><ModelView ref={modelView} objects={displayObjects} committedIds={committedIds} strokes={displayStrokes} selectedId={newForm.object?.id || selectedId} onSelect={id => { if (project.objects.some(o => o.id === id)) select(id); }} activeFrame={activeFrame} mode={spatialMode} tool={tool} snap={snap} touchDraw={touchDraw} showPlane={showPlane} onFrame={chooseFrame} onStroke={addStroke} onMessage={setNotice} /><div className="model-context"><span className="model-context-dot" />{preview ? 'Review your next dimension' : 'Draw • orbit • build'}<span>METERS</span></div>{!displayObjects.length && <div className="model-empty"><Box size={42} strokeWidth={1} /><h3>Sketch in space.</h3><p>Draw on the grid, or choose View plane.<br />AI can also build from your words.</p></div>}<div className="model-view-controls"><button onClick={() => modelView.current?.view('iso')}>ISO</button><button onClick={() => modelView.current?.view('top')}>TOP</button><button aria-label="Reset camera" onClick={() => modelView.current?.fit()}><Maximize2 size={14} /></button></div><div className="compass"><span>N</span><MoveUpRight size={25} strokeWidth={1.2} /></div></div>
            <div className="model-footer"><MousePointer2 size={12} /><span>{spatialMode === 'draw' ? (touchDraw ? 'Finger + Pencil ink · Orbit mode to navigate' : 'Pencil / mouse draws · fingers orbit · Alt-drag to orbit') : 'Drag to orbit · scroll or pinch to zoom'}</span><span>{project.strokes.length} strokes · {displayObjects.length} forms</span></div>
          </section>
        </div>
        <div className="assistant-area">{proposal && <div className="proposal-card"><div><Sparkles size={17} /><p>{proposal.intent.summary}</p></div><div className="proposal-actions"><button className="text-button" onClick={() => { setProposal(null); setNotice('AI proposal dismissed.'); }}>Dismiss</button><button className="primary-button" onClick={applyProposal}><Check size={15} />Apply {proposal.intent.actions.length === 1 ? 'change' : 'changes'}</button></div></div>}
          <form className="prompt-form" onSubmit={e => { e.preventDefault(); askAI(); }}><span className="prompt-icon"><Sparkles size={20} strokeWidth={1.5} /></span><div className="prompt-input"><label htmlFor="ai-instruction">A little direction goes a long way.</label><input id="ai-instruction" value={instruction} maxLength={3000} onChange={e => setInstruction(e.target.value)} placeholder={stroke ? 'Try “Straighten this sketch and build it 4 meters high”…' : 'Try “Build a 2 × 1 meter table with four chairs”…'} /></div>{busy ? <button type="button" className="ask-button" onClick={() => { request.current?.abort(); setBusy(false); setNotice('AI request cancelled.'); }}><LoaderCircle className="spin" size={16} />Cancel</button> : <button className="ask-button" type="submit" disabled={!!connection.key && !instruction.trim()}>{connection.key ? 'Ask AI' : 'Connect AI'}<ArrowRight size={16} /></button>}</form><div className="ai-caption"><span>AI suggests. You decide.</span><span>{connection.key ? (verified ? 'Connection tested' : 'Connection configured') : 'Create forms without AI, or bring your own API key.'}</span></div>
        </div>
      </section>
      <aside className="inspector"><div className="inspector-heading"><span className="eyebrow">THE DETAILS</span><button className="icon-button" aria-label="Hide properties" onClick={() => setSidebar(false)}><PanelRightClose size={16} /></button></div><h2>Shape your idea.</h2><div className="inspector-tabs"><button className={inspector === 'create' ? 'active' : ''} onClick={() => { setInspector('create'); setProposal(null); }}><Plus size={14} />New form</button><button className={inspector === 'edit' ? 'active' : ''} onClick={() => { setInspector('edit'); setProposal(null); }}><Settings2 size={14} />Properties</button></div>
        {inspector === 'create' ? <div className="properties-content"><label className="field-label" htmlFor="form-kind">MAKE IT A</label><select id="form-kind" value={kind} onChange={e => { const next = e.target.value as Kind; setKind(next); setHeight(next === 'slab' ? 0.25 : next === 'table' ? 0.75 : next === 'chair' ? 0.9 : next === 'gable' ? 2 : 3.6); }}>{Object.entries(kindNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label className="field-label" htmlFor="source-stroke">FROM SKETCH</label><select id="source-stroke" value={activeStroke || ''} onChange={e => setActiveStroke(e.target.value || null)}><option value="">Choose a stroke</option>{project.strokes.map((s, i) => <option key={s.id} value={s.id}>Stroke {i + 1} · {s.frame?.label || s.plane}</option>)}</select><div className="number-grid"><NumberField label="Height" value={height} min={0.05} max={200} onChange={setHeight} />{['wall', 'table', 'chair', 'pavilion'].includes(kind) ? <NumberField label="Thickness" value={thickness} min={0.05} max={10} onChange={setThickness} /> : kind === 'mass' ? <NumberField label="Floors" value={floors} min={1} max={60} step={1} unit="" onChange={setFloors} /> : null}</div>{newForm.error ? <p className="form-hint error">{newForm.error}</p> : <p className="form-hint">{stroke ? 'Your form is previewed in 3D. Adjust it, then add it to the study.' : 'Draw an outline or select a stroke to preview a form.'}</p>}<button className="primary-button create-button" onClick={createForm} disabled={!newForm.object}><Box size={17} />Create form<ArrowRight size={16} /></button><span className="no-key-note">Height extends out from the sketch plane.</span>{stroke && <button className="text-button" onClick={() => { chooseFrame(stroke.frame || baseFrame(stroke.plane, stroke.offset)); setView('model'); }}>Continue on this sketch plane <MoveUpRight size={13} /></button>}</div> : selected ? <div className="properties-content"><div className="selected-object-heading"><span className="object-icon" style={{ background: selected.color }}><Box size={21} strokeWidth={1.3} /></span><div><input aria-label="Object name" value={selected.name} maxLength={80} onChange={e => { if (e.target.value.trim()) changeObject({ name: e.target.value }); }} /><span>{kindNames[selected.kind]} · {selected.frame?.label || selected.plane}</span></div></div><div className="number-grid"><NumberField label="Height" value={selected.height} min={0.05} max={200} onChange={v => changeObject({ height: v })} />{['wall', 'table', 'chair', 'pavilion'].includes(selected.kind) ? <NumberField label="Thickness" value={selected.thickness} min={0.05} max={10} onChange={v => changeObject({ thickness: v })} /> : <NumberField label="Plane offset" value={selected.offset} min={-200} max={200} onChange={v => changeObject({ offset: v })} />}{['wall', 'table', 'chair', 'pavilion'].includes(selected.kind) && <NumberField label="Plane offset" value={selected.offset} min={-200} max={200} onChange={v => changeObject({ offset: v })} />}{selected.kind === 'mass' && <NumberField label="Floors" value={selected.floors} min={1} max={60} step={1} unit="" onChange={v => changeObject({ floors: v })} />}</div>{selected.kind === 'mass' && <p className="form-hint">{(selected.height / selected.floors).toFixed(2)} m per floor · conceptual divisions</p>}<ProfileControls object={selected} onChange={changeObject} /><div className="profile-metrics"><span>Profile area<strong>{activeMetric.toFixed(1)} <small>m²</small></strong></span><span>Outline points<strong>{selected.profile.length}</strong></span></div><span className="field-label">MATERIAL TONE</span><div className="color-swatches">{palette.map(color => <button key={color} style={{ background: color }} className={selected.color === color ? 'chosen' : ''} aria-label={'Set material ' + color} aria-pressed={selected.color === color} onClick={() => changeObject({ color })}>{selected.color === color && <Check size={15} />}</button>)}</div><button className="text-button" onClick={duplicateSelected}><Plus size={14} />Duplicate alongside</button><button className="text-button remove-object" onClick={removeSelected}><Trash2 size={14} />Remove object</button></div> : <div className="empty-properties"><MousePointer2 size={24} strokeWidth={1.3} /><p>Select a form in the model<br />to explore its dimensions.</p></div>}
        <div className="refine-section"><span className="field-label">REFINE {inspector === 'create' && stroke ? 'ACTIVE SKETCH' : selected ? 'SELECTED FORM' : 'SKETCH'}</span><div className="refine-buttons"><button disabled={!stroke && !selected} onClick={() => refine('straighten')}><PenLine size={14} />Straighten</button><button disabled={!stroke && !selected} onClick={() => refine('orthogonal')}><Grid2X2 size={14} />Square corners</button></div>{stroke && <button className="text-button" onClick={() => { commit({ ...project, strokes: project.strokes.filter(s => s.id !== stroke.id) }); setActiveStroke(null); setNotice('Active stroke removed. Existing forms are preserved.'); }}><Trash2 size={13} />Remove active ink</button>}</div>
        <div className="objects-section"><div className="section-label"><span>IN YOUR STUDY</span><span>{project.objects.length.toString().padStart(2, '0')}</span></div><div className="object-list">{project.objects.map(o => <button key={o.id} className={'object-row ' + (selectedId === o.id && inspector === 'edit' ? 'selected' : '')} onClick={() => select(o.id)}><span className="object-swatch" style={{ background: o.color }}><Box size={14} strokeWidth={1.4} /></span><span>{o.name}<small>{kindNames[o.kind]}</small></span>{selectedId === o.id && inspector === 'edit' && <span className="selected-dot" />}</button>)}{!project.objects.length && <p className="empty-list">A blank page, full of possibility.</p>}</div></div>
        <div className="studio-note"><span className="note-decoration">✳</span><p>Keep it loose.<br /><strong>See where it takes you.</strong></p><button onClick={startNew}>Start a fresh study <MoveUpRight size={13} /></button></div>
      </aside>
    </div>
    <footer className="status-bar"><div className="status-message" role="status" aria-live="polite"><span className="status-dot" />{notice}</div><div className="status-right"><span>{view === 'sketch' ? planeNames[plane] : activeFrame.label}</span><span>POC / 0.2</span><button aria-label="How to use Spatial Sketch" onClick={() => setHelp(!help)}><CircleHelp size={15} /></button></div></footer>
    {help && <div className="help-card"><button className="icon-button" aria-label="Close help" onClick={() => setHelp(false)}><X size={16} /></button><h3>Your first little dimension.</h3><ol><li>Draw directly on the 3D grid with Pencil or mouse. Fingers orbit; two fingers pan and zoom.</li><li>Pick face places a plane on a model face. View plane places one facing the camera through the orbit center. Plane settings adjust its angle and depth.</li><li>Choose a form, set its height, and press Create form. An open path works with Wall.</li><li>Select a form to change its dimensions. Undo works with Ctrl/⌘ Z.</li><li>Connect an API for text instructions. Review the preview, then apply.</li><li>Download your project before leaving. Refreshing clears the study and key.</li></ol><p>Ink stays fixed in space when you orbit. One stroke has one drawing plane; change planes between strokes to build in 3D. On curved forms, Pick face uses the flat tangent at the tap. Face planes stay fixed when the original object changes.</p></div>}
    {connectionOpen && <ConnectionPanel value={connection} verified={verified} onClose={() => setConnectionOpen(false)} onUse={(c, tested) => { request.current?.abort(); setBusy(false); setConnection(c); setVerified(tested); setConnectionOpen(false); setNotice('API configured for this session. Refreshing clears the key.'); }} onDisconnect={() => { request.current?.abort(); setBusy(false); setConnection({ endpoint: '', model: '', key: '' }); setVerified(false); setConnectionOpen(false); setNotice('API disconnected. The key has been cleared from the app.'); }} />}
  </main>;
}
