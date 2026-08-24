// puck.config.tsx
//
// Maps this app's existing block components (src/components/) to Puck's
// editable-component config. Puck is used only as an editing surface here —
// the app keeps its own Block[] content model (src/types.ts) as the stored
// format; Task 16's adapter converts between the two. See Task 15's report
// for the full rationale.
//
// Field-level and component-level `ai` keys (ai.instructions etc.) are
// intentionally omitted: at the installed @puckeditor/core@0.23.0, the `ai`
// parameter is not part of the field or component config types (BaseField
// and ComponentConfigInternal have no `ai` member; ComponentConfigExtensions
// — the declared extension point for component-level `ai` — is an empty
// interface until `@puckeditor/plugin-ai`/`@puckeditor/cloud-client`
// augment it via declaration merging). Those packages aren't installed by
// this task (that's Task 18). Adding `ai` now would be inert config that
// TypeScript may not even flag as an error, so it's left out entirely and
// deferred to Task 18.
import type { Config } from '@puckeditor/core';
import { CertificateGroup } from './src/components/CertificateGroup';
import { EducationCard } from './src/components/EducationCard';
import { GalleryTile } from './src/components/GalleryTile';
import { JobCard } from './src/components/JobCard';
import { Note } from './src/components/Note';
import { PlaceholderCard } from './src/components/PlaceholderCard';

type BulletItem = { text: string };
const bulletsField = {
  type: 'array' as const,
  arrayFields: { text: { type: 'textarea' as const } },
  defaultItemProps: { text: '' },
  getItemSummary: (item: BulletItem) => item.text || 'Bullet',
};

type Props = {
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

export const puckConfig: Config<Props> = {
  components: {
    Job: {
      fields: {
        company: { type: 'text' },
        dates: { type: 'text' },
        role: { type: 'text' },
        bullets: bulletsField,
      },
      defaultProps: { company: '', dates: '', role: '', bullets: [] },
      render: (props) => (
        <JobCard
          job={{
            type: 'job',
            company: props.company,
            dates: props.dates,
            role: props.role || undefined,
            bullets: props.bullets.map((b) => b.text),
          }}
        />
      ),
    },
    Placeholder: {
      fields: {
        company: { type: 'text' },
        note: { type: 'textarea' },
      },
      defaultProps: { company: '', note: '' },
      render: (props) => (
        <PlaceholderCard
          item={{
            type: 'placeholder',
            company: props.company,
            note: props.note,
          }}
        />
      ),
    },
    Education: {
      fields: {
        school: { type: 'text' },
        dates: { type: 'text' },
        degree: { type: 'text' },
        bullets: bulletsField,
        dissertation: { type: 'text' },
      },
      defaultProps: {
        school: '',
        dates: '',
        degree: '',
        bullets: [],
        dissertation: '',
      },
      render: (props) => (
        <EducationCard
          ed={{
            type: 'education',
            school: props.school,
            dates: props.dates,
            degree: props.degree,
            bullets: props.bullets.map((b) => b.text),
            dissertation: props.dissertation || undefined,
          }}
        />
      ),
    },
    CertificateGroup: {
      fields: {
        heading: { type: 'text' },
        certificates: {
          type: 'array',
          arrayFields: {
            text: { type: 'text' },
            accent: {
              type: 'radio',
              options: [
                { label: 'Accent', value: true },
                { label: 'Normal', value: false },
              ],
            },
          },
          defaultItemProps: { text: '', accent: false },
          getItemSummary: (item: { text: string }) =>
            item.text || 'Certificate',
        },
      },
      defaultProps: { heading: 'Certificates', certificates: [] },
      render: (props) => (
        <CertificateGroup
          group={{
            type: 'certificate-group',
            heading: props.heading,
            certificates: props.certificates,
          }}
        />
      ),
    },
    GalleryItem: {
      fields: {
        itemType: {
          type: 'select',
          options: [
            { label: 'Photo', value: 'photo' },
            { label: 'Video', value: 'video' },
          ],
        },
        image: { type: 'text' },
        videoUrl: { type: 'text' },
      },
      defaultProps: { itemType: 'photo', image: '', videoUrl: '' },
      render: (props) => (
        <GalleryTile
          item={{
            type: 'gallery-item',
            itemType: props.itemType,
            image: props.image || undefined,
            videoUrl: props.videoUrl || undefined,
          }}
        />
      ),
    },
    Note: {
      fields: {
        text: { type: 'textarea' },
      },
      defaultProps: { text: '' },
      render: (props) => <Note text={props.text} />,
    },
  },
};
