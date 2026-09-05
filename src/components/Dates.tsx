import type { DatesBlock } from '../types';

interface Props {
  block: DatesBlock;
}

export function Dates({ block }: Props) {
  return <span className="dates">{block.text}</span>;
}
