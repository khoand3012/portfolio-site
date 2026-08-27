import { puckHandler } from '@puckeditor/cloud-client';
import { auth } from '../../../../auth';
import { isAllowedEmail } from '../../../../src/lib/allowedEmails';

// Content-fidelity guardrail (prompt-level, not a hard technical block — see
// this project's CLAUDE.md on content fidelity, and puck.config.tsx's
// per-field `ai.instructions` for the other half of this guardrail). This CV
// documents a real person's career; Puck AI may scaffold structure but must
// never rewrite the real content already there.
const AI_CONTEXT =
  "You are helping edit a real person's CV/portfolio page. Only scaffold new content blocks, " +
  'reorder or restructure layout, or propose new empty blocks to fill in later. Never generate, ' +
  'rewrite, or rephrase existing text in company names, job bullets, education details, or any ' +
  'other real content field — those are factual claims about a real career and must only ever be ' +
  'written or edited by a human.';

async function handleRequest(request: Request) {
  // Defense in depth, same as app/admin/page.tsx: middleware.ts already gates
  // '/api/puck' at the routing layer, but this handler must not trust that
  // alone — it also spends the Puck Cloud account's metered AI credit, so an
  // open route would let anyone run up the bill even before touching content.
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return new Response('Not authorized', { status: 403 });
  }

  // No `model`/`providerApiKey` here: Claude/Anthropic BYOK was researched
  // (Task 18, Ruling 5) and Puck AI currently only supports OpenAI models for
  // both the default (credit-metered) path and BYOK. Falling back to Puck's
  // own default model and the account's credit, per the plan's explicit
  // fallback for this open question — see task-18-report.md for the full
  // findings and how to revisit this if the user wants to pursue it later.
  return puckHandler(request, {
    ai: {
      context: AI_CONTEXT,
      // Locks Puck AI to composing from this app's own config components —
      // "design" mode can invent new custom-styled sections, which would
      // both risk drifting off the fixed navy/graphite/mint design tokens
      // and bypass the per-field ai.instructions guardrails in puck.config.tsx.
      mode: 'assembly',
    },
  });
}

export const DELETE = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
