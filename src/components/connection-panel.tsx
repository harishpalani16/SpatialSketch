'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, Upload, X } from 'lucide-react';
import type { Connection } from '@/lib/api-server';

type Props = { value: Connection; verified: boolean; onClose: () => void; onUse: (value: Connection, verified: boolean) => void; onDisconnect: () => void };
export default function ConnectionPanel({ value, verified, onClose, onUse, onDisconnect }: Props) {
  const [form, setForm] = useState(value);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState(verified ? 'Connected successfully.' : '');
  const [good, setGood] = useState(verified);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { dialog.current?.showModal(); return () => request.current?.abort(); }, []);
  function update(field: keyof Connection, text: string) { setForm(f => ({ ...f, [field]: text })); setGood(false); setStatus(''); }
  async function test() {
    setBusy(true); setStatus(''); setGood(false); request.current = new AbortController();
    try {
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'test', connection: form }), signal: request.current.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Connection failed.');
      setGood(true); setStatus('Connected successfully. Ready to interpret your sketches.');
    } catch (error) { if (!request.current.signal.aborted) setStatus(error instanceof Error ? error.message : 'Connection failed.'); }
    finally { setBusy(false); }
  }
  async function load(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return;
    try {
      if (selected.size > 16000) throw new Error('Use a settings JSON file smaller than 16 KB.');
      const parsed = JSON.parse(await selected.text());
      if (!['endpoint', 'model', 'key'].every(k => typeof parsed[k] === 'string' && parsed[k].trim()) || parsed.key.length > 4096) throw new Error('The JSON file needs endpoint, model, and key fields.');
      setForm({ endpoint: parsed.endpoint, model: parsed.model, key: parsed.key }); setGood(false); setStatus('Settings loaded into this session. Test the connection when ready.');
    } catch (error) { setGood(false); setStatus(error instanceof Error ? error.message : 'Could not read settings.'); }
  }
  const ready = !!form.endpoint.trim() && !!form.model.trim() && !!form.key.trim();
  return <dialog className="connection-dialog" ref={dialog} aria-labelledby="connection-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-heading"><div className="dialog-icon"><KeyRound size={22} /></div><button className="icon-button" aria-label="Close API settings" onClick={onClose}><X size={20} /></button></div>
    <span className="eyebrow">YOUR KEY. YOUR SESSION.</span><h2 id="connection-title">Connect your AI.</h2><p className="dialog-intro">Bring your API to the studio. Your key stays in memory and clears when you refresh.</p>
    <form onSubmit={e => { e.preventDefault(); if (ready && !busy) onUse({ endpoint: form.endpoint.trim(), model: form.model.trim(), key: form.key.trim() }, good); }} autoComplete="off">
      <label className="field-label" htmlFor="api-endpoint">Chat Completions endpoint</label><input id="api-endpoint" type="url" required value={form.endpoint} onChange={e => update('endpoint', e.target.value)} placeholder="https://your-provider.com/v1/chat/completions" autoComplete="off" spellCheck={false} disabled={busy} />
      <label className="field-label" htmlFor="api-model">Model name</label><input id="api-model" required value={form.model} onChange={e => update('model', e.target.value)} placeholder="Exact model ID from your provider" autoComplete="off" spellCheck={false} disabled={busy} />
      <label className="field-label" htmlFor="api-key">API key</label><div className="password-field"><input id="api-key" type={visible ? 'text' : 'password'} required value={form.key} onChange={e => update('key', e.target.value)} placeholder="Paste your key" autoComplete="off" spellCheck={false} disabled={busy} /><button type="button" aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      <div className="provider-note">Using IFM? Copy the endpoint and model ID from your API account. This prototype uses text and vector sketch context through a compatible Chat Completions API.</div>
      <div className="connection-actions"><button type="button" className="secondary-button" onClick={test} disabled={!ready || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} {busy ? 'Testing…' : 'Test connection'}</button><button type="button" className="text-button" onClick={() => file.current?.click()} disabled={busy}><Upload size={15} /> Load JSON</button></div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={load} />
      {status && <p role="status" className={'connection-status ' + (good ? 'success' : '')}>{status}</p>}
      <div className="dialog-footer">{value.key && <button type="button" className="text-button" disabled={busy} onClick={onDisconnect}>Disconnect</button>}<button type="submit" className="primary-button" disabled={!ready || busy}>Use for this session <Check size={16} /></button></div>
    </form>
  </dialog>;
}
