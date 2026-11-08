import type { ProductFitReport } from './fitAnalyzer.ts';

export interface ScrapablePresetTarget {
  id: string;
  label: string;
  brand: string;
  sku: string;
  category: ProductFitReport['category'];
  url: string;
  description: string;
  expectedTendency: string;
}

/** Mock-store pages the workbench can scrape. Kept out of seedCatalog so the sample reviews are not in the first script. */
export const SCRAPABLE_PRESET_TARGETS: ScrapablePresetTarget[] = [
  {
    id: 'hm-heavyweight-relaxed-tee',
    label: 'H&M Relaxed Fit Heavyweight Tee (HM-1096385)',
    brand: 'H&M (Blank Staples)',
    sku: 'HM-1096385-WHT',
    category: 'T-Shirts & Tops',
    url: '/api/mock-store/hm-heavyweight-relaxed-tee',
    description: '240 GSM Heavyweight Cotton · 20 reviews across XS–XXL',
    expectedTendency: 'Slightly Large (+0.19)',
  },
  {
    id: 'hm-regular-fit-crew-tee',
    label: 'H&M Regular Fit Crew-Neck Tee (HM-0685816)',
    brand: 'H&M Divided',
    sku: 'HM-0685816-BLK',
    category: 'T-Shirts & Tops',
    url: '/api/mock-store/hm-regular-fit-crew-tee',
    description: '160 GSM Lightweight Jersey · 9 reviews across XS–XXL',
    expectedTendency: 'Runs Small (-0.48)',
  },
  {
    id: 'solaris-linen-shirt',
    label: 'Solaris Belgian Linen Camp Shirt (ATC-312)',
    brand: 'Atelier Côte',
    sku: 'ATC-312-SND',
    category: 'Shirting',
    url: '/api/mock-store/solaris-linen-shirt',
    description: '195 GSM Belgian Flax Linen · 11 reviews across XS–XXL',
    expectedTendency: 'Runs Large (+0.48)',
  },
  {
    id: 'corsa-sculpt-midi-dress',
    label: 'Corsa Compression Rib Midi Dress (STV-904)',
    brand: 'Studio Veloce',
    sku: 'STV-904-BLK',
    category: 'Dresses',
    url: '/api/mock-store/corsa-sculpt-midi-dress',
    description: 'Compact Viscose Rib · 9 reviews across XS–XXL',
    expectedTendency: 'Runs Small (-0.62)',
  },
  {
    id: 'nordic-boiled-wool-overshirt',
    label: 'Nordic Boiled Wool Overshirt (FJL-508)',
    brand: 'Fjord & Loom',
    sku: 'FJL-508-GRY',
    category: 'Outerwear',
    url: '/api/mock-store/nordic-boiled-wool-overshirt',
    description: '420 GSM Boiled Virgin Wool · 6 reviews across XS–XXL',
    expectedTendency: 'Grading Compression in L–XXL',
  },
];
