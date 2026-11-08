import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretFitStoreProbe, readSupabaseEnv, remoteSkusFromCatalog, batchFitPayloads, batchFunctionMissing } from './supabaseFit.ts';
import type { ProductFitReport } from './fitAnalyzer.ts';

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

test('remote catalog rows keep fit fields and drop rows without a sku', () => {
  assert.deepEqual(
    remoteSkusFromCatalog([
      {
        sku: 'HM-1',
        productId: 'hm-1',
        brand: 'H&M',
        name: 'Tee',
        overallVerdict: 'True to Size',
        totalReviews: 4,
        committedAt: '2026-11-08T00:00:00Z',
        sizes: [{ size: 'M' }, { size: 'L' }],
        reviews: [{ body: 'secret review' }],
      },
      { name: 'missing sku' },
    ]),
    [
      {
        sku: 'HM-1',
        productId: 'hm-1',
        brand: 'H&M',
        name: 'Tee',
        overallVerdict: 'True to Size',
        totalReviews: 4,
        sizeCount: 2,
        committedAt: '2026-11-08T00:00:00Z',
      },
    ],
  );
  assert.deepEqual(remoteSkusFromCatalog(null), []);
});

test('a rejected empty sku means the fit store is reachable', () => {
  assert.deepEqual(interpretFitStoreProbe(null), { ok: true });
  assert.deepEqual(interpretFitStoreProbe('sku is required'), { ok: true });
  assert.deepEqual(interpretFitStoreProbe('permission denied for function commit_fit_report'), {
    ok: false,
    error: 'permission denied for function commit_fit_report',
  });
});

function stubReport(sku: string): ProductFitReport {
  return {
    id: sku.toLowerCase(),
    sku,
    brand: 'COS',
    name: sku,
    category: 'Shirting',
    price: '$80',
    fabricComposition: 'Cotton',
    totalReviews: 1,
    overallFitIndex: 0,
    overallVerdict: 'True to Size',
    gradingDelta: 0,
    overallDistribution: { runsSmallPct: 0, trueToSizePct: 100, runsLargePct: 0 },
    tshirtSignals: { overallShrinkagePct: 0, fabricOpacityPct: null },
    overallSentimentScore: 0,
    overallAvgRating: 4,
    sourceUrl: 'https://example.com',
    scraperTelemetry: { scrapedAt: '2026-11-08T00:00:00.000Z' },
    sizeSummaries: [],
  } as unknown as ProductFitReport;
}

test('two or more fit rows share one batch payload, and a missing function is not a write error', () => {
  assert.equal(batchFitPayloads([stubReport('A')]), null);
  const batch = batchFitPayloads([stubReport('A'), stubReport('B')], {
    B: [{ size: 'M', sortOrder: 1, chest_cm: 54, length_cm: null, sleeve_cm: null }],
  });
  assert.equal(batch?.length, 2);
  assert.equal(batch?.[0].sku, 'A');
  assert.equal(batch?.[0].chart.length, 0);
  assert.equal(batch?.[1].chart[0].chest_cm, 54);
  assert.equal(batchFunctionMissing('Could not find the function public.commit_fit_reports(payloads) in the schema cache'), true);
  assert.equal(batchFunctionMissing('sku is required'), false);
});
