import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../app/admin/actions', () => ({ saveTabsAction: vi.fn() }));

import { saveTabsAction } from '../../app/admin/actions';
import type { Tab } from '../types';
import { TabManager } from './TabManager';

const tabs: Tab[] = [
  { id: 'teaching', label: 'Teaching', blocks: [] },
  { id: 'media', label: 'Media', blocks: [] },
];

describe('TabManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveTabsAction).mockResolvedValue(tabs);
  });

  it('publishes a rename', async () => {
    const user = userEvent.setup();
    render(<TabManager tabs={tabs} />);
    const input = screen.getByLabelText('Tab 1 label');
    await user.clear(input);
    await user.type(input, 'Teaching & Training');
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));
    expect(saveTabsAction).toHaveBeenCalledWith([
      { id: 'teaching', label: 'Teaching & Training' },
      { id: 'media', label: 'Media' },
    ]);
  });

  it('publishes a reorder', async () => {
    const user = userEvent.setup();
    render(<TabManager tabs={tabs} />);
    await user.click(screen.getByRole('button', { name: 'Move Media up' }));
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));
    expect(saveTabsAction).toHaveBeenCalledWith([
      { id: 'media', label: 'Media' },
      { id: 'teaching', label: 'Teaching' },
    ]);
  });

  it('adds a tab with a fresh id the server has never seen', async () => {
    const user = userEvent.setup();
    render(<TabManager tabs={tabs} />);
    await user.click(screen.getByRole('button', { name: '+ Add tab' }));
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));
    const sent = vi.mocked(saveTabsAction).mock.calls[0]?.[0] ?? [];
    expect(sent).toHaveLength(3);
    expect(sent[2]?.label).toBe('New tab');
    expect(sent[2]?.id).not.toBe('teaching');
    expect(sent[2]?.id).not.toBe('media');
  });

  // The destructive step is deliberately two clicks: the first arms it and
  // names the tab, the second commits. A single-click remove on a row that
  // carries an entire section's content is too easy to hit by accident.
  it('does not remove a tab on the first click', async () => {
    const user = userEvent.setup();
    render(<TabManager tabs={tabs} />);
    await user.click(screen.getByRole('button', { name: 'Remove Teaching' }));
    expect(screen.getByLabelText('Tab 1 label')).toHaveValue('Teaching');
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));
    expect(saveTabsAction).toHaveBeenCalledWith([
      { id: 'teaching', label: 'Teaching' },
      { id: 'media', label: 'Media' },
    ]);
  });

  it('removes the tab on the confirming click and warns before publishing', async () => {
    const user = userEvent.setup();
    render(<TabManager tabs={tabs} />);
    await user.click(screen.getByRole('button', { name: 'Remove Teaching' }));
    await user.click(
      screen.getByRole('button', { name: /Delete .Teaching. and its content/ }),
    );
    expect(
      screen.getByText(/permanently remove 1 tab and all of its content/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));
    expect(saveTabsAction).toHaveBeenCalledWith([
      { id: 'media', label: 'Media' },
    ]);
  });

  it('surfaces a failed save without dropping the edits', async () => {
    const user = userEvent.setup();
    vi.mocked(saveTabsAction).mockRejectedValue(new Error('Not authorized.'));
    render(<TabManager tabs={tabs} />);
    await user.click(screen.getByRole('button', { name: 'Move Media up' }));
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));
    // The reordered rows survive the failure, so the owner can retry rather
    // than redo the work.
    expect(screen.getByLabelText('Tab 1 label')).toHaveValue('Media');
    expect(screen.getByRole('button', { name: 'Publish tabs' })).toBeEnabled();
  });

  // The admin shell must not wait for a server round-trip to show the new tab
  // list: router.refresh() re-renders the server component, but nothing in the
  // client guarantees that lands before the owner looks at the tab bar. The
  // action returns the reconciled tabs, and the shell takes them directly.
  it('hands the saved tab list back to the shell on success', async () => {
    const user = userEvent.setup();
    const saved: Tab[] = [
      { id: 'teaching', label: 'Teaching', blocks: [] },
      { id: 'media', label: 'Media', blocks: [] },
      { id: 'new-id', label: 'Awards', blocks: [] },
    ];
    vi.mocked(saveTabsAction).mockResolvedValue(saved);
    const onSaved = vi.fn();

    render(<TabManager tabs={tabs} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: '+ Add tab' }));
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));

    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('does not hand back a tab list when the save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(saveTabsAction).mockRejectedValue(new Error('Not authorized.'));
    const onSaved = vi.fn();

    render(<TabManager tabs={tabs} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Publish tabs' }));

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables the move buttons at the ends of the list', () => {
    render(<TabManager tabs={tabs} />);
    expect(
      screen.getByRole('button', { name: 'Move Teaching up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Media down' }),
    ).toBeDisabled();
  });
});
