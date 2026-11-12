import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { round2 } from "@/lib/types";

/** What a bill photo said, ready to drop into the "By item" form. Amounts are positive. */
export type ScannedBill = {
  merchant: string;
  date: string | null;
  items: { name: string; amount: number }[];
  charges: { label: string; amount: number }[];
  discounts: { label: string; amount: number }[];
  /** the total printed on the bill, if it shows one */
  printedTotal: number | null;
};

/** Scanning needs an Anthropic API key; without one the "Scan a bill" button isn't shown. */
export const receiptScanEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "merchant", "date", "items", "charges", "discounts", "total"],
  properties: {
    readable: { type: "boolean", description: "false if this is not a bill/receipt or it can't be read" },
    merchant: { type: "string", description: "Shop or restaurant name, or empty" },
    date: { type: "string", description: "Bill date as YYYY-MM-DD, or empty if not shown" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "amount"],
        properties: {
          name: { type: "string" },
          quantity: { type: "integer" },
          amount: { type: "number", description: "Line total for this item (quantity x unit price)" },
        },
      },
    },
    charges: {
      type: "array",
      description: "Tax, VAT, service charge, delivery fee, packaging, tips and other additions",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount"],
        properties: { label: { type: "string" }, amount: { type: "number" } },
      },
    },
    discounts: {
      type: "array",
      description: "Promotions, discounts, vouchers, as positive numbers",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount"],
        properties: { label: { type: "string" }, amount: { type: "number" } },
      },
    },
    total: { type: "number", description: "Final total printed on the bill, or 0 if none" },
  },
} as const;

const PROMPT = `Read this bill or receipt and list what is on it.
- items: each ordered item with its line total. Option or size lines printed under an item (like "Full (LKR 265.00)" or "Extra cheese") are already part of that item's price; don't list them as separate items. When the bill shows an item subtotal, the item amounts should add up to it.
- charges: tax, VAT, service charge, delivery fee, packaging and similar, each as its own line.
- discounts: promotions, discounts and vouchers, as positive amounts.
- Don't list the subtotal, total, payments, change or card details as items.
- Use plain numbers without currency symbols or thousands separators.`;

/** Read a bill photo (base64 JPEG/PNG/WebP) with Claude. */
export async function scanReceipt(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<ScannedBill | { error: string }> {
  const client = new Anthropic();
  let res;
  try {
    res = await client.beta.messages.create({
      model: process.env.RECEIPT_MODEL || "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { error: "The bill reader is busy. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { error: "Bill scanning isn't set up (the API key is wrong). Ask the app admin." };
    if (e instanceof Anthropic.APIError) return { error: `Couldn't read the bill (${e.status ?? "error"}). Try again, or enter it by hand.` };
    return { error: "Couldn't reach the bill reader. Check your connection and try again." };
  }
  if (res.stop_reason === "refusal") return { error: "Couldn't read that photo. Enter the bill by hand." };
  if (res.stop_reason === "max_tokens") return { error: "That bill is too long to read in one go. Enter it by hand." };
  const text = res.content.find((b) => b.type === "text");
  let data: {
    readable: boolean;
    merchant: string;
    date: string;
    items: { name: string; quantity: number; amount: number }[];
    charges: { label: string; amount: number }[];
    discounts: { label: string; amount: number }[];
    total: number;
  };
  try {
    data = JSON.parse(text && text.type === "text" ? text.text : "");
  } catch {
    return { error: "Couldn't read the bill. Try a sharper photo, or enter it by hand." };
  }
  if (!data.readable || !data.items?.length) return { error: "That doesn't look like a bill, or it's too blurry. Try a sharper photo." };
  const clean = <T extends { amount: number }>(rows: T[]) => rows.filter((r) => Number(r.amount) > 0).map((r) => ({ ...r, amount: round2(Math.abs(Number(r.amount))) }));
  return {
    merchant: (data.merchant ?? "").trim().slice(0, 80),
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date : null,
    items: clean(data.items).map((i) => ({
      name: `${i.quantity > 1 ? `${i.quantity} × ` : ""}${(i.name ?? "").trim() || "Item"}`.slice(0, 60),
      amount: i.amount,
    })),
    charges: clean(data.charges ?? []).map((c) => ({ label: (c.label ?? "").trim().slice(0, 40) || "Charge", amount: c.amount })),
    discounts: clean(data.discounts ?? []).map((c) => ({ label: (c.label ?? "").trim().slice(0, 40) || "Discount", amount: c.amount })),
    printedTotal: Number(data.total) > 0 ? round2(Number(data.total)) : null,
  };
}
