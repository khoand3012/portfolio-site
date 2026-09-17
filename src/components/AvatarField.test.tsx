import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarField } from './AvatarField';

function pngFile(name = 'me.png', bytes = 'x'): File {
  return new File([bytes], name, { type: 'image/png' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AvatarField', () => {
  it('shows the initials derived from the name while no avatar is set', () => {
    render(
      <AvatarField value="" onChange={vi.fn()} name="Truong Nam Nguyen" />,
    );
    expect(screen.getByText('TNN')).toBeInTheDocument();
  });

  it('uploads the picked file and reports the returned URL', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      type: 'basic',
      json: async () => ({ url: '/api/media/abc-123.png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AvatarField value="" onChange={onChange} name="Test Name" />);
    await user.upload(screen.getByLabelText('Avatar'), pngFile());

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('/api/media/abc-123.png'),
    );
    // The file goes up as a raw body with its own content type — no multipart.
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('expected the upload route to be called');
    const init = call[1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('image/png');
  });

  it('rejects an unsupported type client-side without calling the route', async () => {
    // applyAccept: false bypasses the input's own `accept` filter, which
    // userEvent otherwise enforces. The filter is a convenience, not a
    // guarantee — a drag-and-drop or a mistyped extension can still deliver
    // the wrong type — so the component's own check has to be exercised.
    const user = userEvent.setup({ applyAccept: false });
    const onChange = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<AvatarField value="" onChange={onChange} name="Test Name" />);
    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /PNG, JPEG, WebP or GIF/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("surfaces the route's error and leaves the value unchanged", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        type: 'basic',
        json: async () => ({ error: 'That image is over 5MB.' }),
      }),
    );

    render(<AvatarField value="" onChange={onChange} name="Test Name" />);
    await user.upload(screen.getByLabelText('Avatar'), pngFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That image is over 5MB.',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles a non-JSON reply (a middleware sign-in redirect) as an error', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        type: 'basic',
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    render(<AvatarField value="" onChange={onChange} name="Test Name" />);
    await user.upload(screen.getByLabelText('Avatar'), pngFile());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells the owner to sign in again when middleware redirects the upload', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // What `redirect: 'manual'` yields for middleware's 302 to the sign-in
    // page: an opaque redirect, rather than a followed 200 HTML response.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 0,
        type: 'opaqueredirect',
        json: async () => {
          throw new SyntaxError('not JSON');
        },
      }),
    );

    render(<AvatarField value="" onChange={onChange} name="Test Name" />);
    await user.upload(screen.getByLabelText('Avatar'), pngFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /sign-in expired/i,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not follow redirects, so an expired session is distinguishable', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      type: 'basic',
      json: async () => ({ url: '/api/media/abc-123.png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AvatarField value="" onChange={vi.fn()} name="Test Name" />);
    await user.upload(screen.getByLabelText('Avatar'), pngFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('expected the upload route to be called');
    expect(call[1].redirect).toBe('manual');
  });

  it('clears the value when the avatar is removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AvatarField
        value="/api/media/abc-123.png"
        onChange={onChange}
        name="Test Name"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
