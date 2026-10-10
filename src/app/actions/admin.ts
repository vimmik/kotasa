"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getSettings, requireAdmin } from "@/lib/auth";
import { deleteLogins, syncPinLoginPhone, upsertPinLogin } from "@/lib/logins";
import { isValidPin, normalizePhone } from "@/lib/phone";
import { sendWeeklySms } from "@/lib/sms";
import { isValidDate, weekStart } from "@/lib/time";
import { round2, type ActionState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const cleanEmail = (v: string) => (v ? v.toLowerCase() : null);

// ---------------- People ----------------

export async function savePerson(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const id = str(f, "id") || null;
  const name = str(f, "full_name");
  const phoneRaw = str(f, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = cleanEmail(str(f, "email"));
  const pin = str(f, "pin");
  const isAdmin = f.get("is_admin") === "on";
  const status = id ? (f.get("active") === "on" ? "active" : "inactive") : "active";

  if (!name) return { error: "Enter a name" };
  if (phoneRaw && !phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  if (!phone && !email) return { error: "Add a mobile number (for SMS) or an email (for Google login)" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right" };
  if (pin && !isValidPin(pin)) return { error: "PIN must be 6 digits" };
  if (pin && !phone) return { error: "A PIN login needs a mobile number" };
  if (id === me.id && (!isAdmin || status !== "active")) return { error: "You can't remove your own admin access" };

  const admin = createAdminClient();
  if (phone) {
    const { data } = await admin.from("people").select("id, full_name").eq("phone", phone);
    const d = (data ?? []).find((x) => x.id !== id);
    if (d) return { error: `That number belongs to ${d.full_name}` };
  }
  if (email) {
    const { data } = await admin.from("people").select("id, full_name").eq("email", email);
    const d = (data ?? []).find((x) => x.id !== id);
    if (d) return { error: `That email belongs to ${d.full_name}` };
  }

  const row = { full_name: name, phone, email, is_admin: isAdmin, status };
  let personId = id;
  if (id) {
    const { error } = await admin.from("people").update(row).eq("id", id);
    if (error) return { error: error.message };
    if (phone) await syncPinLoginPhone(id, phone);
  } else {
    const { data, error } = await admin.from("people").insert({ ...row, created_by: me.id }).select("id").single();
    if (error || !data) return { error: error?.message ?? "Couldn't add" };
    personId = data.id;
  }
  if (pin && phone) {
    const err = await upsertPinLogin(personId!, phone, pin);
    if (err) return { error: `Saved, but the PIN failed: ${err}` };
  }
  refresh();
  return { ok: true, message: id ? "Saved" : `${name} added${pin ? " — tell them their PIN" : ""}` };
}

/** Approve a Google sign-up: either link it to an existing person or make it a new member. */
export async function approvePending(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const pendingId = str(f, "pending_id");
  const linkTo = str(f, "link_to");
  const admin = createAdminClient();
  const { data: p } = await admin.from("people").select("*").eq("id", pendingId).eq("status", "pending").maybeSingle();
  if (!p) return { error: "That request is gone" };

  if (linkTo) {
    const { data: target } = await admin.from("people").select("id, email").eq("id", linkTo).maybeSingle();
    if (!target) return { error: "Pick who this is" };
    const { error } = await admin.from("person_logins").update({ person_id: target.id }).eq("person_id", pendingId);
    if (error) return { error: error.message };
    await admin.from("people").delete().eq("id", pendingId);
    if (!target.email && p.email) await admin.from("people").update({ email: p.email }).eq("id", target.id);
    refresh();
    return { ok: true, message: "Linked to existing person" };
  }

  const phone = normalizePhone(str(f, "phone"));
  if (!phone) return { error: "Add their mobile number (for the weekly SMS), or link to an existing person" };
  const { data: dup } = await admin.from("people").select("full_name").eq("phone", phone).maybeSingle();
  if (dup) return { error: `That number belongs to ${dup.full_name} — link to them instead` };
  const { error } = await admin
    .from("people")
    .update({ status: "active", phone, full_name: str(f, "full_name") || p.full_name })
    .eq("id", pendingId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Approved" };
}

export async function rejectPending(f: FormData) {
  await requireAdmin();
  const id = str(f, "pending_id");
  const admin = createAdminClient();
  const { data: p } = await admin.from("people").select("status").eq("id", id).maybeSingle();
  if (p?.status === "pending") {
    await deleteLogins(id);
    await admin.from("people").delete().eq("id", id);
  }
  refresh();
}

// ---------------- Weekly SMS ----------------

export async function sendSmsNow(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const week = str(f, "week");
  if (!isValidDate(week)) return { error: "Invalid week" };
  const ids = f.getAll("person_ids").map(String).filter(Boolean);
  if (!ids.length) return { error: "Tick at least one person" };
  const s = await sendWeeklySms({ weekStart: weekStart(week), settings: await getSettings(), trigger: "manual", memberIds: ids });
  refresh();
  const parts = [
    s.sent && `${s.sent} sent`,
    s.dryRun && `${s.dryRun} dry run (SMS is off in Settings)`,
    s.failed && `${s.failed} failed`,
    s.skipped && `${s.skipped} skipped (no mobile number)`,
  ].filter(Boolean);
  return s.failed ? { error: parts.join(", ") } : { ok: true, message: parts.join(", ") || "Nothing to send" };
}

// ---------------- Settings ----------------

export async function saveSettings(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const time = (v: string) => (/^\d{2}:\d{2}$/.test(v) ? v : null);
  const bc = time(str(f, "breakfast_cutoff"));
  const lc = time(str(f, "lunch_cutoff"));
  const day = Number(str(f, "billing_weekday"));
  const hour = Number(str(f, "sms_send_hour"));
  const fee = round2(Number(str(f, "sms_fee")));
  const tpl = str(f, "sms_template");
  if (!bc || !lc) return { error: "Cutoff times must be HH:MM" };
  if (!(day >= 1 && day <= 7)) return { error: "Pick the billing day" };
  if (!(hour >= 0 && hour <= 23)) return { error: "Hour must be 0–23" };
  if (!(fee >= 0)) return { error: "SMS fee must be 0 or more" };
  if (!tpl.includes("{total}") || !tpl.includes("{link}")) return { error: "The SMS template needs {total} and {link}" };

  const { error } = await createAdminClient()
    .from("settings")
    .update({
      office_name: str(f, "office_name") || "Office",
      collector_id: str(f, "collector_id") || null,
      breakfast_cutoff: bc,
      lunch_cutoff: lc,
      billing_weekday: day,
      sms_send_hour: hour,
      sms_fee: fee,
      sms_enabled: f.get("sms_enabled") === "on",
      sms_template: tpl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Settings saved" };
}
