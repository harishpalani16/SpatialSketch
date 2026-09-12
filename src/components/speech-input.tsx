'use client';
import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Settings2,LoaderCircle,X} from 'lucide-react';

type Props={disabled:boolean;sessionId:string;onText:(text:string)=>boolean;onBusy:(busy:boolean)=>void};
export default function SpeechInput({disabled,sessionId,onText,onBusy}:Props){
  const [key,setKey]=useState(''),[draft,setDraft]=useState(''),[settings,setSettings]=useState(false);
  const [phase,setPhase]=useState<'idle'|'starting'|'recording'|'transcribing'>('idle');
  const [status,setStatus]=useState(''),[seconds,setSeconds]=useState(0),[transcript,setTranscript]=useState('');
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),request=useRef<AbortController|null>(null);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null),generation=useRef(0);
  const callbacks=useRef({onText,onBusy});callbacks.current={onText,onBusy};
  function release(){if(timer.current){clearInterval(timer.current);timer.current=null;}stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
  function cancel(){generation.current++;request.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();recorder.current=null;release();setPhase('idle');callbacks.current.onBusy(false);setStatus('Dictation cancelled.');}
  useEffect(()=>{return()=>{generation.current++;request.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();release();callbacks.current.onBusy(false);};},[sessionId]);
  // Reset only the active capture when switching studies; the session API key stays in memory.
  useEffect(()=>{setPhase('idle');setTranscript('');setStatus('');},[sessionId]);
  async function upload(blob:Blob,id:number){
    if(id!==generation.current)return;
    if(!blob.size){setStatus('No audio was recorded. Try again.');setPhase('idle');callbacks.current.onBusy(false);return;}
    if(blob.size>3*1024*1024){setStatus('Recording exceeded 3 MB. Try a shorter dictation.');setPhase('idle');callbacks.current.onBusy(false);return;}
    setPhase('transcribing');setStatus('Transcribing with ElevenLabs…');const controller=new AbortController();request.current=controller;
    try{
      const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':blob.type,'x-elevenlabs-key':key},body:blob,signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Transcription failed.');
      if(typeof data.text!=='string'||!data.text.trim())throw new Error('No speech was detected. Try again.');
      if(id!==generation.current)return;
      setTranscript(data.text);setStatus('Review your transcript, then add it to the prompt.');
    }catch(error){if(id===generation.current&&!controller.signal.aborted)setStatus(error instanceof Error?error.message:'Transcription failed.');}
    finally{if(id===generation.current){setPhase('idle');callbacks.current.onBusy(false);request.current=null;}}
  }
  async function start(){
    if(!key){setSettings(true);return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setStatus('Microphone recording needs a supported browser over HTTPS (or localhost).');return;}
    const id=++generation.current;setPhase('starting');callbacks.current.onBusy(true);setStatus('Allow microphone access to dictate.');setSeconds(0);
    try{
      const capture=await navigator.mediaDevices.getUserMedia({audio:true});
      if(id!==generation.current){capture.getTracks().forEach(t=>t.stop());return;}
      stream.current=capture;
      const type=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      const recording=new MediaRecorder(capture,{...(type?{mimeType:type}:{}),audioBitsPerSecond:64000});recorder.current=recording;
      const chunks:Blob[]=[];let size=0;
      recording.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;}if(size>3*1024*1024&&recording.state==='recording')recording.stop();};
      recording.onerror=()=>{if(id===generation.current){cancel();setStatus('The microphone stopped unexpectedly. Try again.');}};
      recording.onstop=()=>{if(id!==generation.current)return;release();recorder.current=null;void upload(new Blob(chunks,{type:recording.mimeType||type||'audio/webm'}),id);};
      recording.start(1000);setPhase('recording');setStatus('Listening. Stop to transcribe · up to 2 minutes.');
      const started=Date.now();timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);setSeconds(elapsed);if(elapsed>=120&&recording.state==='recording')recording.stop();},500);
    }catch(error){if(id===generation.current){release();setPhase('idle');callbacks.current.onBusy(false);setStatus(error instanceof DOMException&&error.name==='NotAllowedError'?'Microphone access was denied. Allow microphone access in your browser and retry.':'Could not start the microphone. Check your microphone and browser settings.');}}
  }
  const active=phase!=='idle';
  return <div className="speech-input">
    <div className="speech-toolbar">
      {phase==='recording'?<button type="button" className="secondary-button recording" onClick={()=>recorder.current?.stop()}><Square size={14}/>Stop & transcribe · {seconds}s</button>:<button type="button" className="text-button" disabled={disabled||active||!!transcript} onClick={()=>void start()}>{active?<LoaderCircle size={14} className="spin"/>:<Mic size={14}/>} {phase==='transcribing'?'Transcribing…':phase==='starting'?'Opening microphone…':'Dictate'}</button>}
      {active?<button type="button" className="text-button" onClick={cancel}><X size={14}/>Cancel dictation</button>:<button type="button" className="text-button" aria-label="Voice settings" onClick={()=>{setDraft(key);setSettings(!settings);}}><Settings2 size={13}/>ElevenLabs {key?'key set':'settings'}</button>}
      {status&&<span className="speech-status" role="status">{status}</span>}
    </div>
    {settings&&<div className="speech-settings"><label htmlFor="speech-key">ElevenLabs API key</label><input id="speech-key" type="password" autoComplete="off" spellCheck={false} value={draft} disabled={active} onChange={e=>setDraft(e.target.value)} placeholder="Paste your Speech to Text API key"/><p>Key and recordings stay in app memory. Stop sends audio to ElevenLabs Scribe v2; provider retention and credit usage apply. Refresh clears the key.</p><div className="speech-toolbar"><button type="button" className="secondary-button" disabled={active||!draft.trim()||draft.length>4096} onClick={()=>{setKey(draft.trim());setDraft('');setSettings(false);setStatus('Voice key set for this session. Tap Dictate when ready.');}}>Use voice key</button>{key&&<button type="button" className="text-button" disabled={active} onClick={()=>{setKey('');setDraft('');setSettings(false);setStatus('Voice key cleared.');}}>Disconnect voice</button>}<button type="button" className="text-button" onClick={()=>{setDraft('');setSettings(false);}}>Close voice settings</button></div></div>}
    {transcript&&<div className="speech-transcript"><label htmlFor="voice-transcript">Review transcript</label><textarea id="voice-transcript" value={transcript} maxLength={12000} onChange={e=>setTranscript(e.target.value)}/><div className="speech-toolbar"><button type="button" className="secondary-button" disabled={disabled||!transcript.trim()} onClick={()=>{if(!callbacks.current.onText(transcript.trim())){setStatus('Prompt is too long. Shorten the transcript or existing prompt to fit 3,000 characters.');return;}setTranscript('');setStatus('Transcript added. Review the prompt, then Ask AI.');}}>Add to prompt</button><button type="button" className="text-button" onClick={()=>{setTranscript('');setStatus('Transcript discarded.');}}>Discard transcript</button></div></div>}
  </div>;
}
