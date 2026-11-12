"use client";

import { useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { Camera, CircleNotch } from "@phosphor-icons/react/ssr";
import { scanBill } from "@/app/actions/expenses";
import type { ScannedBill } from "@/lib/receipt";

/** Longest side of the photo we send; plenty for a receipt and keeps the upload small. */
const MAX_SIDE = 1600;

/** Shrink a phone photo to a JPEG data URL under ~1 MB, so the upload is quick and fits the limit. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [[MAX_SIDE, 0.82], [1200, 0.72], [1000, 0.6]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 1_300_000) return url;
  }
  throw new Error("too big");
}

/** "Scan a bill": take or pick a photo, and the form fills itself in. Nothing is saved until you tap Add. */
export function BillScan({ onScanned }: { onScanned: (bill: ScannedBill) => void }) {
  const { slug } = useParams<{ slug: string }>();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    start(async () => {
      let image: string;
      try {
        image = await shrink(file);
      } catch {
        setError("Couldn't open that photo. Try another one.");
        return;
      }
      const f = new FormData();
      f.set("org", slug ?? "");
      f.set("image", image);
      const res = await scanBill(null, f);
      if (res?.error) setError(res.error);
      else if (res?.bill) onScanned(res.bill);
    });
    if (input.current) input.current.value = "";
  };

  return (
    <section className="card flex flex-wrap items-center gap-3">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
        <Camera size={18} weight="duotone" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">Have the bill?</h2>
        <p className="text-sm text-muted">Snap it and the items, tax, charges and discounts fill in. Check them, then pick who had what.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        id="bill-photo"
        onChange={(e) => pick(e.target.files?.[0])}
        disabled={pending}
      />
      <label htmlFor="bill-photo" className={`btn-ghost shrink-0 cursor-pointer ${pending ? "pointer-events-none opacity-60" : ""}`}>
        {pending ? (
          <>
            <CircleNotch size={16} className="animate-spin" aria-hidden="true" /> Reading…
          </>
        ) : (
          <>
            <Camera size={16} aria-hidden="true" /> Scan a bill
          </>
        )}
      </label>
      {error && (
        <p role="alert" className="w-full rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
