"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function WorkspaceAuditPage() {
  const params = useParams();
  const id = String((params as unknown as Record<string,unknown>).id);
  interface WorkspaceAuditLog {
  id: string;
  action: string;
  created_at: string;
  meta: Record<string, unknown> | null;
}

  const [logs, setLogs] = useState<WorkspaceAuditLog[]>([]);

  useEffect(() => {
    fetch(`/api/workspaces/${id}/audit?limit=100`).then(r=>r.json()).then(d=>setLogs(d.logs ?? [])).catch(()=>{});
  }, [id]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit logs</h1>
        <p className="text-sm text-muted-foreground">{id}</p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="p-3 font-medium border-b">Eventos</div>
        <div className="divide-y">
          {logs.map((l) => (
            <div key={l.id} className="p-3">
              <div className="text-sm font-medium">{l.action}</div>
              <div className="text-xs text-muted-foreground">{l.created_at}</div>
              <pre className="text-xs bg-muted/30 rounded p-2 mt-2 overflow-auto">{JSON.stringify(l.meta ?? {}, null, 2)}</pre>
            </div>
          ))}
          {logs.length===0 && <div className="p-3 text-sm text-muted-foreground">Sem logs.</div>}
        </div>
      </div>
    </div>
  );
}
