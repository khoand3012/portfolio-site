// src/lib/sanitizeBlocks.ts
//
// Two fields in the content model hold HTML rather than plain text —
// TextBlock.html and BulletsBlock.items — because Puck's richtext field is
// Tiptap-backed and stores editor.getHTML(). Text.tsx and Bullets.tsx render
// those values with dangerouslySetInnerHTML, so this module is what makes
// that safe: it runs at the save boundary in app/admin/actions.ts, which
// means whatever reaches the content store (and therefore the public page)
// is already reduced to the allow-list below.
//
// This is a TRANSFORM, not a validation. Disallowed markup is stripped and
// the save proceeds — a paste from Word carrying <span style> should lose the
// span, not fail the save. If formatting "disappears", the allow-list is the
// answer, not a bug.
//
// Server-only: sanitize-html parses with htmlparser2 and must never be
// imported by a 'use client' component.
import sanitizeHtml from 'sanitize-html';
import type { Block } from '../types';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'a'],
  allowedAttributes: { a: ['href', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Matches the rel already set on the outbound link in the media components.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener' }),
  },
};

const clean = (html: string): string => sanitizeHtml(html, OPTIONS);

export function sanitizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'container':
        return { ...block, children: sanitizeBlocks(block.children) };
      case 'text':
        return { ...block, html: clean(block.html) };
      case 'bullets':
        return { ...block, items: block.items.map(clean) };
      default:
        // heading/dates/badge/image/video carry only plain-text and URL
        // fields, which are rendered as text or gated by isSafeHttpUrl.
        return block;
    }
  });
}
