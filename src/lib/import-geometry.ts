import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeGroup } from './geometry';
import { uid, type ReferenceModel } from './model';
import { transformMatrix } from './session';

export type SourceFile={name:string;bytes:Uint8Array};
export type LoadedAsset={id:string;root:THREE.Object3D;files:SourceFile[];primary:string;format:ReferenceModel['format'];unitScale:number;triangles:number};
export type AssetCache=Map<string,LoadedAsset>;
export const MAX_IMPORT_BYTES=150*1024*1024;
export function normalizeFileName(name:string) {
  let decoded=name.replace(/\\/g,'/');try{decoded=decodeURIComponent(decoded);}catch{/* Literal percent signs are valid filenames. */}
  const parts:string[]=[];for(const part of decoded.split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return parts.join('/');
}
const resourcePath=(fileName:string)=>fileName.replace(/\\/g,'/').slice(0,fileName.replace(/\\/g,'/').lastIndexOf('/')+1);
export function createFileResolver(files:SourceFile[]) {
  const entries=new Map<string,SourceFile>();
  for(const file of files) { const key=normalizeFileName(file.name);if(entries.has(key))throw new Error('Two selected files have the same path: '+key);entries.set(key,file); }
  return (path:string) => {
    if(/^(https?:|file:|ftp:|\/\/)/i.test(path)) throw new Error('External model resources are disabled. Include the texture and buffer files in your import.');
    const key=normalizeFileName(path), exact=entries.get(key);if(exact)return exact;
    const matches=files.filter(f=>normalizeFileName(f.name).split('/').at(-1)===key.split('/').at(-1));
    if(matches.length===1)return matches[0];
    throw new Error(matches.length>1?'Ambiguous resource name: '+key:'Missing model resource: '+key+'. Select its companion files or folder too.');
  };
}
export async function readSourceFiles(files:File[]):Promise<SourceFile[]> {
  if(files.length>500 || files.reduce((n,f)=>n+f.size,0)>MAX_IMPORT_BYTES)throw new Error('Use up to 500 files and 150 MB per import. Export a lighter interior model if needed.');
  return Promise.all(files.map(async f=>({name:f.webkitRelativePath||f.name,bytes:new Uint8Array(await f.arrayBuffer())})));
}
export async function loadGeometry(files:SourceFile[],primaryName?:string):Promise<LoadedAsset> {
  if(files.length>500 || files.reduce((n,f)=>n+f.bytes.byteLength,0)>MAX_IMPORT_BYTES)throw new Error('Use up to 500 files and 150 MB per imported model.');
  const models=files.filter(f=>/\.(glb|gltf|obj|fbx)$/i.test(f.name));
  const primary=primaryName?files.find(f=>f.name===primaryName):models.length===1?models[0]:null;
  if(!primary)throw new Error('Select one GLB, glTF, OBJ, or FBX model together with its companion files.');
  const format=primary.name.split('.').at(-1)!.toLowerCase() as ReferenceModel['format'];
  if(!['glb','gltf','obj','fbx'].includes(format))throw new Error('This model format is not supported.');
  const resolve=createFileResolver(files), urls=new Map<string,string>(), revokes=new Set<string>();
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    if(url.startsWith('data:'))return url;
    if(url.startsWith('blob:')){revokes.add(url);return url;}
    const file=resolve(url);if(!urls.has(file.name)){const value=URL.createObjectURL(new Blob([file.bytes as BlobPart]));urls.set(file.name,value);revokes.add(value);}return urls.get(file.name)!;
  });
  let pendingError='';manager.onError=url=>{pendingError='A model texture or buffer could not be loaded: '+url.slice(0,120);};
  const settled=new Promise<void>(resolve=>{manager.onLoad=()=>resolve();});
  manager.itemStart('local-import');
  let root:THREE.Object3D|undefined, draco:DRACOLoader|undefined;
  try {
    if(format==='glb'||format==='gltf') {
      const loader=new GLTFLoader(manager);
      draco=new DRACOLoader().setDecoderPath('/decoders/draco/');loader.setDRACOLoader(draco);loader.setMeshoptDecoder(MeshoptDecoder);
      const data=format==='gltf'?new TextDecoder().decode(primary.bytes):primary.bytes.slice().buffer;
      root=(await loader.parseAsync(data,resourcePath(primary.name))).scene;
    } else if(format==='obj') {
      const loader=new OBJLoader(manager), text=new TextDecoder().decode(primary.bytes);
      const libraries=[...text.matchAll(/^mtllib\s+(.+)$/gm)].map(m=>m[1].trim());
      if(libraries.length) {
        const librariesByPath=libraries.map(name=>{
          const file=resolve(resourcePath(primary.name)+name),materials=new MTLLoader(manager).parse(new TextDecoder().decode(file.bytes),resourcePath(file.name));materials.preload();return materials;
        });
        const materials=librariesByPath[0];materials.materials=Object.assign({},...librariesByPath.map(m=>m.materials));loader.setMaterials(materials);
      }
      root=loader.parse(text);
    } else root=new FBXLoader(manager).parse(primary.bytes.slice().buffer,'');
    manager.itemEnd('local-import');await settled;
    if(pendingError)throw new Error('Some model resources failed to load. Include all textures and buffers, or export a self-contained GLB.');
    let triangles=0,meshes=0;const remove:THREE.Object3D[]=[];
    root.traverse(child=>{
      if(child instanceof THREE.Light || child instanceof THREE.Camera)remove.push(child);
      if(child instanceof THREE.Mesh) {
        meshes++;const position=child.geometry.getAttribute('position');if(!position)throw new Error('The model contains a mesh without positions.');
        triangles+=(child.geometry.index?.count || position.count)/3;
        if(triangles>3000000 || meshes>20000)throw new Error('This model exceeds 3 million triangles or 20,000 meshes. Export a lighter interior for the iPad.');
        child.geometry.computeBoundingBox();const b=child.geometry.boundingBox!;
        if(![...b.min.toArray(),...b.max.toArray()].every(Number.isFinite))throw new Error('The model contains invalid coordinates.');
        child.castShadow=false;child.receiveShadow=true;
      }
    });remove.forEach(o=>o.removeFromParent());
    if(!meshes)throw new Error('No mesh geometry was found in this file. Export mesh geometry from your modeling application.');
    const unitScale=format==='fbx'?Number(root.userData.unitScaleFactor || 1)/100:1;
    root.updateMatrixWorld(true);
    return {id:uid(),root,files,primary:primary.name,format,unitScale,triangles:Math.round(triangles)};
  } catch(error) {
    if(root)disposeAssetRoot(root);
    const message=error instanceof Error?error.message:'Could not read this model.';
    if(/KTX2Loader/.test(message))throw new Error('This GLB uses KTX2 textures. Export PNG/JPEG textures for this preview.');
    throw new Error(message);
  } finally {draco?.dispose();revokes.forEach(url=>URL.revokeObjectURL(url));}
}
export function referenceForAsset(asset:LoadedAsset):ReferenceModel {
  return {id:uid(),assetId:asset.id,name:asset.primary.split('/').at(-1)!.slice(0,80),fileName:asset.primary,format:asset.format,visible:true,opacity:1,unitScale:asset.unitScale,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
}
export function referenceMatrix(reference:ReferenceModel) {return transformMatrix(reference.transform).multiply(new THREE.Matrix4().makeScale(reference.unitScale,reference.unitScale,reference.unitScale));}
export function buildReferences(references:ReferenceModel[],assets:AssetCache) {
  const root=new THREE.Group();
  for(const reference of references.filter(r=>r.visible)) {
    const asset=assets.get(reference.assetId);if(!asset)continue;
    const instance=clone(asset.root), holder=new THREE.Group();holder.name=reference.name;holder.userData.referenceId=reference.id;
    instance.traverse(child=>{
      child.userData={referenceId:reference.id};
      if(child instanceof THREE.Mesh) {
        const material=(m:THREE.Material)=>{const copy=m.clone();copy.opacity*=reference.opacity;copy.transparent=copy.transparent||reference.opacity<1;if(reference.opacity<1)copy.depthWrite=false;return copy;};
        child.material=Array.isArray(child.material)?child.material.map(material):material(child.material);
      }
    });holder.add(instance);holder.matrix.copy(referenceMatrix(reference));holder.matrixAutoUpdate=false;root.add(holder);
  }return root;
}
// View instances share their source geometry and textures; only their material copies are disposed.
export function disposeReferenceInstances(root:THREE.Object3D) {root.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});root.clear();}
export function disposeAssetRoot(root:THREE.Object3D) {
  const textures=new Set<THREE.Texture>();root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);});
  textures.forEach(t=>{t.dispose();if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)t.image.close();});disposeGroup(root);
}
