import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  it('composes one class per layout value', () => {
    const { container } = render(
      <Container
        direction="grid"
        gap="md"
        padding="lg"
        marginBottom="none"
        align="baseline"
        justify="between"
        columns="auto"
        wrap={true}
        surface="card"
      >
        <span>child</span>
      </Container>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className.split(' ')).toEqual(
      expect.arrayContaining([
        'layout',
        'layout-dir-grid',
        'layout-gap-md',
        'layout-p-lg',
        'layout-mb-none',
        'layout-align-baseline',
        'layout-justify-between',
        'layout-cols-auto',
        'layout-wrap',
        'layout-surface-card',
      ]),
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('omits the wrap class when wrap is false', () => {
    const { container } = render(
      <Container
        direction="row"
        gap="sm"
        padding="none"
        marginBottom="none"
        align="start"
        justify="start"
        columns="auto"
        wrap={false}
        surface="none"
      >
        <span>c</span>
      </Container>,
    );
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).not.toContain('layout-wrap');
  });
});
