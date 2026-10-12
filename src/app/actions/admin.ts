"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { can, requireMemberFromForm, type OrgContext } from "@/lib/auth";
import { mergeMembers, syncMemberContacts } from "@/lib/accounts";
import { profileOwnedByOrg, upsertPinLogin } from "@/lib/logins";
import { keyify } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { isPermission } from "@/lib/permissions";
import { isValidPin, normalizePhone } from "@/lib/phone";
import { sendTestSms, sendWeeklySms } from "@/lib/sms";
import { isValidDate, weekStart } from "@/lib/time";
import { CATEGORY_ICON_NAMES, round2, type ActionState, type Member, type Role } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;
const cleanEmail = (v: string) => (v ? v.toLowerCase() : null);
const denied = (what: string): ActionState => ({ error: `Your role can't ${what} in this group` });

// ---------------- Roles: who may hand out what ----------------

async function rolesOf(orgId: string): Promise<Map<string, Role>> {
  const { data } = await orgDb(orgId).select("org_roles", "key, label, permissions, is_system, sort");
  return new Map(((data ?? []) as Role[]).map((r) => [r.key, r]));
}

/** null = allowed. Nobody grants more than they hold; only owners make or unmake owners. */
async function checkRoleChange(ctx: OrgContext, target: Member | null, newRole: string): Promise<string | null> {
  const roles = await rolesOf(ctx.org.id);
  const role = roles.get(newRole);
  if (!role) return "Pick a role";
  const iAmOwner = ctx.member.role_key === "owner";
  if (!iAmOwner) {
    if (newRole === "owner" || target?.role_key === "owner") return "Only an owner can change owners";
    const extra = role.permissions.filter((p) => isPermission(p) && !ctx.perms.has(p));
    if (extra.length) return `You can't give the ${role.label} role; it has permissions you don't have`;
  }
  if (target?.role_key === "owner" && newRole !== "owner" && (await ownerCount(ctx.org.id)) <= 1)
    return "A group needs at least one owner. Make someone else owner first.";
  return null;
}

async function ownerCount(orgId: string) {
  const { count } = await orgDb(orgId)
    .select("members", "id", { count: "exact", head: true })
    .eq("role_key", "owner")
    .eq("status", "active");
  return count ?? 0;
}

// ---------------- Members ----------------

