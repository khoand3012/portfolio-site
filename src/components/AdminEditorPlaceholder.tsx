'use client';

import { useState } from 'react';
import { saveContentAction } from '../../app/admin/actions';
import type { PortfolioData } from '../types';

interface Props {
  initialData: PortfolioData;
}

export function AdminEditorPlaceholder({ initialData }: Props) {
  const [text, setText] = useState(JSON.stringify(initialData, null, 2));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );

  async function handleSave() {
    setStatus('saving');
    try {
      const parsed = JSON.parse(text) as PortfolioData;
      await saveContentAction(parsed);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={30}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />
      <button type="button" onClick={handleSave}>
        Save
      </button>
      {status === 'saving' && <p>Saving…</p>}
      {status === 'saved' && <p>Saved.</p>}
      {status === 'error' && <p>Save failed — check the JSON is valid.</p>}
    </div>
  );
}
