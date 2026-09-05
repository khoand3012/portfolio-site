import type { ReactNode } from 'react';
import type { TextBlock } from '../types';

interface Props {
  /**
   * `html` is the stored sanitized HTML string on the public page — but NOT
   * inside the Puck editor. Puck's richtext field transform replaces the
   * stored string with a React element (the inline editor) before calling
   * this component's render, and it does so in BOTH of its branches, so
   * `contentEditable: false` is not an opt-out — see `getRichTextTransform`
   * in `node_modules/@puckeditor/core/dist/index.js`. Injecting that element
   * as innerHTML renders the literal text "[object Object]" on the editor
   * canvas, which is exactly what this widened type exists to prevent.
   *
   * The stored content model is unaffected: `TextBlock.html` stays a plain
   * `string`, so the save path, the shape guard and the sanitizer all keep
   * their strict types. Only this render boundary is widened.
   */
  block: Omit<TextBlock, 'html'> & { html: ReactNode };
}

const VARIANT_CLASS: Record<TextBlock['variant'], string> = {
  body: 'text-body',
  subtitle: 'text-subtitle',
  small: 'text-small',
};

export function Text({ block }: Props) {
  const className = VARIANT_CLASS[block.variant];

  if (typeof block.html !== 'string') {
    return <div className={className}>{block.html}</div>;
  }

  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: block.html is stored content, reduced to a small tag allow-list by src/lib/sanitizeBlocks.ts at save time — see that module and the spec's "Rich text" section. This is an enforced invariant, not a trusted-input assumption.
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
}
