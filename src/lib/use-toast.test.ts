import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { reducer, toast, useToast } from './use-toast';

describe('use-toast reducer', () => {
  it('ADD_TOAST prepends a toast and enforces the single-toast limit', () => {
    const state = { toasts: [] };
    const withFirst = reducer(state, {
      type: 'ADD_TOAST',
      toast: { id: '1', open: true },
    });
    const withSecond = reducer(withFirst, {
      type: 'ADD_TOAST',
      toast: { id: '2', open: true },
    });
    expect(withSecond.toasts).toHaveLength(1);
    expect(withSecond.toasts[0]?.id).toBe('2');
  });

  it('DISMISS_TOAST sets open to false without removing the toast', () => {
    const state = { toasts: [{ id: '1', open: true }] };
    const dismissed = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(dismissed.toasts).toHaveLength(1);
    expect(dismissed.toasts[0]?.open).toBe(false);
  });

  it('REMOVE_TOAST drops the toast from state entirely', () => {
    const state = { toasts: [{ id: '1', open: false }] };
    const removed = reducer(state, { type: 'REMOVE_TOAST', toastId: '1' });
    expect(removed.toasts).toHaveLength(0);
  });
});

describe('toast()/useToast()', () => {
  afterEach(() => {
    // toast() mutates a module-level singleton store — clear it between
    // tests so one test's toast doesn't leak into the next.
    const { result } = renderHook(() => useToast());
    act(() => result.current.dismiss());
  });

  it('a call to toast() is visible via useToast()', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ description: 'Saved.' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.description).toBe('Saved.');
  });

  it("the handle toast() returns can dismiss that toast's own entry", () => {
    const { result } = renderHook(() => useToast());

    let handle: ReturnType<typeof toast> | undefined;
    act(() => {
      handle = toast({ description: 'Saved.' });
    });

    act(() => handle?.dismiss());

    expect(result.current.toasts[0]?.open).toBe(false);
  });
});
