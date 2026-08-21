// Milestone 7 — Checkpoint E: photo -> validated Receipt -> receipt_imports row.
//
// Flow (plan section 3 / section 8), single synchronous request/response, no
// polling/background-job infra:
//   phone (already-compressed base64 JPEG, checkpoint D)
//   -> verify caller is authenticated AND a member of householdId
//   -> per-household 24h abuse guard (cheap backstop, not real rate limiting)
//   -> call Claude (vision + native Structured Outputs)
//   -> validateReceipt() — the untrusted model JSON is NEVER trusted as-is
//   -> insert receipt_imports (status: ready_for_review) via service-role
//      client, since RLS intentionally has no client-facing INSERT policy
//   -> return the validated receipt + its receipt_imports.id
//
// Deliberate deviation from the plan's literal wording, not its intent: the
// plan originally suggested tool-use forcing for schema-valid JSON. Anthropic's
// native Structured Outputs (`output_config.format`, GA as of this checkpoint)
// is now the documented, more reliable mechanism for exactly the same goal
// ("don't trust free-form AI text", plan section 5/9) — guaranteed
// schema-compliant JSON, no separate tool-call unwrapping. Same architecture
// otherwise: one Edge Function, one Claude call, server-side validation.
//
// Auth + KEY SOURCE: identical pattern to lookup-barcode/index.ts — build the
// RLS-respecting client from the caller's forwarded Authorization header AND
// the incoming request's own `apikey` header (never
// `Deno.env.get('SUPABASE_ANON_KEY')`, which can serve a stale legacy key
// post-migration to the new key system — github.com/supabase/supabase/issues/37648).
//
// Image retention: plan section 5, Option B — the image never touches disk or
// Supabase Storage. It exists only in this request's memory for the single
// Claude call below, and is gone the moment this function returns.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { validateReceipt, type Receipt } from './validator.ts';

const ANTHROPIC_MODEL = 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';
const DAILY_RECEIPT_LIMIT = 30;
// Generous ceiling on the base64 payload itself — client-side compression
// (checkpoint D) targets ~200-600KB, so this is a sanity backstop against a
// misbehaving client, not a tuned limit. Empirically confirming a real photo
// fits comfortably under this (and under any undocumented platform body-size
// ceiling, plan section 5's flagged risk) is this checkpoint's whole point.
const MAX_BASE64_LENGTH = 8_000_000; // ~6MB decoded

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Matches Receipt/ReceiptItem (validator.ts) field-for-field. Structured
// Outputs' strict mode requires every property to appear in `required`, so
// "optional" fields are modeled as nullable rather than omitted — the model
// returns null instead of leaving them out, which validateReceipt() already
// treats as "not provided."
const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    merchantName: { type: ['string', 'null'] },
    purchaseDate: { type: ['string', 'null'], description: 'ISO yyyy-mm-dd, or null if unreadable.' },
    subtotalCents: { type: ['integer', 'null'] },
    taxCents: { type: ['integer', 'null'] },
    discountCents: { type: ['integer', 'null'] },
    totalCents: { type: 'integer', description: 'Integer cents, e.g. $12.34 -> 1234. Required.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rawText: { type: 'string' },
          cleanedName: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unitPriceCents: { type: ['integer', 'null'] },
          totalPriceCents: { type: 'integer' },
          category: { type: ['string', 'null'] },
          isLikelyFood: { type: ['boolean', 'null'] },
          barcode: { type: ['string', 'null'] },
          confidence: { type: ['number', 'null'], description: '0-1.' },
        },
        required: [
          'rawText',
          'cleanedName',
          'quantity',
          'unitPriceCents',
          'totalPriceCents',
          'category',
          'isLikelyFood',
          'barcode',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'merchantName',
    'purchaseDate',
    'subtotalCents',
    'taxCents',
    'discountCents',
    'totalCents',
    'items',
    'warnings',
  ],
  additionalProperties: false,
};

