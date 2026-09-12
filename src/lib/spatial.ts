import * as THREE from 'three';
import type { Plane, Point, SketchFrame } from './model';

export function baseFrame(plane: Plane = 'ground', offset = 0): SketchFrame {
  if (plane === 'front') return { origin: [0, 0, offset], u: [1, 0, 0], v: [0, 1, 0], label: 'Front plane' };
  if (plane === 'side') return { origin: [offset, 0, 0], u: [0, 0, -1], v: [0, 1, 0], label: 'Side plane' };
  return { origin: [0, offset, 0], u: [1, 0, 0], v: [0, 0, -1], label: 'Ground plane' };
}
export function frameMatrix(frame: SketchFrame, offset = 0) {
  const u = new THREE.Vector3(...frame.u), v = new THREE.Vector3(...frame.v), normal = u.clone().cross(v).normalize();
  return new THREE.Matrix4().makeBasis(u, v, normal).setPosition(new THREE.Vector3(...frame.origin).addScaledVector(normal, offset));
}
export function planeMatrix(plane: Plane, offset: number, frame?: SketchFrame) {
  return frameMatrix(plane === 'custom' && frame ? frame : baseFrame(plane), offset);
}
export function frameNormal(frame: SketchFrame) { return new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize(); }
export function frameFromNormal(origin: THREE.Vector3, normal: THREE.Vector3, preferredRight = new THREE.Vector3(1, 0, 0), label = 'Spatial plane'): SketchFrame {
  const n = normal.clone().normalize();
  let u = preferredRight.clone().addScaledVector(n, -preferredRight.dot(n));
  if (u.lengthSq() < 0.001) { const fallback = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1); u = fallback.addScaledVector(n, -fallback.dot(n)); }
  u.normalize(); const v = n.clone().cross(u).normalize();
  return { origin: origin.toArray(), u: u.toArray(), v: v.toArray(), label };
}
export function projectRay(ray: THREE.Ray, frame: SketchFrame): Point | null {
  const normal = frameNormal(frame);
  if (Math.abs(ray.direction.dot(normal)) < 0.075) return null;
  const intersection = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...frame.origin)), new THREE.Vector3());
  if (!intersection) return null;
  const relative = intersection.sub(new THREE.Vector3(...frame.origin));
  const point = { x: relative.dot(new THREE.Vector3(...frame.u)), y: relative.dot(new THREE.Vector3(...frame.v)) };
  return Math.max(Math.abs(point.x), Math.abs(point.y)) <= 1000 ? point : null;
}
export function adjustFrame(frame: SketchFrame, tilt: number, turn: number, shift: number): SketchFrame {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(tilt), THREE.MathUtils.degToRad(turn), 0, 'YXZ'));
  const u = new THREE.Vector3(...frame.u).transformDirection(matrix), v = new THREE.Vector3(...frame.v).transformDirection(matrix);
  const origin = new THREE.Vector3(...frame.origin).addScaledVector(u.clone().cross(v), shift);
  return { ...frame, origin: origin.toArray(), u: u.toArray(), v: v.toArray(), label: 'Custom plane' };
}
export function frameForCamera(camera: THREE.Camera, target: THREE.Vector3) {
  return frameFromNormal(target, camera.getWorldDirection(new THREE.Vector3()).negate(), new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), 'View plane');
}
