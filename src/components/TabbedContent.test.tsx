import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TabbedContent } from './TabbedContent';

describe('TabbedContent', () => {
  it('shows only the first tab active on load, and switches on click', async () => {
    const user = userEvent.setup();
    render(
      <TabbedContent
        tabs={[
          {
            slug: 'a',
            label: 'A',
            blocks: [{ type: 'note', text: 'Panel A' }],
          },
          {
            slug: 'b',
            label: 'B',
            blocks: [{ type: 'note', text: 'Panel B' }],
          },
        ]}
      />,
    );

    expect(document.getElementById('tab-a')).toHaveClass('active');
    expect(document.getElementById('tab-b')).not.toHaveClass('active');

    await user.click(screen.getByRole('button', { name: 'B' }));

    expect(document.getElementById('tab-a')).not.toHaveClass('active');
    expect(document.getElementById('tab-b')).toHaveClass('active');
  });
});
