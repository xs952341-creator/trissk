export type StripeSaleMetadataInput = {
  userId: string;
  vendorId?: string | null;
  productId?: string | null;
  tierId?: string | null;
  playbookId?: string | null;
  affiliateCode?: string | null;
  type?: string | null;
  extras?: Record<string, string | number | null | undefined>;
};

export function buildStripeSaleMetadata(input: StripeSaleMetadataInput): Record<string, string> {
  const metadata: Record<string, string> = {
    userId: input.userId,
    vendorId: input.vendorId ?? "",
    productId: input.productId ?? "",
    tierId: input.tierId ?? "",
    playbookId: input.playbookId ?? "",
    affiliateCode: input.affiliateCode ?? "",
    productTierId: input.tierId ?? "",
    product_tier_id: input.tierId ?? "",
    type: input.type ?? "",
  };

  for (const [key, value] of Object.entries(input.extras ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      metadata[key] = String(value);
    }
  }

  return metadata;
}
