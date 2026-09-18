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
            blocks: [{ type: 'heading', text: 'Panel A', level: 'h3' }],
          },
          {
            slug: 'b',
            label: 'B',
            blocks: [{ type: 'heading', text: 'Panel B', level: 'h3' }],
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

describe('TabbedContent media lightbox', () => {
  // The provider has to sit here rather than in BlockRenderer so one overlay
  // serves every tab, and so it exists on the public page only.
  it('opens a preview from a photo tile', async () => {
    const user = userEvent.setup();
    render(
      <TabbedContent
        tabs={[
          {
            slug: 'media',
            label: 'Photos',
            blocks: [
              {
                type: 'image',
                src: 'https://cdn.example/a.jpg',
                alt: 'A photo',
                caption: 'On stage',
              },
            ],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /view a photo/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
