import * as THREE from 'three';
import type { ModelObject, Plane, Point } from './model';

export function planeMatrix(plane: Plane, offset: number) {
  const matrix = new THREE.Matrix4();
  if (plane === 'ground') matrix.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
  else if (plane === 'side') matrix.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  if (plane === 'ground') matrix.setPosition(0, offset, 0);
  else if (plane === 'front') matrix.setPosition(0, 0, offset);
  else matrix.setPosition(offset, 0, 0);
  return matrix;
}
export function buildObject(object: ModelObject, selected = false, guides = true): THREE.Group {
  const group = new THREE.Group();
  group.name = object.name;
  group.userData = { objectId: object.id };
  const material = new THREE.MeshStandardMaterial({ color: object.color, roughness: 0.85, metalness: 0.02 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: selected ? '#65754c' : '#696d61', transparent: true, opacity: selected ? 0.8 : 0.27 });
  function addMesh(geometry: THREE.BufferGeometry) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.objectId = object.id;
    group.add(mesh);
    if (guides) { const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), edgeMaterial); group.add(edges); }
  }
  if (object.kind === 'wall') {
    for (let i = 1; i < object.profile.length; i++) {
      const a = object.profile[i - 1], b = object.profile[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const geometry = new THREE.BoxGeometry(length, object.thickness, object.height);
      geometry.rotateZ(Math.atan2(b.y - a.y, b.x - a.x));
      geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, object.height / 2);
      addMesh(geometry);
    }
    for (const p of object.profile.slice(1, -1)) {
      const geometry = new THREE.CylinderGeometry(object.thickness / 2, object.thickness / 2, object.height, 12);
      geometry.rotateX(Math.PI / 2); geometry.translate(p.x, p.y, object.height / 2); addMesh(geometry);
    }
  } else {
    const shape = new THREE.Shape(object.profile.map(p => new THREE.Vector2(p.x, p.y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: object.height, bevelEnabled: false, curveSegments: 12, steps: 1 });
    addMesh(geometry);
    if (guides && object.kind === 'mass') {
      for (let floor = 1; floor < object.floors; floor++) {
        const level = floor * object.height / object.floors;
        const points = [...object.profile, object.profile[0]].map(p => new THREE.Vector3(p.x, p.y, level));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#69735b', transparent: true, opacity: 0.24 }));
        group.add(line);
      }
    }
  }
  group.applyMatrix4(planeMatrix(object.plane, object.offset));
  return group;
}
export function buildScene(objects: ModelObject[], selectedId: string | null = null, guides = true) {
  const root = new THREE.Group();
  objects.forEach(o => root.add(buildObject(o, o.id === selectedId, guides)));
  return root;
}
export function strokeLine(points: Point[], plane: Plane, offset: number) {
  const matrix = planeMatrix(plane, offset + 0.012);
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, 0).applyMatrix4(matrix)));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#a16b38', transparent: true, opacity: 0.8, depthWrite: false }));
}
export function disposeGroup(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => materials.add(m));
    }
  });
  materials.forEach(m => m.dispose());
}
