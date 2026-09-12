import * as THREE from 'three';

export type PreviewMode = 'shaded' | 'materials';

/** Display-only overrides; the source materials and textures remain available for export. */
export class PreviewMaterials {
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private shaded = new Map<string, THREE.MeshLambertMaterial>();

  constructor(root: THREE.Object3D) {
    root.traverse(object => {
      if (object instanceof THREE.Mesh) this.originals.set(object, object.material);
    });
  }

  setMode(mode: PreviewMode) {
    const shade = (source: THREE.Material) => {
      const key=[source.side,source.opacity,source.transparent,source.depthWrite].join('/');
      let material = this.shaded.get(key);
      if (!material) {
        material = new THREE.MeshLambertMaterial({
          color: '#b9beb6', side: source.side, opacity: source.opacity,
          transparent: source.transparent, depthWrite: source.depthWrite,
        });
        this.shaded.set(key, material);
      }
      return material;
    };
    for (const [mesh, original] of this.originals) {
      mesh.material = mode === 'materials' ? original : Array.isArray(original) ? original.map(shade) : shade(original);
    }
  }

  dispose() {
    this.setMode('materials');
    this.shaded.forEach(material => material.dispose());
    this.shaded.clear();
    this.originals.clear();
  }
}
