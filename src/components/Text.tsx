import type { TextBlock } from '../types';

interface Props {
  block: TextBlock;
}

const VARIANT_CLASS: Record<TextBlock['variant'], string> = {
  body: 'text-body',
  subtitle: 'text-subtitle',
  small: 'text-small',
};

export function Text({ block }: Props) {
  return (
    <div
      className={VARIANT_CLASS[block.variant]}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: block.html is stored content, reduced to a small tag allow-list by src/lib/sanitizeBlocks.ts at save time — see that module and the spec's "Rich text" section. This is an enforced invariant, not a trusted-input assumption.
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
}
