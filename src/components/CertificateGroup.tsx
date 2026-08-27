import type { CertificateGroupBlock } from '../types';

interface Props {
  group: CertificateGroupBlock;
}

export function CertificateGroup({ group }: Props) {
  return (
    <div className="block-card">
      <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>{group.heading}</h3>
      <div className="tag-row">
        {group.certificates.map((cert, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static content list rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
          <span key={i} className={`tag${cert.accent ? ' accent' : ''}`}>
            {cert.text}
          </span>
        ))}
      </div>
    </div>
  );
}
