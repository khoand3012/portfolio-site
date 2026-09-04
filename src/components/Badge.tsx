import type { BadgeBlock } from '../types';

interface Props {
  block: BadgeBlock;
}

export function Badge({ block }: Props) {
  return (
    <span className={`tag${block.accent ? ' accent' : ''}`}>
      {block.year && <span className="tag-year">{block.year}</span>}
      {block.text}
    </span>
  );
}