/** Add a member (guest, or with a new PIN login) or edit one. */
export async function saveMember(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  const db = orgDb(ctx.org.id);
  const id = str(f, "id") || null;
  if (id ? !can(ctx, "members.manage") : !can(ctx, "members.invite")) return denied(id ? "edit people" : "add people");

  const name = str(f, "full_name");
  const phoneRaw = str(f, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = cleanEmail(str(f, "email"));
  const pin = str(f, "pin");
  const roleKey = str(f, "role_key") || (id ? "" : "member");

  if (!name) return { error: "Enter a name" };
  if (phoneRaw && !phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  if (!id && !phone && !email) return { error: "Add a mobile number (for SMS) or an email (for Google login)" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right" };
  if (pin && !isValidPin(pin)) return { error: "PIN must be 6 digits" };

  let target: Member | null = null;
  if (id) {
    if (!UUID.test(id)) return { error: "That person is gone" };
    const { data } = await db.select("members").eq("id", id).maybeSingle();
    if (!data) return { error: "That person is gone" };
    target = data as Member;
  }

  // Unique inside this group
  for (const [col, val, label] of [["phone", phone, "number"], ["email", email, "email"]] as const) {
    if (!val) continue;
    const { data } = await db.select("members", "id, full_name").eq(col, val);
    const d = ((data ?? []) as { id: string; full_name: string }[]).find((x) => x.id !== id);
    if (d) return { error: `That ${label} belongs to ${d.full_name}` };
  }

  const status = target ? (f.get("active") === "on" ? "active" : "inactive") : "active";
  if (target && target.status !== "pending" && status !== target.status) {
    if (target.id === ctx.member.id) return { error: "To leave the group, use Leave on your Account page" };
    if (status === "inactive" && target.role_key === "owner" && (await ownerCount(ctx.org.id)) <= 1)
      return { error: "A group needs at least one owner" };
  }
  const nextRole = roleKey || target?.role_key || "member";
  if (nextRole !== (target?.role_key ?? "member")) {
    if (!can(ctx, "members.manage")) return denied("change roles");
    const err = await checkRoleChange(ctx, target, nextRole);
    if (err) return { error: err };
  }

  const row = {
    full_name: name,
    phone,
    email,
    role_key: nextRole,
    ...(target && target.status !== "pending" ? { status } : {}),
  };
  let member: Member;
  if (target) {
    const { data, error } = await db.update("members", row).eq("id", target.id).select("*").single();
    if (error || !data) return { error: error?.message ?? "Couldn't save" };
    member = data as Member;
  } else {
    const { data, error } = await db.insert("members", { ...row, created_by: ctx.member.id }).select("*").single();
    if (error || !data) return { error: error?.message ?? "Couldn't add" };
    member = data as Member;
  }

  if (pin) {
    const err = await setPinFor(ctx, member, pin);
    if (err) return { error: `Saved, but the PIN wasn't set: ${err}` };
  }
  refresh();
  return { ok: true, message: target ? "Saved" : `${name} added${pin ? ". Tell them their PIN." : ""}` };
}

/**
 * A PIN for someone the admin manages. New people get a new profile. For an existing profile,
 * only when that account lives entirely in this group, so one group can't take over an account
 * someone uses elsewhere.
 */
async function setPinFor(ctx: OrgContext, member: Member, pin: string): Promise<string | null> {
  const admin = createAdminClient();
  if (member.profile_id) {
    if (!(await profileOwnedByOrg(member.profile_id, ctx.org.id)))
      return "they also use Kotasa elsewhere; they can change their PIN on their Account page";
    const { data: p } = await admin.from("profiles").select("phone").eq("id", member.profile_id).single();
    const phone = p?.phone ?? member.phone;
    if (!phone) return "add their mobile number first";
    if (!p?.phone) await admin.from("profiles").update({ phone }).eq("id", member.profile_id);
    const err = await upsertPinLogin(member.profile_id, phone, pin);
    if (!err) await syncMemberContacts(member.profile_id);
    return err;
  }
  if (!member.phone) return "a PIN login needs a mobile number";
  const { data: taken } = await admin.from("profiles").select("id").eq("phone", member.phone).maybeSingle();
  if (taken) return "that number already has a Kotasa login; send them an invite link instead";
  const { data: profile, error } = await admin
    .from("profiles")
    .insert({ full_name: member.full_name, phone: member.phone, last_org_id: ctx.org.id })
    .select("id")
    .single();
  if (error || !profile) return error?.message ?? "couldn't create their login";
  const err = await upsertPinLogin(profile.id, member.phone, pin);
  if (err) {
    await admin.from("profiles").delete().eq("id", profile.id);
    return err;
  }
  await orgDb(ctx.org.id).update("members", { profile_id: profile.id }).eq("id", member.id);
  return null;
}

/**
 * The same person is in the group twice: an old guest row (added by mobile, no login) and the
 * row they got when they joined with an account. Move the guest's history onto the account row.
 */
export async function mergeMember(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "members.manage")) return denied("merge people");
  const fromId = str(f, "id");
  const intoId = str(f, "into");
  if (!UUID.test(fromId) || !UUID.test(intoId) || fromId === intoId) return { error: "Pick who this person really is" };
  const db = orgDb(ctx.org.id);
  const [{ data: guest }, { data: into }] = await Promise.all([
    db.select("members", "id, profile_id, status").eq("id", fromId).maybeSingle(),
    db.select("members", "id, profile_id, status").eq("id", intoId).maybeSingle(),
  ]);
  if (!guest || !into) return { error: "That person is gone" };
  if (guest.profile_id) return { error: "Only someone without a login can be merged into another person" };
  if (!into.profile_id) return { error: "Merge into the person who signs in with the app" };
  if (into.status === "pending") return { error: "Approve them first, then merge" };
  const err = await mergeMembers(ctx.org.id, fromId, intoId);
  if (err) return { error: err };
  refresh();
  return { ok: true, message: "Merged" };
}

/** Approve someone who joined with an approval-required invite. */
export async function approveMember(f: FormData) {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "members.manage")) return;
  const id = str(f, "id");
  if (UUID.test(id)) await orgDb(ctx.org.id).update("members", { status: "active" }).eq("id", id).eq("status", "pending");
  refresh();
}

