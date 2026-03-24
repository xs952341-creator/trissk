"use client";

import { useEffect } from "react";

export default function AffiliateTracker({ code }: { code: string | null }) {
  useEffect(() => {
    if (!code) return;
    fetch("/api/affiliate/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }, [code]);

  return null;
}
