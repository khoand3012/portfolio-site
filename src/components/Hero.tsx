import { isSafeAvatarUrl } from '../lib/avatarUrl';
import { deriveInitials } from '../lib/initials';
import type { Hero as HeroData } from '../types';
import { MetaItem } from './MetaItem';

interface Props {
  hero: HeroData;
}

export function Hero({ hero }: Props) {
  const phoneHref = hero.phone && `tel:${hero.phone.replace(/[^\d+]/g, '')}`;
  const emailHref = hero.email && `mailto:${hero.email}`;
  const linkedinHref =
    hero.linkedin &&
    (/^https?:\/\//.test(hero.linkedin)
      ? hero.linkedin
      : `https://${hero.linkedin}`);
  const locationHref =
    hero.location &&
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hero.location)}`;

  // Always derived, never read from the stored record: `initials` is no
  // longer an editable field, so a value saved before that change would
  // otherwise go stale the moment the owner corrected their name.
  const initials = deriveInitials(hero.name);
  // Re-checked at render as well as at the save boundary — this is the point
  // where the value becomes a live `src`, and a document written before that
  // guard existed has never been through it.
  const avatarSrc =
    hero.avatarUrl && isSafeAvatarUrl(hero.avatarUrl)
      ? hero.avatarUrl
      : undefined;

  return (
    <header className="hero">
      <div className="wrap">
        <div className="hero-top">
          <div className="hero-heading">
            <h1>{hero.name}</h1>
            <p className="role">{hero.role}</p>
            {hero.credential && <p className="credential">{hero.credential}</p>}
          </div>
          <div className="avatar" aria-hidden="true">
            {avatarSrc ? (
              /* biome-ignore lint/performance/noImgElement: avatarSrc is an admin-supplied URL (or a relative /api/media path); next/image would need remotePatterns configured first, matching Image.tsx's existing reasoning. */
              <img className="avatar-image" src={avatarSrc} alt="" />
            ) : (
              initials
            )}
          </div>
        </div>
        <div className="meta-row">
          <MetaItem icon="phone" text={hero.phone} href={phoneHref} />
          <MetaItem icon="mail" text={hero.email} href={emailHref} />
          <MetaItem icon="linkedin" text={hero.linkedin} href={linkedinHref} />
          <MetaItem icon="pin" text={hero.location} href={locationHref} />
          <MetaItem icon="calendar" text={hero.dob} />
        </div>
        <p className="profile">{hero.profile}</p>
      </div>
    </header>
  );
}