export async function rejectMember(f: FormData) {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "members.manage")) return;
  const id = str(f, "id");
  // Pending members have no history, so the row can go.
  if (UUID.test(id)) await orgDb(ctx.org.id).delete("members").eq("id", id).eq("status", "pending");
  refresh();
}

// ---------------- Invites ----------------

export async function createInvite(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "members.invite")) return denied("invite people");
  const roleKey = str(f, "role_key") || "member";
  if (roleKey !== "member") {
    if (!can(ctx, "members.manage")) return denied("invite people with that role");
    const err = await checkRoleChange(ctx, null, roleKey);
    if (err) return { error: err };
  }
  const memberId = str(f, "member_id") || null;
  if (memberId) {
    if (!UUID.test(memberId)) return { error: "That person is gone" };
    const { data: guest } = await orgDb(ctx.org.id).select("members", "id").eq("id", memberId).is("profile_id", null).maybeSingle();
    if (!guest) return { error: "They already have a login" };
  }
  const days = Number(str(f, "expires_days")) || 0;
  const maxUses = memberId ? 1 : Number(str(f, "max_uses")) || null;
  const { error } = await orgDb(ctx.org.id).insert("org_invites", {
    role_key: roleKey,
    needs_approval: f.get("needs_approval") === "on",
    max_uses: maxUses,
    expires_at: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    member_id: memberId,
    created_by: ctx.member.id,
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: memberId ? "Invite link ready. Send it to them." : "Invite link created" };
}

export async function revokeInvite(f: FormData) {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "members.invite")) return;
  const id = str(f, "id");
  if (UUID.test(id)) await orgDb(ctx.org.id).update("org_invites", { revoked: true }).eq("id", id);
  refresh();
}

// ---------------- Weekly SMS ----------------

export async function sendSmsNow(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "sms.send")) return denied("send SMS");
  const week = str(f, "week");
  if (!isValidDate(week)) return { error: "Invalid week" };
  const ids = f.getAll("person_ids").map(String).filter((x) => UUID.test(x));
  if (!ids.length) return { error: "Tick at least one person" };
  const s = await sendWeeklySms({ weekStart: weekStart(week), group: ctx, trigger: "manual", memberIds: ids });
  refresh();
  const parts = [
    s.sent && `${s.sent} sent`,
    s.dryRun && `${s.dryRun} dry run (SMS is off in Settings)`,
    s.failed && `${s.failed} failed`,
    s.skipped && `${s.skipped} skipped (no mobile number)`,
    s.capped && `${s.capped} not sent (monthly SMS limit reached)`,
  ].filter(Boolean);
  return s.failed || s.capped ? { error: parts.join(", ") } : { ok: true, message: parts.join(", ") || "Nothing to send" };
}

/** Sends a test SMS to the admin's own number only, so nobody else can be messaged from here. */
export async function sendSmsTest(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "sms.send")) return denied("send SMS");
  const phone = ctx.member.phone;
  if (!phone) return { error: "Your member profile has no mobile number. Add one on the People page, then try again." };
  const res = await sendTestSms(phone, ctx.org.name);
  return res.ok
    ? { ok: true, message: `Test SMS sent to your number. Check your phone.` }
    : { error: `The SMS provider said no: ${res.response}` };
}

// ---------------- Group settings ----------------

async function settingsCtx(f: FormData): Promise<OrgContext | null> {
  const ctx = await requireMemberFromForm(f);
  return can(ctx, "settings.manage") ? ctx : null;
}

