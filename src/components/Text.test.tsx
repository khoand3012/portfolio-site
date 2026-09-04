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
