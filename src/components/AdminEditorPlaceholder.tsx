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
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSave() {
    setStatus('saving');

    // Parsing and saving fail for different reasons, and this placeholder is
    // likely the only diagnostic surface available the first time this ships
    // to a real environment — keep the messages distinct rather than
    // collapsing both into one generic "save failed".
    let parsed: PortfolioData;
    try {
      parsed = JSON.parse(text) as PortfolioData;
    } catch {
      setErrorMessage("Save failed — the text isn't valid JSON.");
      setStatus('error');
      return;
    }

    try {
      await saveContentAction(parsed);
      setStatus('saved');
    } catch (error) {
      setErrorMessage(
        `Save failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
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
      {status === 'error' && <p>{errorMessage}</p>}
    </div>
  );
}
