import type { BulletsBlock } from '../types';

interface Props {
  block: BulletsBlock;
}

export function Bullets({ block }: Props) {
  if (block.items.length === 0) return null;
  return (
    <ul className="bullet-list">
      {block.items.map((item, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: Static content list rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
          key={i}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: each item is stored content, reduced to a small tag allow-list by src/lib/sanitizeBlocks.ts at save time — see that module and the spec's "Rich text" section.
          dangerouslySetInnerHTML={{ __html: item }}
        />
      ))}
    </ul>
  );
}
