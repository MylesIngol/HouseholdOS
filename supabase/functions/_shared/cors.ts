// Shared CORS headers for every Edge Function in this project. The app's
// primary client is React Native (no browser CORS enforcement at all), but
// `app.json`'s `web.output: "static"` target does run in a real browser, so
// every function responds to preflight the same way rather than special-
// casing one platform.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
