import test from 'node:test';
import assert from 'node:assert/strict';
import { readSupabaseEnv } from './supabaseFit.ts';

test('readSupabaseEnv requires a url and prefers the secret key', () => {
  assert.equal(readSupabaseEnv({}), null);
  assert.equal(
    readSupabaseEnv({ SUPABASE_URL: 'https://example.supabase.co' }),
    null,
  );
  assert.deepEqual(
    readSupabaseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'pub',
    }),
    { url: 'https://example.supabase.co', key: 'pub' },
  );
  assert.equal(
    readSupabaseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'pub',
      SUPABASE_SECRET_KEY: 'sec',
    })?.key,
    'sec',
  );
});
