// Milestone 7 — Checkpoint B: barcode -> product lookup.
//
// Provider chain (plan section 2 / approval adjustment 2 — this lives on the
// server, never called directly by the client): our own `products` cache ->
// Open Food Facts -> UPCitemdb -> unknown. A cache hit or a successful
// external lookup both return the same shape; an unknown barcode returns
// `{ product: null }` with a 200, not an error — per plan section 18, an
// unrecognized barcode is a normal case that falls through to manual entry,
// never a surfaced failure.
//
// Auth: `verify_jwt` stays on by default at the gateway, so an unauthenticated
// request never reaches this code. We additionally build an RLS-respecting
// client from the caller's forwarded Authorization header and confirm
// `auth.getUser()` succeeds before doing any work — no household check is
// needed here (unlike process-receipt, later), since `products` is
// intentionally global, not household-scoped.
//
// KEY SOURCE: deliberately NOT `Deno.env.get('SUPABASE_ANON_KEY')`. Supabase
// has a confirmed platform bug (github.com/supabase/supabase/issues/37648)
// where that reserved env var keeps serving the legacy JWT-format key after
// a project migrates to the new publishable/secret key system and disables
// legacy keys — every DB call made with it then fails with "Legacy API keys
// are disabled", which this function was swallowing into a bare 500. The
// `apikey` header on the incoming request is always the exact key the
// calling client is actually configured with (supabase-js sets it on every
// request, including function invocations), so it can never be stale the
// way the env var can — using it sidesteps the bug entirely rather than
// working around a moving target.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const BARCODE_PATTERN = /^[0-9]{8,14}$/;

// Mirrors src/features/scan/barcode.ts on the client exactly — kept as a
// separate copy because Edge Functions (Deno) and the app (Node/RN) aren't
// bundled together, not because the logic is meant to differ. UPC-A (12
// digits) and EAN-13 (13 digits, leading 0) encode the same product; without
// this, the same physical barcode could scan as either depending on which
// symbology the camera happened to decode, causing spurious cache/memory
// misses.
function normalizeBarcode(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length === 12 ? `0${trimmed}` : trimmed;
}

type CachedProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  source: string;
};

type ProviderResult = {
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  source: 'open_food_facts' | 'upcitemdb';
};

// Grocery categories are the only ones the app's own Kitchen enum uses
// (produce/dairy/meat/grains/canned/condiments/beverages/snacks/frozen,
// plus "other" as the client-side default). A provider's free-text category
// is mapped onto that fixed set on a best-effort keyword basis and left
// `null` when nothing matches — never fabricated, never passed through
// as an arbitrary string the client would have to trust blindly.
const CATEGORY_KEYWORDS: [string, string][] = [
  ['fruit', 'produce'],
  ['vegetable', 'produce'],
  ['produce', 'produce'],
  ['milk', 'dairy'],
  ['cheese', 'dairy'],
  ['yogurt', 'dairy'],
  ['dairy', 'dairy'],
  ['poultry', 'meat'],
  ['seafood', 'meat'],
  ['meat', 'meat'],
  ['bread', 'grains'],
  ['cereal', 'grains'],
  ['pasta', 'grains'],
  ['rice', 'grains'],
  ['grain', 'grains'],
  ['canned', 'canned'],
  ['condiment', 'condiments'],
  ['sauce', 'condiments'],
  ['soda', 'beverages'],
  ['juice', 'beverages'],
  ['drink', 'beverages'],
  ['beverage', 'beverages'],
  ['candy', 'snacks'],
  ['chip', 'snacks'],
  ['snack', 'snacks'],
  ['frozen', 'frozen'],
];

