"use server";

import { refresh } from "next/cache";
import { can, requireMemberFromForm } from "@/lib/auth";
import { closeBooks, closedThrough, getClosings } from "@/lib/closing";
import { orgDb } from "@/lib/org-db";
import { fmtDay, isValidDate, todayColombo } from "@/lib/time";
import type { ActionState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function closeBooksNow(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "books.close")) return { error: "Your role can't close the books in this group" };
  const through = str(f, "closed_through");
  const note = str(f, "note") || null;
  if (!isValidDate(through)) return { error: "Pick the last date to close" };
  if (through > todayColombo()) return { error: "You can only close up to today. Pick today or an earlier date." };
  const last = await closedThrough(ctx.org.id);
  if (last && through <= last)
    return { error: `The books are already closed up to ${fmtDay(last)}. Pick a later date.` };

  const { error } = await closeBooks(ctx.org.id, through, ctx.member.id, note);
  if (error) return { error: "Couldn't close the books. Try again in a moment." };
  refresh();
  return { ok: true, message: `Closed up to ${fmtDay(through)}. Those balances won't change now.` };
}

/** Undo the latest close. Owners only: it unfreezes balances people may already have been told. */
export async function reopenBooks(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (ctx.member.role_key !== "owner") return { error: "Only an owner can reopen the books" };
  const latest = (await getClosings(ctx.org.id))[0];
  // The form names the close it shows, so a second click can't reopen an older one too.
  if (!latest || latest.id !== str(f, "id")) return { error: "That close was already reopened. Refresh the page." };
  const { error } = await orgDb(ctx.org.id).delete("org_closings").eq("id", latest.id);
  if (error) return { error: "Couldn't reopen. Try again in a moment." };
  refresh();
  return { ok: true, message: `Reopened the close up to ${fmtDay(latest.closed_through)}. Those dates can be changed again.` };
}

export async function saveAutoClose(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "books.close")) return { error: "Your role can't change this" };
  const { error } = await orgDb(ctx.org.id).update("org_settings", { auto_close: f.get("auto_close") === "on" });
  if (error) return { error: "Couldn't save. Try again in a moment." };
  refresh();
  return { ok: true, message: "Saved" };
}
