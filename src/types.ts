// Shape of content/portfolio.json. Keep in sync with that file — see CLAUDE.md.

export interface Job {
  type: 'job';
  company: string;
  dates: string;
  role?: string;
  bullets?: string[];
}

export interface PlaceholderEntry {
  type: 'placeholder';
  company: string;
  note: string;
}

export interface Education {
  type: 'education';
  school: string;
  dates: string;
  degree: string;
  bullets?: string[];
  dissertation?: string;
}

export interface Certificate {
  text: string;
  accent?: boolean;
}

export interface CertificateGroupBlock {
  type: 'certificate-group';
  heading: string;
  certificates: Certificate[];
}

export type GalleryItemType = 'photo' | 'video';

export interface GalleryItemBlock {
  type: 'gallery-item';
  itemType: GalleryItemType;
  image?: string;
  videoUrl?: string;
}

export interface NoteBlock {
  type: 'note';
  text: string;
}

export type Block =
  | Job
  | PlaceholderEntry
  | Education
  | CertificateGroupBlock
  | GalleryItemBlock
  | NoteBlock;

export interface Hero {
  name: string;
  initials: string;
  role: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  location?: string;
  profile: string;
}

export interface Tab {
  label: string;
  blocks: Block[];
}

export interface PortfolioData {
  hero: Hero;
  tabs: {
    teaching: Tab;
    internationalEducation: Tab;
    testing: Tab;
    academicBackground: Tab;
    publications: Tab;
    talks: Tab;
    media: Tab;
  };
  footer: string;
}
