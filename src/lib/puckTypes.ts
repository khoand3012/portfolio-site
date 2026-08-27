// src/lib/puckTypes.ts
//
// Single source of truth for Puck's component Props shape, shared between
// puck.config.tsx (the real Puck component config passed to <Puck>) and
// src/lib/puckAdapter.ts (converts between this app's Block[] content model
// and Puck's own Data format). Both files import this as a type-only
// import — erased at compile time, so it adds no runtime coupling between
// the two files — instead of each keeping its own hand-written copy of the
// same shape.
//
// Before this file existed, puckAdapter.ts's PuckComponentProps was a
// hand-written duplicate of puck.config.tsx's Props, with a comment
// admitting tsc could not catch drift between them: renaming a component in
// puck.config.tsx (e.g. GalleryItem -> Gallery) would silently break that
// block type's publish path in production with no compiler error and no
// test catching it, because the two types were only structurally similar,
// not import-linked. See puckAdapter.test.ts's component-name-parity test
// for the runtime half of this guardrail (this file only prevents type
// drift; it can't by itself catch a puck.config.tsx component whose `type`
// switch case in puckAdapter.ts was never added).
export type BulletItem = { text: string };

export type PuckComponentProps = {
  Job: { company: string; dates: string; role: string; bullets: BulletItem[] };
  Placeholder: { company: string; note: string };
  Education: {
    school: string;
    dates: string;
    degree: string;
    bullets: BulletItem[];
    dissertation: string;
  };
  CertificateGroup: {
    heading: string;
    certificates: { text: string; accent: boolean }[];
  };
  GalleryItem: { itemType: 'photo' | 'video'; image: string; videoUrl: string };
  Note: { text: string };
};
