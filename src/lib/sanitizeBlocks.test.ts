import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { sanitizeBlocks } from './sanitizeBlocks';

const container = (children: Block[]): Block => ({
  type: 'container',
  children,
  direction: 'stack',
  gap: 'md',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'none',
});

const text = (html: string): Block => ({
  type: 'text',
  html,
  variant: 'body',
});

describe('sanitizeBlocks', () => {
  it('strips script tags, event handlers, styles and unknown tags', () => {
    const [block] = sanitizeBlocks([
      text(
        '<p>Hi<script>alert(1)</script></p>' +
          '<p onclick="steal()">Click</p>' +
          '<p style="color:red">Red</p>' +
          '<iframe src="https://evil.example"></iframe>',
      ),
    ]);
    const html = (block as { html: string }).html;
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style');
    expect(html).not.toContain('iframe');
    expect(html).toContain('Hi');
    expect(html).toContain('Click');
  });

  it('keeps the allowed inline markup', () => {
    const [block] = sanitizeBlocks([
      text('<p><strong>Bold</strong> <em>italic</em> <u>under</u></p>'),
    ]);
    expect((block as { html: string }).html).toBe(
      '<p><strong>Bold</strong> <em>italic</em> <u>under</u></p>',
    );
  });

  it('keeps safe links, adds rel=noopener, and drops javascript: hrefs', () => {
    const [safe] = sanitizeBlocks([
      text('<p><a href="https://example.com">go</a></p>'),
    ]);
    expect((safe as { html: string }).html).toContain('rel="noopener"');
    expect((safe as { html: string }).html).toContain(
      'href="https://example.com"',
    );

    const [unsafe] = sanitizeBlocks([
      text('<p><a href="javascript:alert(1)">go</a></p>'),
    ]);
    expect((unsafe as { html: string }).html).not.toContain('javascript:');
  });

  it('sanitizes bullet items', () => {
    const [block] = sanitizeBlocks([
      { type: 'bullets', items: ['<p>ok<script>bad()</script></p>'] },
    ]);
    expect((block as { items: string[] }).items[0]).toBe('<p>ok</p>');
  });

  it('sanitizes nested containers at every depth', () => {
    const result = sanitizeBlocks([
      container([container([text('<p>deep<script>x</script></p>')])]),
    ]);
    const outer = result[0] as { children: Block[] };
    const inner = outer.children[0] as { children: Block[] };
    expect((inner.children[0] as { html: string }).html).toBe('<p>deep</p>');
  });

  it('leaves plain-text fields untouched', () => {
    const blocks: Block[] = [
      { type: 'heading', text: 'A <b>literal</b> title', level: 'h3' },
      { type: 'dates', text: '2020 – 2021' },
      { type: 'badge', text: 'IELTS 8.0', accent: true, year: '2025' },
      { type: 'image', src: 'x.jpg', alt: 'a <b>', caption: 'c & d' },
    ];
    expect(sanitizeBlocks(blocks)).toEqual(blocks);
  });

  it('does not mutate its input', () => {
    const input = [text('<p>hi<script>x</script></p>')];
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizeBlocks(input);
    expect(input).toEqual(snapshot);
  });
});
