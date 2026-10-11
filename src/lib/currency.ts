import { rs } from "@/lib/types";

/** Currencies someone can pick for Me. LKR first; the rest roughly by how many Sri Lankans use them. */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "LKR", label: "Sri Lankan rupee" },
  { code: "USD", label: "US dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British pound" },
  { code: "AUD", label: "Australian dollar" },
  { code: "CAD", label: "Canadian dollar" },
  { code: "NZD", label: "New Zealand dollar" },
  { code: "AED", label: "UAE dirham" },
  { code: "SAR", label: "Saudi riyal" },
  { code: "QAR", label: "Qatari riyal" },
  { code: "KWD", label: "Kuwaiti dinar" },
  { code: "OMR", label: "Omani rial" },
  { code: "BHD", label: "Bahraini dinar" },
  { code: "SGD", label: "Singapore dollar" },
  { code: "MYR", label: "Malaysian ringgit" },
  { code: "JPY", label: "Japanese yen" },
  { code: "KRW", label: "South Korean won" },
  { code: "INR", label: "Indian rupee" },
  { code: "MVR", label: "Maldivian rufiyaa" },
  { code: "PKR", label: "Pakistani rupee" },
  { code: "BDT", label: "Bangladeshi taka" },
  { code: "NPR", label: "Nepalese rupee" },
];

const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const BY_COUNTRY: Record<string, string> = {
  LK: "LKR", US: "USD", GB: "GBP", AU: "AUD", CA: "CAD", NZ: "NZD", AE: "AED", SA: "SAR", QA: "QAR",
  KW: "KWD", OM: "OMR", BH: "BHD", SG: "SGD", MY: "MYR", JP: "JPY", KR: "KRW", IN: "INR", MV: "MVR",
  PK: "PKR", BD: "BDT", NP: "NPR",
  ...Object.fromEntries(EURO.map((c) => [c, "EUR"])),
};

/** Default Me currency for a 2-letter country code (e.g. Vercel's x-vercel-ip-country). */
export function currencyForCountry(country: string | null | undefined): string {
  return BY_COUNTRY[(country ?? "").toUpperCase()] ?? "LKR";
}

export function isCurrency(code: string) {
  return CURRENCIES.some((c) => c.code === code);
}

/** Money in the given currency. LKR keeps the app's own "Rs. 450" style. */
export function money(n: number, currency: string) {
  if (currency === "LKR") return rs(n);
  const cents = Math.round(Number(n) * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${Number(n).toFixed(cents ? 2 : 0)}`;
  }
}

/** Short prefix for amount fields: "Rs.", "$", "AED"… */
export function currencySymbol(currency: string) {
  if (currency === "LKR") return "Rs.";
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}
