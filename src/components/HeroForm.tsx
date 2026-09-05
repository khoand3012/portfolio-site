'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveHeroAction } from '../../app/admin/actions';
import { toast } from '../lib/use-toast';
import type { Hero } from '../types';

interface Props {
  hero: Hero;
  /** Handed the hero the server actually saved — see TabManager's onSaved. */
  onSaved?: (hero: Hero) => void;
}

// Hero doesn't fit Puck's editing model — it's a single fixed-shape record
// with nothing to add, remove, or reorder — so it gets a plain controlled
// form instead of a Puck config, following the same save/toast/refresh
// pattern PuckAdmin.handlePublish and TabManager.publish already use.
const OPTIONAL_FIELDS = [
  'phone',
  'email',
  'linkedin',
  'location',
  'dob',
  'credential',
] as const;

function toHero(fields: Record<string, string>): Hero {
  const hero: Hero = {
    name: fields.name ?? '',
    initials: fields.initials ?? '',
    role: fields.role ?? '',
    profile: fields.profile ?? '',
  };
  for (const field of OPTIONAL_FIELDS) {
    const value = fields[field];
    if (value) hero[field] = value;
  }
  return hero;
}

export function HeroForm({ hero, onSaved }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({
    name: hero.name,
    initials: hero.initials,
    role: hero.role,
    phone: hero.phone ?? '',
    email: hero.email ?? '',
    linkedin: hero.linkedin ?? '',
    location: hero.location ?? '',
    dob: hero.dob ?? '',
    credential: hero.credential ?? '',
    profile: hero.profile,
  });
  const [saving, setSaving] = useState(false);

  function setField(field: string, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function publish() {
    setSaving(true);
    try {
      const saved = await saveHeroAction(toHero(fields));
      toast({ description: 'Hero saved.' });
      onSaved?.(saved);
      router.refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wrap hero-form">
      <h2>Hero</h2>
      <p className="hero-form-hint">
        Every field below is your own content — nothing here is generated.
        Nothing changes until you publish.
      </p>

      <div className="hero-form-grid">
        <label className="hero-form-field">
          <span>Name</span>
          <input
            type="text"
            value={fields.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Initials</span>
          <input
            type="text"
            value={fields.initials}
            onChange={(e) => setField('initials', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Role</span>
          <input
            type="text"
            value={fields.role}
            onChange={(e) => setField('role', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Credential</span>
          <input
            type="text"
            value={fields.credential}
            onChange={(e) => setField('credential', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Phone</span>
          <input
            type="text"
            value={fields.phone}
            onChange={(e) => setField('phone', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Email</span>
          <input
            type="text"
            value={fields.email}
            onChange={(e) => setField('email', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>LinkedIn</span>
          <input
            type="text"
            value={fields.linkedin}
            onChange={(e) => setField('linkedin', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Location</span>
          <input
            type="text"
            value={fields.location}
            onChange={(e) => setField('location', e.target.value)}
          />
        </label>
        <label className="hero-form-field">
          <span>Date of birth</span>
          <input
            type="text"
            value={fields.dob}
            onChange={(e) => setField('dob', e.target.value)}
          />
        </label>
      </div>

      <label className="hero-form-field hero-form-profile">
        <span>Profile</span>
        <textarea
          value={fields.profile}
          onChange={(e) => setField('profile', e.target.value)}
        />
      </label>

      <div className="hero-form-actions">
        <button type="button" onClick={publish} disabled={saving}>
          {saving ? 'Publishing…' : 'Publish hero'}
        </button>
      </div>
    </div>
  );
}
