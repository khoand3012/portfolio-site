// src/lib/draftState.ts
//
// The admin shell keeps an in-memory draft per tab so that switching tabs
// doesn't discard unpublished work (<Puck> is remounted per tab via `key`, so
// without this its state is simply thrown away). This module answers the one
// question that logic needs: does a tab's live editor data still match what is
// published?
//
// The comparison runs over BLOCKS, not Puck's own data. Puck mints fresh
// component ids on insert and on remount, and those ids are stripped by
// puckDataToBlocks — comparing raw Puck data would report every freshly opened
// tab as edited and make the unsaved-changes warning meaningless.
import type { Data } from '@puckeditor/core';
import type { Block } from '../types';
import { puckDataToBlocks } from './puckAdapter';

export function hasUnpublishedEdits(data: Data, published: Block[]): boolean {
  try {
    return JSON.stringify(puckDataToBlocks(data)) !== JSON.stringify(published);
  } catch {
    // Data that can't be converted can't be compared. Report it as changed:
    // claiming a tab is clean is what silently drops the owner's work on a tab
    // switch, so the safe direction is to keep the draft and keep warning.
    return true;
  }
}
