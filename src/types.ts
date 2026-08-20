// Shape of content/portfolio.json. Keep in sync with that file and with
// public/admin/config.yml's field names — see CLAUDE.md.

export interface Job {
  company: string;
  dates: string;
  role?: string;
  bullets?: string[];
}

export interface PlaceholderEntry {
  company: string;
  note: string;
}

export interface Education {
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

export type GalleryItemType = 'photo' | 'video';

export interface GalleryItem {
  type: GalleryItemType;
  image?: string;
  videoUrl?: string;
}

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

export interface TeachingTab {
  label: string;
  jobs: Job[];
  placeholders: PlaceholderEntry[];
}

export interface InternationalEducationTab {
  label: string;
  jobs: Job[];
}

export interface TestingTab {
  label: string;
  certificates: Certificate[];
  jobs: Job[];
  emptyNote: string;
}

export interface AcademicBackgroundTab {
  label: string;
  education: Education[];
}

export interface EmptyNoteTab {
  label: string;
  emptyNote: string;
}

export interface MediaTab {
  label: string;
  items: GalleryItem[];
}

export interface PortfolioData {
  hero: Hero;
  tabs: {
    teaching: TeachingTab;
    internationalEducation: InternationalEducationTab;
    testing: TestingTab;
    academicBackground: AcademicBackgroundTab;
    publications: EmptyNoteTab;
    talks: EmptyNoteTab;
    media: MediaTab;
  };
  footer: string;
}
