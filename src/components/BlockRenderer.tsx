import type { Block } from '../types';
import { CertificateGroup } from './CertificateGroup';
import { EducationCard } from './EducationCard';
import { GalleryTile } from './GalleryTile';
import { JobCard } from './JobCard';
import { Note } from './Note';
import { PlaceholderCard } from './PlaceholderCard';

interface Props {
  block: Block;
}

export function BlockRenderer({ block }: Props) {
  switch (block.type) {
    case 'job':
      return <JobCard job={block} />;
    case 'placeholder':
      return <PlaceholderCard item={block} />;
    case 'education':
      return <EducationCard ed={block} />;
    case 'certificate-group':
      return <CertificateGroup group={block} />;
    case 'gallery-item':
      return <GalleryTile item={block} />;
    case 'note':
      return <Note text={block.text} />;
    default: {
      // Exhaustiveness check: a new Block variant with no case here is a compile error.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
