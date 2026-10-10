// Single place for the app's name and brand. Change here to rebrand.
export const BRAND = {
  name: "Kotasa",
  // කොටස = "a share / portion" in Sinhala
  tagline: "Share it. Settle it.",
  description: "Shared office expenses — meals, rides and anything else — split fairly and settled weekly.",
  colors: { primary: "#0E7C66", amber: "#F2A33A", darkBg: "#0B1210" },
};

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
