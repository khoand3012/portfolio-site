'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveTabsAction } from '../../app/admin/actions';
import { toast } from '../lib/use-toast';
import type { Tab } from '../types';
import { TRASH_ICON } from './icons';

interface Props {
  tabs: Tab[];
  /**
   * Handed the reconciled tab list the server actually saved, so the admin
   * shell can render the new tab bar immediately instead of waiting on
   * router.refresh() to deliver fresh server props.
   */
  onSaved?: (tabs: Tab[]) => void;
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
export function TabManager({ tabs, onSaved }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    tabs.map((t) => ({ id: t.id, label: t.label })),
  );
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Index of the row being dragged. Kept in React state rather than read back
  // out of dataTransfer: dataTransfer is unreadable during dragover in most
  // browsers (only the drop event may read it), and jsdom does not implement
  // it at all, so this is both the portable and the testable choice.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

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

  function moveRowTo(from: number, to: number) {
    setRows((current) => {
      if (from === to || from < 0 || to < 0) return current;
      if (from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(to, 0, moved);
      return next;
    });
  }

  function endDrag() {
    setDragIndex(null);
    setDropIndex(null);
  }

  async function publish() {
    setSaving(true);
    try {
      const saved = await saveTabsAction(
        rows.map(({ id, label }) => ({ id, label })),
      );
      toast({ description: 'Tabs saved.' });
      onSaved?.(saved);
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
        Drag a row by its handle to reorder, or use the arrows. Add, rename and
        remove the sections of the public page here too — nothing changes until
        you publish.
      </p>

      <ul className="tab-manager-list">
        {rows.map((row, i) => (
          <li
            key={row.id}
            className={`tab-manager-row${dragIndex === i ? ' dragging' : ''}${
              dropIndex === i && dragIndex !== i ? ' drop-target' : ''
            }`}
            // The row is the drop target; only the handle starts a drag, so
            // dragging inside the label input still selects text.
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setDropIndex(i);
            }}
            onDrop={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              moveRowTo(dragIndex, i);
              endDrag();
            }}
          >
            <span
              className="tab-manager-handle"
              draggable
              title="Drag to reorder"
              aria-hidden="true"
              onDragStart={(e) => {
                setDragIndex(i);
                // Firefox refuses to start a drag unless data is set, and
                // some browsers show a copy cursor without effectAllowed.
                e.dataTransfer?.setData('text/plain', String(i));
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={endDrag}
            >
              ⠿
            </span>
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
              // Icon-only: aria-label is what names it, since the glyph is
              // aria-hidden. The CONFIRM step above stays full text on
              // purpose — an icon is fine for arming a delete, but the step
              // that actually discards a tab's content should say so in words.
              <button
                type="button"
                className="tab-manager-remove"
                aria-label={`Remove ${row.label}`}
                title={`Remove ${row.label}`}
                onClick={() => setArmedDeleteId(row.id)}
              >
                {TRASH_ICON}
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
