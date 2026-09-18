'use client';

import { useId, useRef, useState } from 'react';
import { GALLERY_TYPES } from '../lib/galleryMediaTypes';
import {
  type UploadProgressEvent,
  uploadGalleryFile,
} from '../lib/galleryUploadClient';

interface Props {
  /** Which half of the allow-list this field takes. */
  accept: 'image' | 'video';
  /** Current stored value — an uploaded URL, a pasted one, or '' for none. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * The paste-a-URL path is deliberately kept alongside the picker. Some media
 * should stay a link rather than becoming a re-hosted file — an existing
 * YouTube video being the obvious case — so uploading is an addition to that
 * field, never a replacement for it.
 */
function acceptAttribute(accept: 'image' | 'video'): string {
  return Object.keys(GALLERY_TYPES)
    .filter((type) => type.startsWith(`${accept}/`))
    .join(',');
}

function percent(progress: UploadProgressEvent): number | null {
  if (!progress.total) return null;
  return Math.min(100, Math.round((progress.loaded / progress.total) * 100));
}

export function MediaUploadField({ accept, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const uploading = progress !== null;

  async function upload(file: File) {
    setError(null);
    // A zero-progress event so the status line appears immediately, before
    // the first real progress callback arrives.
    setProgress({ phase: 'sending', loaded: 0, total: file.size });

    const result = await uploadGalleryFile(file, {
      onProgress: setProgress,
    });

    setProgress(null);
    // Cleared so re-picking the same file after a failure still fires
    // onChange — an input keeps its value and would emit no event.
    if (inputRef.current) inputRef.current.value = '';

    if (!result.ok) {
      // The field's existing value is deliberately left untouched: a failed
      // replacement should not also destroy what was already there.
      setError(result.message);
      return;
    }
    onChange(result.url);
  }

  const pct = progress ? percent(progress) : null;

  return (
    <div className="media-upload-field">
      <input
        type="text"
        className="media-upload-url"
        value={value}
        placeholder={
          accept === 'video'
            ? 'Paste a video URL, or upload a file'
            : 'Paste an image URL, or upload a file'
        }
        onChange={(event) => onChange(event.target.value)}
        disabled={uploading}
      />

      {/* A real <label htmlFor>, not a bare span: the file input is visually
          hidden behind the styled button, and this is what keeps it reachable
          by name for assistive tech and tests. */}
      <label className="media-upload-label" htmlFor={inputId}>
        {accept === 'video' ? 'Video file' : 'Image file'}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={acceptAttribute(accept)}
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <button
        type="button"
        className="media-upload-button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading…' : value ? 'Replace file' : 'Upload file'}
      </button>

      {progress && (
        // The two legs are named rather than merged into one bar: on a large
        // file they take visibly different amounts of time, and "storing" not
        // moving for a while is normal rather than a stall.
        <p className="media-upload-progress" role="status">
          {progress.phase === 'sending' ? 'Uploading' : 'Storing'}
          {pct === null ? '…' : ` ${pct}%`}
        </p>
      )}

      {error && (
        <p className="media-upload-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
