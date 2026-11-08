import type { ProductFitReport } from './fitAnalyzer.ts';

/** Fields the catalog list needs. Review text stays on the single-SKU read. */
export interface CatalogEntry {
  id: string;
  sku: string;
  name: string;
  brand: string;
  overallVerdict: string;
  totalReviews: number;
}

export function catalogEntry(report: ProductFitReport): CatalogEntry {
  return {
    id: report.id,
    sku: report.sku,
    name: report.name,
    brand: report.brand,
    overallVerdict: report.overallVerdict,
    totalReviews: report.totalReviews,
  };
}