const EXTRACTION_PROMPT = `You are extracting structured data from a photo of a retail/grocery receipt.

Read every line item you can and return the requested JSON. For each item:
- "rawText": the item text roughly as printed/OCR'd.
- "cleanedName": a cleaned, human-readable product name (e.g. "ORG BNLS CHK BRST" -> "Organic Boneless Chicken Breast").
- All prices ("totalPriceCents", "unitPriceCents", "subtotalCents", "taxCents", "discountCents", "totalCents") must be integer CENTS, never decimal dollars (e.g. $4.99 -> 499).
- "isLikelyFood": true for grocery/food items, false for clearly non-food items (paper towels, batteries, etc).
- Only set "purchaseDate" if you can confidently read one, formatted as ISO yyyy-mm-dd.
- If a field can't be confidently read, return null for it rather than guessing.
- If anything about the receipt is uncertain (blurry section, cut-off edge, ambiguous total), add a short note to "warnings".

Privacy: NEVER extract or output any payment card number or digits (including a partial/last-4), or any loyalty/rewards account number, even if visible on the receipt. Omit them entirely — do not put them in any field, including warnings.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // See the KEY SOURCE note above.
    const supabaseKey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('process-receipt auth failed', userError?.message);
      return jsonResponse({ error: 'Not authenticated.' }, 401);
    }

    let body: { householdId?: unknown; imageBase64?: unknown; mimeType?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }

    const householdId = typeof body.householdId === 'string' ? body.householdId : '';
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';

    if (!householdId) {
      return jsonResponse({ error: 'Missing householdId.' }, 400);
    }
    if (!imageBase64) {
      return jsonResponse({ error: 'Missing receipt photo.' }, 400);
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return jsonResponse({ error: 'Unsupported image type.' }, 400);
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: 'That photo is too large — try again.' }, 400);
    }

    // Independently verify household membership BEFORE spending any AI
    // budget (plan section 8) — this is what makes it safe for
    // receipt_imports to have no client-facing INSERT policy at all.
    const { data: membership, error: membershipError } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('process-receipt membership check failed', membershipError);
      return jsonResponse({ error: 'Could not verify household membership.' }, 500);
    }
    if (!membership) {
      return jsonResponse({ error: 'Not a member of this household.' }, 403);
    }

    // Cheap per-household abuse backstop (plan section 8) — not real
    // rate-limiting infra. A failure here is logged and treated as
    // non-blocking rather than denying a legitimate scan over an
    // infrastructure hiccup in the count query itself.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: countError } = await supabase
      .from('receipt_imports')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .gte('created_at', oneDayAgo);

    if (countError) {
      console.error('process-receipt abuse-guard count failed', countError);
    } else if ((recentCount ?? 0) >= DAILY_RECEIPT_LIMIT) {
      return jsonResponse(
        { error: `This household has hit today's receipt-scanning limit (${DAILY_RECEIPT_LIMIT}/day) — try again tomorrow.` },
        429,
      );
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('process-receipt missing ANTHROPIC_API_KEY secret');
      return jsonResponse({ error: 'Receipt scanning is not available right now.' }, 500);
    }

    let anthropicRes: Response;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 8192,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                { type: 'text', text: EXTRACTION_PROMPT },
              ],
            },
          ],
          output_config: { format: { type: 'json_schema', schema: RECEIPT_JSON_SCHEMA } },
        }),
      });
    } catch (error) {
      console.error('process-receipt Anthropic request failed', error);
      return jsonResponse({ error: 'Could not reach the receipt-scanning service — check your connection and try again.' }, 502);
    }

    const anthropicJson = await anthropicRes.json().catch(() => null);
    if (!anthropicRes.ok) {
      console.error('process-receipt Anthropic API error', anthropicRes.status, anthropicJson);
      return jsonResponse({ error: 'Could not process that receipt — try again.' }, 502);
    }

    const textBlock = Array.isArray(anthropicJson?.content)
      ? anthropicJson.content.find((block: { type?: string }) => block?.type === 'text')
      : undefined;
    if (typeof textBlock?.text !== 'string') {
      console.error('process-receipt Anthropic response had no text block', anthropicJson);
      return jsonResponse({ error: 'Could not process that receipt — try again.' }, 502);
    }

    let parsedModelOutput: unknown;
    try {
      parsedModelOutput = JSON.parse(textBlock.text);
    } catch (error) {
      console.error('process-receipt could not parse Anthropic JSON text', error, textBlock.text);
      return jsonResponse({ error: 'Could not process that receipt — try again.' }, 502);
    }

    const validation = validateReceipt(parsedModelOutput);
    if (!validation.ok) {
      console.error('process-receipt validation failed', validation.error, parsedModelOutput);
      return jsonResponse({ error: validation.error }, 422);
    }

    const receipt: Receipt = validation.receipt;

    // Service-role client: RLS intentionally has no client-facing INSERT
    // policy on receipt_imports (plan section 7) — this function already did
    // its own membership check above, so it's safe to bypass RLS here.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      console.error('process-receipt missing SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Receipt was processed but could not be saved — try again.' }, 500);
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: insertedRow, error: insertError } = await serviceClient
      .from('receipt_imports')
      .insert({
        household_id: householdId,
        uploaded_by_household_member_id: membership.id,
        merchant_name: receipt.merchantName ?? null,
        purchase_date: receipt.purchaseDate ?? null,
        subtotal_cents: receipt.subtotalCents ?? null,
        tax_cents: receipt.taxCents ?? null,
        discount_cents: receipt.discountCents ?? null,
        total_cents: receipt.totalCents,
        raw_model_response: receipt,
      })
      .select()
      .single();

    if (insertError) {
      console.error('process-receipt insert failed', insertError);
      return jsonResponse({ error: 'Receipt was processed but could not be saved — try again.' }, 500);
    }

    return jsonResponse({ receiptImportId: insertedRow.id, receipt });
  } catch (error) {
    console.error('process-receipt unhandled error', error);
    return jsonResponse({ error: 'Something went wrong processing that receipt.' }, 500);
  }
});
