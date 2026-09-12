'use client';

import { useEffect, useState } from 'react';
export default function NumberField({ label, value, min, max, step = 0.1, unit = 'm', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function commit() {
    const n = Number(text);
    if (!text.trim() || !Number.isFinite(n) || n < min || n > max || (step === 1 && !Number.isInteger(n))) { setText(String(value)); return; }
    if (n !== value) onChange(n);
  }
  return <label className="number-field"><span>{label}</span><div><input aria-label={label} type="number" inputMode="decimal" min={min} max={max} step={step} value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /><span>{unit}</span></div></label>;
}
