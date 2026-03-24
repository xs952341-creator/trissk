import React from "react";

export type LandingBlock =
  | { type: "hero"; title: string; subtitle?: string; ctaText?: string }
  | { type: "benefits"; title?: string; items: string[] }
  | { type: "faq"; title?: string; items: { q: string; a: string }[] }
  | { type: "testimonials"; title?: string; items: { name: string; text: string }[] }
  | { type: "cta"; title: string; subtitle?: string; buttonText?: string };

export function BlocksRenderer({ blocks }: { blocks: LandingBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-8 space-y-6">
      {blocks.map((b, idx) => {
        switch (b.type) {
          case "hero":
            return (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-2xl font-semibold tracking-tight">{b.title}</h2>
                {b.subtitle ? <p className="mt-2 text-white/70">{b.subtitle}</p> : null}
                {b.ctaText ? (
                  <div className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black">{b.ctaText}</div>
                ) : null}
              </div>
            );
          case "benefits":
            return (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                {b.title ? <h3 className="text-lg font-semibold">{b.title}</h3> : null}
                <ul className="mt-3 grid gap-2 md:grid-cols-2">
                  {b.items?.map((it, i) => (
                    <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">{it}</li>
                  ))}
                </ul>
              </div>
            );
          case "faq":
            return (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                {b.title ? <h3 className="text-lg font-semibold">{b.title}</h3> : null}
                <div className="mt-3 space-y-3">
                  {b.items?.map((it, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-sm font-medium">{it.q}</div>
                      <div className="mt-2 text-sm text-white/70">{it.a}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          case "testimonials":
            return (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                {b.title ? <h3 className="text-lg font-semibold">{b.title}</h3> : null}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {b.items?.map((it, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-sm font-medium">{it.name}</div>
                      <div className="mt-2 text-sm text-white/70">{it.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          case "cta":
            return (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <h3 className="text-xl font-semibold">{b.title}</h3>
                {b.subtitle ? <p className="mt-2 text-white/70">{b.subtitle}</p> : null}
                {b.buttonText ? (
                  <div className="mt-4 inline-flex rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">{b.buttonText}</div>
                ) : null}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
