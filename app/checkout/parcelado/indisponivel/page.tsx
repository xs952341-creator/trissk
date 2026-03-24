export default function ParceladoIndisponivel() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold tracking-tight">Parcelamento</h1>
        <p className="mt-2 text-sm text-white/70">
          Este fluxo está preparado para Pagar.me/Efi, mas ainda não foi ativado com chaves e tokenização do provedor.
        </p>
      </div>
    </div>
  );
}
