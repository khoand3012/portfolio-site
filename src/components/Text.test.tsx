import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders allowed markup as elements', () => {
    const { container } = render(
      <Text
        block={{
          type: 'text',
          html: '<p>a <strong>b</strong></p>',
          variant: 'body',
        }}
      />,
    );
    expect(container.querySelector('strong')).not.toBeNull();
  });

  // Inside the Puck editor `html` is NOT the stored string: Puck's richtext
  // field transform swaps it for a React element (the inline editor) before
  // calling this component — getRichTextTransform returns an element in both
  // its branches, so `contentEditable: false` does not opt out. Injecting
  // that as innerHTML renders the literal text "[object Object]".
  it('renders a React node value as a child rather than as innerHTML', () => {
    const { container } = render(
      <Text
        block={
          {
            type: 'text',
            html: <em>inline editor</em>,
            variant: 'body',
          } as never
        }
      />,
    );
    expect(screen.getByText('inline editor').tagName).toBe('EM');
    expect(container.textContent).not.toContain('[object Object]');
  });

  it('renders escaped metacharacters as visible text, not markup', () => {
    const { container } = render(
      <Text
        block={{
          type: 'text',
          html: '<p>5 &lt; 10 &amp; rising</p>',
          variant: 'small',
        }}
      />,
    );
    expect(screen.getByText('5 < 10 & rising')).toBeInTheDocument();
    expect(container.querySelector('.text-small')).not.toBeNull();
  });
});
