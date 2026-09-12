import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'three/addons/libs/fflate.module.js';
import { parseProject, type Project } from './model';
import { loadGeometry, disposeAssetRoot, type AssetCache, type LoadedAsset, MAX_IMPORT_BYTES } from './import-geometry';

export function packageSession(project:Project,assets:AssetCache) {
  const entries:Zippable={'session.json':strToU8(JSON.stringify(parseProject(project)))};
  for(const id of new Set(project.references.map(r=>r.assetId))) {
    const asset=assets.get(id);if(!asset)throw new Error('An imported model is missing. Reimport it before downloading this session.');
    for(const [i,file] of asset.files.entries())entries['assets/'+id+'/'+i]=[file.bytes,{level:0}];
    entries['assets/'+id+'/manifest.json']=strToU8(JSON.stringify({primary:asset.primary,files:asset.files.map(f=>f.name)}));
  }
  return zipSync(entries,{level:3});
}
export async function openSession(bytes:Uint8Array):Promise<{project:Project;assets:LoadedAsset[]}> {
  if(bytes.byteLength>MAX_IMPORT_BYTES*2)throw new Error('Use a session package smaller than 300 MB.');
  let total=0,count=0;
  const entries=unzipSync(bytes,{filter:file=>{total+=file.originalSize;count++;if(total>MAX_IMPORT_BYTES*2 || count>2000)throw new Error('This session package expands beyond the supported size.');return true;}});
  if(!entries['session.json'])throw new Error('This is not a Spatial Sketch session package.');
  const project=parseProject(JSON.parse(strFromU8(entries['session.json']))),assets:LoadedAsset[]=[];
  try {
    for(const id of new Set(project.references.map(r=>r.assetId))) {
      const prefix='assets/'+id+'/',manifest=JSON.parse(strFromU8(entries[prefix+'manifest.json']));
      if(!Array.isArray(manifest.files)||manifest.files.length>500||typeof manifest.primary!=='string')throw new Error('Invalid model manifest.');
      const files=manifest.files.map((name:unknown,i:number)=>{if(typeof name!=='string'||!entries[prefix+i])throw new Error('A model file is missing from this package.');return {name,bytes:entries[prefix+i]};});
      const asset=await loadGeometry(files,manifest.primary);asset.id=id;assets.push(asset);
    }return {project,assets};
  } catch(error) {assets.forEach(a=>disposeAssetRoot(a.root));throw error;}
}
