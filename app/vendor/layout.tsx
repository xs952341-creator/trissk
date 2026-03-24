// app/vendor/layout.tsx — Layout compartilhado das páginas públicas de vendor
// (separado do (dashboards) layout que já existe)
import { Suspense } from "react";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b]">
      <Suspense>{children}</Suspense>
    </div>
  );
}
