'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, disposeGroup, strokeLine } from '@/lib/geometry';
import type { ModelObject, Stroke } from '@/lib/model';

export type ModelViewHandle = { fit: () => void; view: (direction: 'iso' | 'top') => void; exportGLB: () => Promise<ArrayBuffer> };
type Props = { objects: ModelObject[]; strokes: Stroke[]; selectedId: string | null; onSelect: (id: string) => void };
type Engine = { scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls; root: THREE.Group; ink: THREE.Group; direction: 'iso' | 'top'; dirty: boolean };

function frame(engine: Engine) {
  const box = new THREE.Box3().setFromObject(engine.root);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? 18 : Math.max(6, box.getSize(new THREE.Vector3()).length());
  const aspectFactor = Math.max(1, 1 / engine.camera.aspect);
  const distance = size * 1.65 * aspectFactor;
  engine.controls.target.copy(center);
  const direction = engine.direction === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1, 0.85, 1.2).normalize();
  engine.camera.position.copy(center).addScaledVector(direction, distance);
  engine.camera.near = 0.05; engine.camera.far = Math.max(2000, distance * 10);
  engine.camera.updateProjectionMatrix(); engine.controls.update();
}

const ModelView = forwardRef<ModelViewHandle, Props>(function ModelView({ objects, strokes, selectedId, onSelect }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const propsRef = useRef({ objects, onSelect });
  propsRef.current = { objects, onSelect };
  const [error, setError] = useState('');
  useImperativeHandle(ref, () => ({
    fit() { if (engineRef.current) frame(engineRef.current); },
    view(direction) { if (engineRef.current) { engineRef.current.direction = direction; frame(engineRef.current); } },
    async exportGLB() {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const scene = buildScene(propsRef.current.objects, null, false);
      try { return await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer; }
      finally { disposeGroup(scene); }
    },
  }), []);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
    catch { setError('3D needs WebGL. Try Safari or a browser with hardware acceleration enabled. Your sketch tools are still available.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor('#efeee7');
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D model');
    renderer.domElement.setAttribute('data-testid', 'model-canvas');
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#efeee7');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09; controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1; controls.maxDistance = 1500;
    scene.add(new THREE.HemisphereLight('#fffef2', '#b3b7a7', 2.5));
    const sun = new THREE.DirectionalLight('#fff9e9', 3.2); sun.position.set(-14, 30, 16); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 100; sun.shadow.normalBias = 0.03; sun.shadow.bias = -0.0001;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#efeee7', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.035; ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(100, 100, '#c9cbbf', '#d7d8ce'); grid.position.y = -0.025;
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.55; scene.add(grid);
    const root = buildScene(propsRef.current.objects);
    const ink = new THREE.Group(); scene.add(root, ink);
    const engine: Engine = { scene, renderer, camera, controls, root, ink, direction: 'iso', dirty: true }; engineRef.current = engine;
    controls.addEventListener('change', () => { engine.dirty = true; });
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); engine.dirty = true;
    });
    resize.observe(element);
    const rect = element.getBoundingClientRect(); renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(1, rect.height); frame(engine);
    let animation = 0;
    const render = () => { animation = requestAnimationFrame(render); controls.update(); if (engine.dirty && element.clientWidth && element.clientHeight && document.visibilityState === 'visible') { renderer.render(scene, camera); engine.dirty = false; } };
    render();
    let down = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1), camera);
      const hit = ray.intersectObjects(engine.root.children, true).find(h => h.object instanceof THREE.Mesh);
      if (hit?.object.userData.objectId) propsRef.current.onSelect(hit.object.userData.objectId);
    };
    const lost = (event: Event) => { event.preventDefault(); setError('The browser paused the 3D view. Download your project before refreshing to restore it.'); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(animation); resize.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('webglcontextlost', lost);
      disposeGroup(scene); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); engineRef.current = null;
    };
  }, []);
  useEffect(() => {
    const engine = engineRef.current; if (!engine) return;
    const wasEmpty = !engine.root.children.length;
    engine.scene.remove(engine.root); disposeGroup(engine.root);
    engine.root = buildScene(objects, selectedId); engine.scene.add(engine.root); engine.dirty = true;
    if (wasEmpty && objects.length) frame(engine);
  }, [objects, selectedId]);
  useEffect(() => {
    const engine = engineRef.current; if (!engine) return;
    disposeGroup(engine.ink); engine.ink.clear(); strokes.forEach(s => engine.ink.add(strokeLine(s.points, s.plane, s.offset))); engine.dirty = true;
  }, [strokes]);
  return <div className="model-renderer" ref={host}>{error && <div className="canvas-error" role="alert">{error}</div>}</div>;
});
export default ModelView;
