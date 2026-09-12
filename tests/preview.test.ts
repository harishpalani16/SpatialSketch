import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {PreviewMaterials} from '../src/lib/preview-materials';
it('removes texture work from shaded display while retaining original material arrays and resources',()=>{
  const texture=new THREE.Texture(),a=new THREE.MeshStandardMaterial({map:texture,color:'red'}),b=new THREE.MeshPhysicalMaterial({color:'blue',transmission:.7});
  const originals=[a,b],mesh=new THREE.Mesh<THREE.BoxGeometry,THREE.Material[]>(new THREE.BoxGeometry(),originals),root=new THREE.Group();root.add(mesh);
  const disposeTexture=vi.spyOn(texture,'dispose'),disposeOriginal=vi.spyOn(a,'dispose'),preview=new PreviewMaterials(root);
  preview.setMode('shaded');const shaded=mesh.material;expect(shaded[0]).toBeInstanceOf(THREE.MeshLambertMaterial);expect((shaded[0] as THREE.MeshLambertMaterial).map).toBeNull();expect(shaded[0]).toBe(shaded[1]);
  preview.setMode('materials');expect(mesh.material).toBe(originals);expect(a.map).toBe(texture);
  preview.setMode('shaded');expect(mesh.material[0]).toBe(shaded[0]);preview.dispose();expect(mesh.material).toBe(originals);expect(disposeTexture).not.toHaveBeenCalled();expect(disposeOriginal).not.toHaveBeenCalled();
  mesh.geometry.dispose();a.dispose();b.dispose();texture.dispose();
});
