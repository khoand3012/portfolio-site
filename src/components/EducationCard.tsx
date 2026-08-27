import type { Education } from '../types';

interface Props {
  ed: Education;
}

export function EducationCard({ ed }: Props) {
  return (
    <div className="block-card">
      <div className="block-title-row">
        <h3>{ed.school}</h3>
        <span className="dates">{ed.dates}</span>
      </div>
      <p className="role">{ed.degree}</p>
      <ul>
        {(ed.bullets || []).map((bullet, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static content list rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
          <li key={i}>{bullet}</li>
        ))}
        {ed.dissertation && (
          <li>
            Dissertation: <i>{ed.dissertation}</i>.
          </li>
        )}
      </ul>
    </div>
  );
}
