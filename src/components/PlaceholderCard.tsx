import type { PlaceholderEntry } from '../types';

interface Props {
  item: PlaceholderEntry;
}

export function PlaceholderCard({ item }: Props) {
  return (
    <div className="placeholder card">
      <h3>{item.company}</h3>
      <p>{item.note}</p>
    </div>
  );
}
