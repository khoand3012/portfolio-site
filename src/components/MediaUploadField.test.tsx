import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/galleryUploadClient', () => ({
  uploadGalleryFile: vi.fn(),
  UPLOAD_PATH: '/api/gallery-upload',
}));

import { uploadGalleryFile } from '../lib/galleryUploadClient';
import { MediaUploadField } from './MediaUploadField';

function fileOf(name: string, type: string): File {
  return new File(['bytes'], name, { type });
}

describe('MediaUploadField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Rendered through a stateful holder because the field is controlled: with
  // a bare mock for onChange the input never re-renders, and each keystroke
  // would arrive as a single character replacing the last.
  function Controlled({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <MediaUploadField
        accept="image"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }

  it('offers the paste-a-URL path alongside the picker', async () => {
    const onChange = vi.fn();
    const { container } = render(<Controlled onChange={onChange} />);

    const text = within(container).getByRole('textbox');
    await userEvent.type(text, 'https://cdn.example/a.jpg');

    expect(onChange.mock.calls.at(-1)?.[0]).toBe('https://cdn.example/a.jpg');
    expect(text).toHaveValue('https://cdn.example/a.jpg');
  });

  it('limits the picker to images when that is what the field takes', () => {
    const { container } = render(
      <MediaUploadField accept="image" value="" onChange={() => {}} />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute('accept')).toBe(
      'image/png,image/jpeg,image/webp,image/gif',
    );
  });

  it('offers video containers too when the field takes a video', () => {
    const { container } = render(
      <MediaUploadField accept="video" value="" onChange={() => {}} />,
    );
    const accept = container
      .querySelector('input[type="file"]')
      ?.getAttribute('accept');
    expect(accept).toContain('video/mp4');
    expect(accept).toContain('video/webm');
    expect(accept).not.toContain('image/');
  });

  it('fills the field with the URL a successful upload returns', async () => {
    vi.mocked(uploadGalleryFile).mockResolvedValue({
      ok: true,
      url: 'https://pub-abc.r2.dev/media/a.mp4',
    });
    const onChange = vi.fn();
    const { container } = render(
      <MediaUploadField accept="video" value="" onChange={onChange} />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, fileOf('clip.mp4', 'video/mp4'));

    expect(onChange).toHaveBeenCalledWith('https://pub-abc.r2.dev/media/a.mp4');
  });

  it('leaves the existing value alone when the upload fails', async () => {
    vi.mocked(uploadGalleryFile).mockResolvedValue({
      ok: false,
      message: 'R2 rejected the request',
    });
    const onChange = vi.fn();
    const { container } = render(
      <MediaUploadField
        accept="video"
        value="https://cdn.example/old.mp4"
        onChange={onChange}
      />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, fileOf('clip.mp4', 'video/mp4'));

    expect(onChange).not.toHaveBeenCalled();
    expect(within(container).getByRole('alert').textContent).toContain(
      'R2 rejected the request',
    );
  });

  it('shows progress across both legs while the upload runs', async () => {
    let report: ((p: unknown) => void) | undefined;
    // Never resolves: the assertions are about the state DURING an upload, so
    // letting it finish would tear the progress line down before they run.
    vi.mocked(uploadGalleryFile).mockImplementation(
      (_file, handlers) =>
        new Promise(() => {
          report = handlers?.onProgress as (p: unknown) => void;
        }),
    );

    const { container } = render(
      <MediaUploadField accept="video" value="" onChange={() => {}} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, fileOf('clip.mp4', 'video/mp4'));

    expect(report).toBeDefined();
    // Wrapped in act(): these fire outside React's event system, so without
    // it the state update wouldn't be flushed before the assertion.
    act(() => report?.({ phase: 'sending', loaded: 50, total: 100 }));
    const status = within(container).getByRole('status');
    expect(status.textContent).toMatch(/50%/);
    expect(status.textContent).toMatch(/uploading/i);

    act(() => report?.({ phase: 'storing', loaded: 25, total: 100 }));
    expect(within(container).getByRole('status').textContent).toMatch(
      /storing/i,
    );
  });
});
