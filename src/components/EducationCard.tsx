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
