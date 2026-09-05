import type { HeadingBlock } from '../types';

interface Props {
  block: HeadingBlock;
}

export function Heading({ block }: Props) {
  const Tag = block.level;
  return <Tag className="block-heading">{block.text}</Tag>;
}
