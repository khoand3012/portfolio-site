import type { ReactNode } from 'react';
import type { BulletsBlock } from '../types';

interface Props {
  /**
   * Stored items are sanitized HTML strings — but inside the Puck editor
   * each one arrives as a React element instead, because Puck's richtext
   * field transform swaps it for the inline editor before this component
   * renders (see the same note in Text.tsx). Rendering that element as
   * innerHTML yields the literal text "[object Object]".
   *
   * `BulletsBlock.items` itself stays `string[]`, so nothing about the
   * stored model, the save guard or the sanitizer is loosened.
   */
  block: Omit<BulletsBlock, 'items'> & { items: ReactNode[] };
}

export function Bullets({ block }: Props) {
  if (block.items.length === 0) return null;
  return (
    <ul className="bullet-list">
      {block.items.map((item, i) =>
        typeof item === 'string' ? (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Static content list rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
            key={i}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: each item is stored content, reduced to a small tag allow-list by src/lib/sanitizeBlocks.ts at save time — see that module and the spec's "Rich text" section.
            dangerouslySetInnerHTML={{ __html: item }}
          />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same rationale as the string branch above.
          <li key={i}>{item}</li>
        ),
      )}
    </ul>
  );
}
