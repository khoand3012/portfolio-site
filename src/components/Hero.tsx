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
            {hero.initials}
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
