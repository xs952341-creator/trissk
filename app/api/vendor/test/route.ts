// app/api/vendor/test/route.ts
// Compatibilidade: delega para a rota oficial app/api/vendor/test-webhook/route.ts
// Mantida para não quebrar integrações que apontem para /api/vendor/test.
// A lógica real está centralizada em test-webhook/route.ts.

export { POST } from "@/app/api/vendor/test-webhook/route";
