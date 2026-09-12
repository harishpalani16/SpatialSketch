import * as THREE from 'three';
import { bounds, type ModelObject, type Plane, type Point, type SketchFrame } from './model';
import { planeMatrix } from './spatial';
export { planeMatrix } from './spatial';
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
  let b = bounds(object.profile);
  let recipeMatrix: THREE.Matrix4 | null = null;
  if (['table', 'chair', 'pavilion', 'gable', 'sphere'].includes(object.kind)) {
    const center = object.profile.reduce<THREE.Vector3>((a,p) => a.add(new THREE.Vector3(p.x,p.y,0)),new THREE.Vector3()).multiplyScalar(1/object.profile.length);
    const first = new THREE.Vector3(object.profile[0].x,object.profile[0].y,0);
    const isRound = object.kind === 'sphere';
    const across = new THREE.Vector3(object.profile[isRound ? 12 : 1].x,object.profile[isRound ? 12 : 1].y,0);
    const along = new THREE.Vector3(object.profile[isRound ? 0 : 3].x,object.profile[isRound ? 0 : 3].y,0);
    const u = isRound ? first.sub(center) : across.sub(first);
    const v = isRound ? across.sub(center) : along.sub(first);
    const w = u.length() * (isRound ? 2 : 1), l = v.length() * (isRound ? 2 : 1);
    recipeMatrix = new THREE.Matrix4().makeBasis(u.normalize(),v.normalize(),new THREE.Vector3(0,0,1)).setPosition(center);
    b = { minX:-w/2,maxX:w/2,minY:-l/2,maxY:l/2 };
  }
  const width = b.maxX - b.minX, length = b.maxY - b.minY;
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  function box(w: number, l: number, h: number, x: number, y: number, z: number) {
    addMesh(new THREE.BoxGeometry(w, l, h).translate(x, y, z));
  }
  if (['table', 'chair', 'pavilion'].includes(object.kind)) {
    const t = Math.min(object.thickness, width * 0.15, length * 0.15, object.height * 0.12);
    const top = object.kind === 'chair' ? object.height * 0.48 : object.height;
    box(width, length, t, cx, cy, top - t / 2);
    const leg = object.kind === 'pavilion' ? t : Math.min(t, 0.09);
    for (const x of [b.minX + leg / 2, b.maxX - leg / 2]) for (const y of [b.minY + leg / 2, b.maxY - leg / 2]) box(leg, leg, top - t, x, y, (top - t) / 2);
    if (object.kind === 'chair') box(width, t, object.height - top, cx, b.maxY - t / 2, top + (object.height - top) / 2);
  } else if (object.kind === 'sphere') {
    addMesh(new THREE.SphereGeometry(1, 40, 24).scale(width / 2, length / 2, object.height / 2).translate(cx, cy, object.height / 2));
  } else if (object.kind === 'gable') {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([b.minX,b.minY,0,b.maxX,b.minY,0,b.maxX,b.maxY,0,b.minX,b.maxY,0,cx,b.minY,object.height,cx,b.maxY,object.height], 3));
    geometry.setIndex([0,3,2,0,2,1,0,1,4,1,2,5,1,5,4,2,3,5,3,0,4,3,4,5]);
    const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals(); addMesh(flat);
  } else if (object.kind === 'wall') {
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
  // Retain the full affine matrix: resizing a rotated recipe can shear its profile.
  // Object3D decomposition into position/rotation/scale would lose that shear.
  group.matrix.copy(planeMatrix(object.plane, object.offset, object.frame));
  if (recipeMatrix) group.matrix.multiply(recipeMatrix);
  group.matrixAutoUpdate = false; group.matrixWorldNeedsUpdate = true;
  return group;
}
export function buildScene(objects: ModelObject[], selectedId: string | null = null, guides = true) {
  const root = new THREE.Group();
  objects.forEach(o => root.add(buildObject(o, o.id === selectedId, guides)));
  return root;
}
export function strokeLine(points: Point[], plane: Plane, offset: number, frame?: SketchFrame) {
  const matrix = planeMatrix(plane, offset + 0.012, frame);
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
