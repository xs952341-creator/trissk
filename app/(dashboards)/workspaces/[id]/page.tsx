"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function WorkspaceOverviewPage() {
  const params = useParams();
  const id = String((params as unknown as Record<string,unknown>).id);
  const [members, setMembers] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    fetch(`/api/workspaces/${id}/members`).then(r=>r.json()).then(d=>setMembers(d.members ?? [])).catch(()=>{});
  }, [id]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workspace</h1>
          <p className="text-sm text-muted-foreground">{id}</p>
        </div>
        <div className="flex gap-2">
          <Link className="px-3 py-2 rounded border" href={`/workspaces/${id}/members`}>Membros</Link>
          <Link className="px-3 py-2 rounded border" href={`/workspaces/${id}/audit`}>Audit logs</Link>
          <Link className="px-3 py-2 rounded border" href={`/workspaces/${id}/billing`}>Billing</Link>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <div className="font-medium mb-2">Resumo</div>
        <div className="text-sm text-muted-foreground">Membros ativos: {members.filter(m=>m.status==="active").length}</div>
      </div>
    </div>
  );
}
