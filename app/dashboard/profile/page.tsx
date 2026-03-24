"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, CheckCircle2, User } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const supabase = createClient();
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [userId,   setUserId]   = useState("");
  const [fullName, setFullName] = useState("");
  const [email,    setEmail]    = useState("");
  const [fbPixel,  setFbPixel]  = useState("");
  const [ttPixel,  setTtPixel]  = useState("");
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);
      setEmail(session.user.email ?? "");

      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, fb_pixel_id, tiktok_pixel_id")
        .eq("id", session.user.id)
        .single();

      if (p) {
        setFullName(p.full_name ?? "");
        setFbPixel(p.fb_pixel_id ?? "");
        setTtPixel(p.tiktok_pixel_id ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name:       fullName.trim() || null,
        fb_pixel_id:     fbPixel.trim()  || null,
        tiktok_pixel_id: ttPixel.trim()  || null,
        updated_at:      new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      toast.error("Erro ao salvar perfil. Tente novamente.");
    } else {
      setSaved(true);
      toast.success("Perfil atualizado!");
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-5 py-10 space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Meu Perfil</h1>
          <p className="text-zinc-400">Atualize seus dados pessoais e preferências.</p>
        </div>

        {/* Avatar / identidade */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <User size={24} className="text-zinc-400" />
            </div>
            <div>
              <div className="font-medium text-zinc-100">{fullName || "—"}</div>
              <div className="text-sm text-zinc-500">{email}</div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Nome completo</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/25 placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">E-mail</label>
            <input
              value={email}
              disabled
              className="w-full rounded-xl bg-zinc-900/50 border border-white/5 px-4 py-3 text-sm text-zinc-500 cursor-not-allowed"
            />
            <p className="text-xs text-zinc-600">Para alterar o e-mail entre em contato com o suporte.</p>
          </div>
        </div>

        {/* Pixels de rastreamento */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-5">
          <div>
            <div className="font-medium text-zinc-100">Pixels de Rastreamento</div>
            <p className="text-xs text-zinc-500 mt-1">
              Seus pixels serão disparados nas páginas dos seus produtos para rastrear conversões.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Facebook Pixel ID</label>
            <input
              value={fbPixel}
              onChange={(e) => setFbPixel(e.target.value)}
              placeholder="Ex: 1234567890123456"
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/25 placeholder:text-zinc-600 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">TikTok Pixel ID</label>
            <input
              value={ttPixel}
              onChange={(e) => setTtPixel(e.target.value)}
              placeholder="Ex: ABCDE1FG2HIJ3KL45MNO"
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/25 placeholder:text-zinc-600 font-mono"
            />
          </div>
        </div>

        {/* Salvar */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-white text-black px-6 py-2.5 text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Salvando…</>
            ) : saved ? (
              <><CheckCircle2 size={14} className="text-emerald-600" /> Salvo!</>
            ) : (
              <><Save size={14} /> Salvar alterações</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
