'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveTabsAction } from '../../app/admin/actions';
import { toast } from '../lib/use-toast';
import type { Tab } from '../types';

interface Props {
  tabs: Tab[];
}

interface Row {
  id: string;
  label: string;
}

// Deleting a tab discards its blocks, so the row asks for a second click
// rather than firing on the first. A native confirm() would block the whole
// admin panel and reads as a browser alert rather than part of the page; an
// arm-then-confirm button keeps the destructive step inside the UI and
// names the tab it is about to remove.
export function TabManager({ tabs }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    tabs.map((t) => ({ id: t.id, label: t.label })),
  );
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Ids are generated here rather than server-side so a new row can be
  // keyed, renamed and reordered before the save round-trips. saveTabsAction
  // treats an id its document doesn't know as "create this tab".
  function addTab() {
    setRows((current) => [
      ...current,
      { id: crypto.randomUUID(), label: 'New tab' },
    ]);
  }

  function renameTab(id: string, label: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, label } : row)),
    );
  }

  function moveTab(index: number, delta: number) {
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  function deleteTab(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setArmedDeleteId(null);
  }

  async function publish() {
    setSaving(true);
    try {
      await saveTabsAction(rows.map(({ id, label }) => ({ id, label })));
      toast({ description: 'Tabs saved.' });
      // Same reason handlePublish refreshes: `tabs` came from a
      // server-fetched prop that does not update itself, and a newly
      // created tab has to exist in that data before its editor can open.
      router.refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  }

  const deletedCount = tabs.filter(
    (tab) => !rows.some((row) => row.id === tab.id),
  ).length;

  return (
    <div className="wrap tab-manager">
      <h2>Tabs</h2>
      <p className="tab-manager-hint">
        Add, rename, reorder or remove the sections of the public page. Nothing
        changes until you publish.
      </p>

      <ul className="tab-manager-list">
        {rows.map((row, i) => (
          <li key={row.id} className="tab-manager-row">
            <input
              type="text"
              aria-label={`Tab ${i + 1} label`}
              value={row.label}
              onChange={(e) => renameTab(row.id, e.target.value)}
            />
            <button
              type="button"
              aria-label={`Move ${row.label} up`}
              disabled={i === 0}
              onClick={() => moveTab(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${row.label} down`}
              disabled={i === rows.length - 1}
              onClick={() => moveTab(i, 1)}
            >
              ↓
            </button>
            {armedDeleteId === row.id ? (
              <button
                type="button"
                className="tab-manager-confirm"
                onClick={() => deleteTab(row.id)}
              >
                Delete “{row.label}” and its content?
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Remove ${row.label}`}
                onClick={() => setArmedDeleteId(row.id)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="tab-manager-actions">
        <button type="button" onClick={addTab}>
          + Add tab
        </button>
        <button type="button" onClick={publish} disabled={saving}>
          {saving ? 'Publishing…' : 'Publish tabs'}
        </button>
      </div>

      {deletedCount > 0 && (
        <p className="tab-manager-warning">
          Publishing will permanently remove {deletedCount} tab
          {deletedCount === 1 ? '' : 's'} and all of{' '}
          {deletedCount === 1 ? 'its' : 'their'} content.
        </p>
      )}
    </div>
  );
}
