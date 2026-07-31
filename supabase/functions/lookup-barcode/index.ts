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

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const BARCODE_PATTERN = /^[0-9]{8,14}$/;

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Not authenticated.' }, 401);
    }

    let body: { barcode?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }

    const barcode = typeof body.barcode === 'string' ? body.barcode.trim() : '';
    if (!BARCODE_PATTERN.test(barcode)) {
      return jsonResponse({ error: 'Invalid barcode.' }, 400);
    }

    // 1. Our own cache — universal across every household by design.
    const { data: cached } = await supabase
      .from('products')
      .select('barcode, name, brand, category, image_url, source')
      .eq('barcode', barcode)
      .maybeSingle<CachedProduct>();

    if (cached) {
      return jsonResponse({ product: cached });
    }

    // 2. Open Food Facts, then 3. UPCitemdb. Each provider swallows its own
    // failures (network error, bad response, not-found) and simply falls
    // through to the next — no raw provider error ever reaches the client.
    const found = (await lookupOpenFoodFacts(barcode)) ?? (await lookupUpcItemDb(barcode));

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
    console.error('lookup-barcode unhandled error', error);
    return jsonResponse({ error: 'Something went wrong looking up that barcode.' }, 500);
  }
});