function matchCategory(haystack: string): string | null {
  const lower = haystack.toLowerCase();
  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (lower.includes(keyword)) return category;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function lookupOpenFoodFacts(barcode: string): Promise<ProviderResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories_tags,image_front_url`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const productName = json?.product?.product_name;
    if (json?.status !== 1 || !productName) return null;

    const brands = json.product.brands;
    const categoriesTags = json.product.categories_tags;

    return {
      name: String(productName).trim(),
      brand: typeof brands === 'string' && brands ? brands.split(',')[0].trim() : null,
      category: Array.isArray(categoriesTags) ? matchCategory(categoriesTags.join(' ')) : null,
      image_url: json.product.image_front_url ?? null,
      source: 'open_food_facts',
    };
  } catch (error) {
    console.error('Open Food Facts lookup failed', error);
    return null;
  }
}

async function lookupUpcItemDb(barcode: string): Promise<ProviderResult | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.items?.[0];
    if (!item?.title) return null;

    return {
      name: String(item.title).trim(),
      brand: typeof item.brand === 'string' && item.brand ? item.brand.trim() : null,
      category: typeof item.category === 'string' ? matchCategory(item.category) : null,
      image_url: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null,
      source: 'upcitemdb',
    };
  } catch (error) {
    console.error('UPCitemdb lookup failed', error);
    return null;
  }
}

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
    // See the KEY SOURCE note above — the incoming request's own `apikey`
    // header, not the env var, which can be stale.
    const supabaseKey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      // TEMP DIAGNOSTIC (checkpoint C bug hunt) — remove once the barcode
      // flow is confirmed working against the live project.
      console.error('lookup-barcode auth failed', userError?.message);
      return jsonResponse({ error: 'Not authenticated.' }, 401);
    }

    let body: { barcode?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }

    const rawBarcode = typeof body.barcode === 'string' ? body.barcode : '';
    const barcode = normalizeBarcode(rawBarcode);
    if (!BARCODE_PATTERN.test(barcode)) {
      return jsonResponse({ error: 'Invalid barcode.' }, 400);
    }

    // TEMP DIAGNOSTIC
    console.log('lookup-barcode request', { rawBarcode, normalizedBarcode: barcode, userId: user.id });

    // 1. Our own cache — universal across every household by design.
    const { data: cached, error: cacheError } = await supabase
      .from('products')
      .select('barcode, name, brand, category, image_url, source')
      .eq('barcode', barcode)
      .maybeSingle<CachedProduct>();

    if (cacheError) {
      // A cache READ failure (e.g. the exact "Legacy API keys are
      // disabled" failure mode this function used to be vulnerable to, or
      // the `products` table/migration missing) is a real, diagnosable
      // problem — surface it distinctly instead of silently treating it as
      // a cache miss and masking it behind a provider lookup.
      console.error('lookup-barcode products cache read failed', cacheError);
      return jsonResponse({ error: `Could not reach the product cache: ${cacheError.message}` }, 500);
    }

    if (cached) {
      console.log('lookup-barcode cache hit', barcode); // TEMP DIAGNOSTIC
      return jsonResponse({ product: cached });
    }

    // 2. Open Food Facts, then 3. UPCitemdb. Each provider swallows its own
    // failures (network error, bad response, not-found) and simply falls
    // through to the next — no raw provider error ever reaches the client.
    const fromOff = await lookupOpenFoodFacts(barcode);
    const found = fromOff ?? (await lookupUpcItemDb(barcode));
    console.log('lookup-barcode provider result', { barcode, source: found?.source ?? 'none' }); // TEMP DIAGNOSTIC

    if (!found) {
      return jsonResponse({ product: null });
    }

    const { error: upsertError } = await supabase
      .from('products')
      .upsert({ barcode, ...found }, { onConflict: 'barcode' });
    if (upsertError) {
      // A cache-write failure shouldn't fail the lookup itself — the user
      // still gets their result, just without it being remembered this time.
      console.error('products upsert failed', upsertError);
    }

    return jsonResponse({ product: { barcode, ...found } });
  } catch (error) {
    // Full detail goes to server logs only (`supabase functions logs
    // lookup-barcode`) — an arbitrary caught exception could carry
    // implementation detail that shouldn't reach the client, unlike the
    // specific, bounded `cacheError` case above.
    console.error('lookup-barcode unhandled error', error);
    return jsonResponse({ error: 'Something went wrong looking up that barcode.' }, 500);
  }
});
