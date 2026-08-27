import type { Job } from '../types';

interface Props {
  job: Job;
}

export function JobCard({ job }: Props) {
  return (
    <div className="block-card">
      <div className="block-title-row">
        <h3>{job.company}</h3>
        <span className="dates">{job.dates}</span>
      </div>
      {job.role && <p className="role">{job.role}</p>}
      {job.bullets && job.bullets.length > 0 && (
        <ul>
          {job.bullets.map((bullet, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static content list rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
