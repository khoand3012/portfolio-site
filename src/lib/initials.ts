/**
 * Derives the avatar fallback initials from the owner's name.
 *
 * `Hero.initials` used to be a field the owner typed in `/admin`. It isn't
 * any more: it's a *fallback* shown only when no avatar image has been
 * uploaded, so asking someone to maintain it by hand — and to remember to
 * re-type it after a name change — is busywork for a value the name already
 * determines.
 *
 * Kept deliberately pure and dependency-free so both the public page
 * (server) and `HeroForm`'s live preview (client) can call it and agree.
 *
 * `Hero.initials` remains an optional field in the content model rather than
 * being deleted outright: documents saved before this change still carry the
 * hand-typed value, and honouring it costs one `??`. Nothing writes it any
 * more, so it decays on the owner's next hero save.
 */
export function deriveInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      // First character rather than first *letter*: a name may legitimately
      // start with a non-ASCII letter, and `[A-Za-z]` would silently skip it.
      // Array spread, not `word[0]`, so an astral-plane codepoint isn't split
      // into a lone surrogate half.
      .map((word) => [...word][0] ?? '')
      .slice(0, 3)
      .join('')
      .toUpperCase()
  );
}
