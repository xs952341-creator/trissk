// app/produtos/page.tsx
// Catálogo público (busca + filtros básicos)

import CatalogClient from "./ui/CatalogClient";

export const dynamic = "force-dynamic";

export default function ProdutosPage() {
  return <CatalogClient />;
}