export async function saveGroup(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await settingsCtx(f);
  if (!ctx) return denied("change settings");
  const name = str(f, "name");
  if (!name || name.length > 60) return { error: "Give the group a name (up to 60 characters)" };
  const { error } = await createAdminClient().from("orgs").update({ name }).eq("id", ctx.org.id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Saved" };
}

export async function saveModules(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await settingsCtx(f);
  if (!ctx) return denied("change settings");
  const { error } = await orgDb(ctx.org.id).update("org_settings", {
    meals_enabled: f.get("meals_enabled") === "on",
    budgets_enabled: f.get("budgets_enabled") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Modules saved" };
}

export async function saveBilling(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await settingsCtx(f);
  if (!ctx) return denied("change settings");
  const day = Number(str(f, "billing_weekday"));
  const hour = Number(str(f, "sms_send_hour"));
  const fee = round2(Number(str(f, "sms_fee")));
  const cap = Number(str(f, "sms_monthly_cap"));
  const tpl = str(f, "sms_template");
  const collector = str(f, "collector_id") || null;
  if (!(day >= 1 && day <= 7)) return { error: "Pick the billing day" };
  if (!(hour >= 0 && hour <= 23)) return { error: "Hour must be 0–23" };
  if (!(fee >= 0)) return { error: "SMS fee must be 0 or more" };
  if (!(cap >= 0 && cap <= 5000)) return { error: "Monthly SMS limit must be 0–5000" };
  if (!tpl.includes("{total}") || !tpl.includes("{link}")) return { error: "The SMS template needs {total} and {link}" };
  if (collector) {
    if (!UUID.test(collector)) return { error: "Pick the collector" };
    const { data } = await orgDb(ctx.org.id).select("members", "id").eq("id", collector).eq("status", "active").maybeSingle();
    if (!data) return { error: "The collector must be an active member" };
  }
  const { error } = await orgDb(ctx.org.id).update("org_settings", {
    collector_id: collector,
    billing_weekday: day,
    sms_send_hour: hour,
    sms_fee: fee,
    sms_monthly_cap: cap,
    sms_enabled: f.get("sms_enabled") === "on",
    sms_template: tpl,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Billing saved" };
}

export async function saveCategory(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await settingsCtx(f);
  if (!ctx) return denied("change settings");
  const db = orgDb(ctx.org.id);
  const key = str(f, "key");
  const label = str(f, "label");
  const icon = str(f, "icon");
  if (!label || label.length > 30) return { error: "Give the category a short name" };
  if (!(CATEGORY_ICON_NAMES as readonly string[]).includes(icon)) return { error: "Pick an icon" };
  if (key) {
    const archived = f.get("archived") === "on";
    if (archived && key === "other") return { error: "“Other” is the fallback and can't be archived" };
    const { error } = await db.update("org_categories", { label, icon, archived }).eq("key", key);
    if (error) return { error: error.message };
  } else {
    let k = keyify(label);
    const { data: existing } = await db.select("org_categories", "key");
    const keys = new Set(((existing ?? []) as { key: string }[]).map((c) => c.key));
    for (let i = 2; keys.has(k); i++) k = `${keyify(label).slice(0, 26)}_${i}`;
    const { error } = await db.insert("org_categories", { key: k, label, icon, sort: keys.size });
    if (error) return { error: error.message };
  }
  refresh();
  return { ok: true, message: key ? "Saved" : `Added ${label}` };
}

export async function saveMealSlot(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await settingsCtx(f);
  if (!ctx) return denied("change settings");
  const db = orgDb(ctx.org.id);
  const key = str(f, "key");
  const label = str(f, "label");
  const cutoff = str(f, "cutoff");
  const pooled = f.get("pooled") === "on";
  if (!label || label.length > 30) return { error: "Give the meal a short name" };
  if (!/^\d{2}:\d{2}$/.test(cutoff)) return { error: "Cutoff must be HH:MM" };
  if (key) {
    const { error } = await db
      .update("org_meal_slots", { label, cutoff, pooled, archived: f.get("archived") === "on" })
      .eq("key", key);
    if (error) return { error: error.message };
  } else {
    let k = keyify(label);
    const { data: existing } = await db.select("org_meal_slots", "key");
    const keys = new Set(((existing ?? []) as { key: string }[]).map((c) => c.key));
    for (let i = 2; keys.has(k); i++) k = `${keyify(label).slice(0, 26)}_${i}`;
    const { error } = await db.insert("org_meal_slots", { key: k, label, cutoff, pooled, sort: keys.size });
    if (error) return { error: error.message };
  }
  refresh();
  return { ok: true, message: key ? "Saved" : `Added ${label}` };
}
