// Single place for the app's name and brand. Change here to rebrand.
export const BRAND = {
  name: "Kotasa",
  // කොටස = "a share / portion" in Sinhala
  tagline: "Share it. Settle it.",
  description: "Split shared costs with any group, settle up weekly, and see how much you can safely spend today.",
  colors: { primary: "#0E7C66", amber: "#F2A33A", darkBg: "#0B1210" },
  developer: { name: "Vimmik", url: "https://github.com/vimmik", logo: "/brand/vimmik.png" },
  // Shown on /privacy and /terms for questions and data deletion.
  contactEmail: "info@vimmik.com",
};

export function appUrl() {
  // Prefer the explicit public URL. On Vercel, fall back to the deployment's own
  // URL so a missing NEXT_PUBLIC_APP_URL never ships localhost links to production.
  // (VERCEL_* are server-only; appUrl() is called from server components/actions.)
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (vercel ? `https://${vercel}` : "http://localhost:3000");
  return base.replace(/\/$/, "");
}
