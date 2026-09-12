const positions=new Float32Array([-2,0,-3,2,0,-3,2,3,-3,-2,3,-3,-2,0,3,2,0,3,2,3,3,-2,3,3]);
const indices=new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
const bin=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(indices.buffer)]);
function json(uri?:string) {return {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'Interior shell'}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.6,.7,.5,1],metallicFactor:0,roughnessFactor:1}}],buffers:[{byteLength:bin.length,...(uri?{uri}:{})}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength,target:34962},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-2,0,-3],max:[2,3,3]},{bufferView:1,componentType:5123,count:36,type:'SCALAR'}]};}
export function glbFixture(){const raw=Buffer.from(JSON.stringify(json())),text=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(text);const total=12+8+text.length+8+bin.length,header=Buffer.alloc(12),jhead=Buffer.alloc(8),bhead=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);jhead.writeUInt32LE(text.length);jhead.writeUInt32LE(0x4e4f534a,4);bhead.writeUInt32LE(bin.length);bhead.writeUInt32LE(0x004e4942,4);return {name:'interior.glb',mimeType:'model/gltf-binary',buffer:Buffer.concat([header,jhead,text,bhead,bin])};}
export function gltfFixture(){return [{name:'interior.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(json('interior.bin')))}, {name:'interior.bin',mimeType:'application/octet-stream',buffer:bin}];}
export function objFixture(){let text='mtllib interior.mtl\no Interior\n';for(let i=0;i<positions.length;i+=3)text+='v '+Array.from(positions.slice(i,i+3)).join(' ')+'\n';text+='usemtl plaster\n';for(let i=0;i<indices.length;i+=3)text+='f '+Array.from(indices.slice(i,i+3)).map(n=>n+1).join(' ')+'\n';return [{name:'interior.obj',mimeType:'text/plain',buffer:Buffer.from(text)},{name:'interior.mtl',mimeType:'text/plain',buffer:Buffer.from('newmtl plaster\nKd 0.6 0.7 0.5\n')}];}
export function fbxFixture(){const text=`; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",100
\t}
}
Objects:  {
\tGeometry: 1001, "Geometry::Interior", "Mesh" {
\t\tVertices: *24 {
\t\t\ta: ${Array.from(positions).join(',')}
\t\t}
\t\tPolygonVertexIndex: *36 {
\t\t\ta: ${Array.from(indices).map((n,i)=>i%3===2?-n-1:n).join(',')}
\t\t}
\t}
\tModel: 1002, "Model::Interior", "Mesh" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
\t\t}
\t}
}
Connections:  {
\tC: "OO",1001,1002
}
`;return {name:'interior.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(text)};}
