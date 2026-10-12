"use client";

import { useActionState, useState } from "react";
import { LinkSimple, Trash } from "@phosphor-icons/react/ssr";
import { approveMember, createInvite, mergeMember, rejectMember, revokeInvite, saveMember } from "@/app/actions/admin";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import { CopyLink } from "@/components/account-forms";
import { Avatar, Money } from "@/components/bits";
import { displayPhone } from "@/lib/phone";
import type { Invite, Member, MemberWithLogin, Role } from "@/lib/types";

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

function Fields({ p }: { p?: MemberWithLogin }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="label">Name</label>
        <input name="full_name" defaultValue={p?.full_name} className="input" required />
      </div>
      <div>
        <label className="label">Mobile (for SMS)</label>
        <input name="phone" defaultValue={displayPhone(p?.phone)} className="input" inputMode="tel" placeholder="0771234567" />
      </div>
      <div>
        <label className="label">Gmail (for Google login)</label>
        <input name="email" type="email" defaultValue={p?.email ?? ""} className="input" placeholder="name@gmail.com" />
      </div>
    </div>
  );
}

function RoleSelect({ roles, value, disabled }: { roles: Role[]; value: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Role</span>
      <select name="role_key" defaultValue={value} disabled={disabled} className="input w-auto py-1.5">
        {roles.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AddPersonForm({ roles, canManage }: { roles: Role[]; canManage: boolean }) {
  const [state, action] = useActionState(saveMember, null);
  const [withPin, setWithPin] = useState(false);
  const [pin, setPin] = useState(randomPin);
  return (
    <ActionForm action={action} className="card space-y-3" key={state?.ok ? state.message : "f"}>
      <OrgField />
      <div>
        <h2 className="font-semibold">Add a person</h2>
        <p className="text-xs text-muted">
          Mobile only: they get the weekly SMS and a bill link. Add a Gmail so they can sign in with Google, or give a
          PIN. Already on Kotasa? Send them an invite link instead.
        </p>
      </div>
      <Fields />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withPin} onChange={(e) => setWithPin(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Give a PIN login
        </label>
        {withPin && (
          <div className="flex items-center gap-2">
            <input name="pin" value={pin} onChange={(e) => setPin(e.target.value)} className="input w-28 font-mono" maxLength={6} inputMode="numeric" aria-label="PIN" />
            <button type="button" className="text-xs font-semibold text-brand" onClick={() => setPin(randomPin())}>
              New PIN
            </button>
          </div>
        )}
        {canManage && <RoleSelect roles={roles} value="member" />}
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Adding…">Add person</SubmitButton>
    </ActionForm>
  );
}

export function PersonRow({
  p,
  net,
  isSelf,
  roles,
  canManage,
  canInvite,
  claimUrl,
  twin,
  mergeTargets,
}: {
  p: MemberWithLogin;
  net: number;
  isSelf: boolean;
  roles: Role[];
  canManage: boolean;
  canInvite: boolean;
  /** an open "claim" invite for this guest, if any */
  claimUrl: string | null;
  /** a member with a login who looks like this guest (same number or email) */
  twin: Member | null;
  /** people with a login this guest can be merged into */
  mergeTargets: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveMember, null);
  const [mergeState, mergeAction] = useActionState(mergeMember, null);
  const [inviteState, inviteAction] = useActionState(createInvite, null);
  const [open, setOpen] = useState(false);
  const role = roles.find((r) => r.key === p.role_key);
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar name={p.full_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {p.full_name}
            {isSelf && <span className="font-normal text-muted"> (you)</span>}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{displayPhone(p.phone) || p.email || "—"}</span>
            {p.role_key !== "member" && <span className="pill bg-amber-soft text-amber-ink">{role?.label ?? p.role_key}</span>}
            {p.registered ? <span className="pill bg-brand-soft text-brand-strong">App</span> : <span className="pill bg-surface-2 text-muted">SMS only</span>}
            {p.status === "inactive" && <span className="pill bg-danger-soft text-danger">Inactive</span>}
            {canManage && twin && <span className="pill bg-amber-soft text-amber-ink">Same as {twin.full_name}?</span>}
          </p>
        </div>
        <Money value={net} signed className="hidden text-sm sm:inline" />
        {(canManage || (canInvite && !p.registered)) && (
          <button type="button" className="btn-ghost min-h-9 px-3 py-1" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Close" : canManage ? "Edit" : "Invite"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
          {canManage && (
            <ActionForm action={action} className="space-y-3">
              <OrgField />
              <input type="hidden" name="id" value={p.id} />
              <Fields p={p} />
              <div className="flex flex-wrap items-center gap-4">
                <input
                  name="pin"
                  className="input w-40 font-mono"
                  maxLength={6}
                  inputMode="numeric"
                  placeholder={p.registered ? "New PIN (optional)" : "Set PIN (optional)"}
                  aria-label="PIN"
                />
                <RoleSelect roles={roles} value={p.role_key} />
                {!isSelf && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={p.status === "active"} className="size-4 accent-[var(--brand)]" /> Active
                  </label>
                )}
                {isSelf && <input type="hidden" name="active" value="on" />}
                <SubmitButton>Save</SubmitButton>
              </div>
              <FormMessage state={state} />
            </ActionForm>
          )}
          {!p.registered && canManage && mergeTargets.length > 0 && (
            <form
              action={mergeAction}
              className="space-y-2 border-t border-line pt-3"
              onSubmit={(e) => {
                if (!confirm(`Merge ${p.full_name} into the selected person? Their balance and history move over. This can't be undone.`))
                  e.preventDefault();
              }}
            >
              <OrgField />
              <input type="hidden" name="id" value={p.id} />
              <p className="text-xs text-muted">
                {twin
                  ? `${twin.full_name} has the same mobile number or email. If it's the same person, merge them: ${p.full_name.split(" ")[0]}'s balance and history move to ${twin.full_name}.`
                  : `Already in the group with the app under another name? Merge ${p.full_name.split(" ")[0]} into them: the balance and history move over.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`merge-${p.id}`}>
                  Merge into
                </label>
                <select id={`merge-${p.id}`} name="into" defaultValue={twin?.id ?? ""} className="input w-auto py-1.5" required>
                  <option value="" disabled>
                    Same person as…
                  </option>
                  {mergeTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn-ghost" pendingText="Merging…">
                  Merge
                </SubmitButton>
              </div>
              <FormMessage state={mergeState} />
            </form>
          )}
          {!p.registered && canInvite && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs text-muted">
                Send {p.full_name.split(" ")[0]} a link to sign in. Their balance and history come with them.
              </p>
              {claimUrl ? (
                <CopyLink url={claimUrl} label={`Invite link for ${p.full_name}`} />
              ) : (
                <form action={inviteAction}>
                  <OrgField />
                  <input type="hidden" name="member_id" value={p.id} />
                  <SubmitButton className="btn-ghost" pendingText="Creating…">
                    <LinkSimple size={16} aria-hidden="true" /> Create their invite link
                  </SubmitButton>
                </form>
              )}
              <FormMessage state={inviteState} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function PendingRow({ p }: { p: MemberWithLogin }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar name={p.full_name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.full_name}</p>
        <p className="truncate text-xs text-muted">{p.email ?? displayPhone(p.phone)} · wants to join</p>
      </div>
      <form className="flex gap-2">
        <OrgField />
        <input type="hidden" name="id" value={p.id} />
        <SubmitButton formAction={approveMember} pendingText="…">
          Approve
        </SubmitButton>
        <button formAction={rejectMember} className="btn-danger">
          Reject
        </button>
      </form>
    </li>
  );
}

export function InviteLinks({
  invites,
  roles,
  canManage,
}: {
  invites: (Invite & { url: string })[];
  roles: Role[];
  canManage: boolean;
}) {
  const [state, action] = useActionState(createInvite, null);
  const general = invites.filter((i) => !i.member_id);
  const roleLabel = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Invite links</h2>
        <p className="text-xs text-muted">
          Anyone with the link can join after signing in. Turn on approval if you share it widely.
        </p>
      </div>
      {general.length > 0 && (
        <ul className="space-y-3">
          {general.map((i) => (
            <li key={i.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className="pill bg-surface-2 text-ink">{roleLabel(i.role_key)}</span>
                {i.needs_approval && <span className="pill bg-amber-soft text-amber-ink">Needs approval</span>}
                <span>
                  {i.uses} joined{i.max_uses ? ` of ${i.max_uses}` : ""}
                  {i.expires_at ? ` · expires ${new Date(i.expires_at).toLocaleDateString("en-GB")}` : ""}
                </span>
                <form action={revokeInvite} className="ml-auto">
                  <OrgField />
                  <input type="hidden" name="id" value={i.id} />
                  <button className="flex items-center gap-1 font-semibold text-danger" aria-label="Turn off this link">
                    <Trash size={13} aria-hidden="true" /> Turn off
                  </button>
                </form>
              </div>
              <CopyLink url={i.url} label="Invite link" />
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={action} className="flex flex-wrap items-center gap-3 border-t border-line pt-3" key={state?.message}>
        <OrgField />
        {canManage && <RoleSelect roles={roles.filter((r) => r.key !== "owner")} value="member" />}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="needs_approval" className="size-4 accent-[var(--brand)]" /> Needs approval
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Expires</span>
          <select name="expires_days" defaultValue="14" className="input w-auto py-1.5">
            <option value="1">in 1 day</option>
            <option value="7">in 7 days</option>
            <option value="14">in 14 days</option>
            <option value="0">never</option>
          </select>
        </label>
        <SubmitButton className="btn-ghost" pendingText="Creating…">
          <LinkSimple size={16} aria-hidden="true" /> New invite link
        </SubmitButton>
        <FormMessage state={state} />
      </ActionForm>
    </section>
  );
}
