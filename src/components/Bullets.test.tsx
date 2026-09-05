import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Bullets } from './Bullets';

// Bullets is one of only two components that render stored content with
// dangerouslySetInnerHTML (Text is the other). What makes that safe is
// src/lib/sanitizeBlocks.ts running at the save boundary — but the escaping
// half matters here too: a bullet reading "5 < 10" is stored as "5 &lt; 10"
// and must reach the page as visible text, not as a broken tag.
describe('Bullets', () => {
  it('renders allowed inline markup as elements', () => {
    const { container } = render(
      <Bullets
        block={{
          type: 'bullets',
          items: ['<p>Grew the <strong>team</strong>.</p>'],
        }}
      />,
    );
    expect(within(container).getByText('team').tagName).toBe('STRONG');
  });

  it('renders escaped metacharacters as visible text, not markup', () => {
    const { container } = render(
      <Bullets
        block={{
          type: 'bullets',
          items: ['<p>Scaled 5 &lt; 10 teams &amp; shipped.</p>'],
        }}
      />,
    );
    expect(
      within(container).getByText('Scaled 5 < 10 teams & shipped.'),
    ).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders one list item per entry', () => {
    const { container } = render(
      <Bullets
        block={{ type: 'bullets', items: ['<p>One</p>', '<p>Two</p>'] }}
      />,
    );
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  // Inside the Puck editor a bullet item is NOT the stored string: Puck's
  // richtext field transform swaps it for a React element (the inline
  // editor) before calling this component. Injecting that as innerHTML
  // renders the literal text "[object Object]" on the editor canvas.
  it('renders a React node item as a child rather than as innerHTML', () => {
    const { container } = render(
      <Bullets
        block={{
          type: 'bullets',
          items: [<em key="a">inline editor</em>] as never,
        }}
      />,
    );
    expect(within(container).getByText('inline editor').tagName).toBe('EM');
    expect(container.textContent).not.toContain('[object Object]');
  });

  it('renders nothing at all when there are no items', () => {
    // Not an empty <ul>: an empty list still draws list padding, so a
    // bullets block the owner has not filled in yet would leave a gap.
    const { container } = render(
      <Bullets block={{ type: 'bullets', items: [] }} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
