'use client';

import { useId, useRef, useState } from 'react';
import { deriveInitials } from '../lib/initials';
import { AVATAR_TYPES, MAX_AVATAR_BYTES } from '../lib/mediaTypes';

interface Props {
  /** Current stored value — a media path, a pasted URL, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  /** Drives the initials preview shown while no image is set. */
  name: string;
}

const ACCEPT = Object.keys(AVATAR_TYPES).join(',');

// Uploads through the /api/upload Route Handler rather than a server action,
// because a server action would cap the body at Next's 1MB default — see the
// comment at the top of app/api/upload/route.ts.
//
// A plain fetch with a simple JSON reply, not the newline-delimited streamed
// progress protocol the media-upload spec designs for the gallery: that
// protocol exists to keep a 500MB video upload legible, and a 5MB avatar over
// a single request finishes well inside the window where a spinner is the
// honest UI. If video lands later it can bring the streaming protocol with it.
export function AvatarField({ value, onChange, name }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function upload(file: File) {
    setError(null);
    // Checked client-side purely so the owner gets an instant answer instead
    // of waiting out an upload the route will refuse. The route's own checks
    // are the authoritative ones — this is convenience, not a boundary.
    if (!(file.type in AVATAR_TYPES)) {
      setError('Use a PNG, JPEG, WebP or GIF image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('That image is over 5MB.');
      return;
    }

    setUploading(true);
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
        // Do NOT follow middleware's sign-in redirect. It is a 302, which a
        // browser re-issues as a GET, landing on the sign-in page — so a
        // followed redirect turns an expired session into a 200 HTML
        // response that is indistinguishable from a successful upload until
        // JSON parsing fails, and reports "Upload failed. Try again." for
        // something retrying cannot fix.
        redirect: 'manual',
      });
      if (response.type === 'opaqueredirect') {
        setError('Your sign-in expired. Reload the page and sign in again.');
        return;
      }
      // Still parsed defensively: the route's own error paths are JSON, but
      // an unexpected non-JSON body should not surface as a SyntaxError.
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? 'Upload failed. Try again.');
        return;
      }
      onChange(payload.url);
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
      // Cleared so re-picking the same file after a failure still fires
      // onChange — an input keeps its value and would emit no event.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="avatar-field">
      <div className="avatar-field-preview" aria-hidden="true">
        {value ? (
          /* biome-ignore lint/performance/noImgElement: same reasoning as Hero.tsx — an admin-supplied URL that next/image would need remotePatterns for. */
          <img src={value} alt="" />
        ) : (
          <span>{deriveInitials(name)}</span>
        )}
      </div>

      <div className="avatar-field-controls">
        {/* A real <label htmlFor>, not a bare span: the file input itself is
            visually hidden behind the styled button, and this is what keeps
            it reachable by name for assistive tech and tests. */}
        <label className="avatar-field-label" htmlFor={inputId}>
          Avatar
        </label>
        <p className="avatar-field-hint">
          {value
            ? 'Shown in place of your initials.'
            : `Your initials (${deriveInitials(name) || '—'}) are shown until you upload a photo.`}
        </p>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="avatar-field-actions">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? 'Uploading…'
              : value
                ? 'Replace photo'
                : 'Upload photo'}
          </button>
          {value && (
            <button
              type="button"
              className="avatar-field-remove"
              onClick={() => {
                setError(null);
                onChange('');
              }}
              disabled={uploading}
            >
              Remove
            </button>
          )}
        </div>
        {error && (
          <p className="avatar-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
