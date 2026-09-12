import { isSameOrigin } from '@/lib/http';
import { transcribe } from '@/lib/speech-server';
export const runtime='nodejs';
export const maxDuration=90;
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store'};
  if(!isSameOrigin(request))return Response.json({error:'Use speech input from this application.'},{status:403,headers});
  try{return Response.json(await transcribe(request),{headers});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Speech transcription failed.'},{status:400,headers});}
}
