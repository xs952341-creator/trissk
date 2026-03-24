export type Currency = "BRL" | "USD" | "EUR";

export type InstallmentsRequest = {
  amountCents: number;
  currency: Currency;
  customer: {
    name: string;
    email: string;
    document?: string;
    phone?: string;
  };
  metadata?: Record<string, string>;
};

export type CreateInstallmentPaymentResult =
  | { kind: "redirect"; url: string }
  | { kind: "pix"; qrCode?: string; copyPaste?: string; expiresAt?: string }
  | { kind: "error"; message: string };
