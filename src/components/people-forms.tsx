"use client";

import { useActionState, useState } from "react";
import { approvePending, rejectPending, savePerson } from "@/app/actions/admin";
import { FormMessage, SubmitButton } from "@/components/ui";
import { Avatar, Money } from "@/components/bits";
import { displayPhone } from "@/lib/phone";
import type { PersonWithLogin } from "@/lib/types";

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

function Fields({ p }: { p?: PersonWithLogin }) {
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

export function AddPersonForm() {
  const [state, action] = useActionState(savePerson, null);
  const [withPin, setWithPin] = useState(false);
  const [pin, setPin] = useState(randomPin);
  return (
    <form action={action} className="card space-y-3" key={state?.ok ? state.message : "f"}>
      <div>
        <h2 className="font-semibold">Add a person</h2>
        <p className="text-xs text-muted">
          Mobile only = they get the weekly SMS and a bill link. Add a Gmail so they can sign in with Google, or give a PIN.
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
            <button type="button" className="text-xs font-semibold text-brand" onClick={() => setPin(randomPin())}>New PIN</button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_admin" className="size-4 accent-[var(--brand)]" /> Admin
        </label>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Adding…">Add person</SubmitButton>
    </form>
  );
}

export function PersonRow({ p, net, isSelf }: { p: PersonWithLogin; net: number; isSelf: boolean }) {
  const [state, action] = useActionState(savePerson, null);
  const [open, setOpen] = useState(false);
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
            {p.is_admin && <span className="pill bg-amber-soft text-amber-ink">Admin</span>}
            {p.registered ? <span className="pill bg-brand-soft text-brand-strong">App</span> : <span className="pill bg-surface-2 text-muted">SMS only</span>}
            {p.status === "inactive" && <span className="pill bg-danger-soft text-danger">Inactive</span>}
          </p>
        </div>
        <Money value={net} signed className="hidden text-sm sm:inline" />
        <button type="button" className="btn-ghost min-h-9 px-3 py-1" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <form action={action} className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
          <input type="hidden" name="id" value={p.id} />
          <Fields p={p} />
          <div className="flex flex-wrap items-center gap-4">
            <input name="pin" className="input w-40 font-mono" maxLength={6} inputMode="numeric" placeholder={p.registered ? "New PIN (optional)" : "Set PIN (optional)"} aria-label="PIN" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={p.status === "active"} className="size-4 accent-[var(--brand)]" /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_admin" defaultChecked={p.is_admin} className="size-4 accent-[var(--brand)]" /> Admin
            </label>
            <SubmitButton>Save</SubmitButton>
          </div>
          <FormMessage state={state} />
        </form>
      )}
    </li>
  );
}

export function PendingRow({ p, people }: { p: PersonWithLogin; people: PersonWithLogin[] }) {
  const [state, action] = useActionState(approvePending, null);
  const [linkTo, setLinkTo] = useState("");
  const unlinked = people.filter((x) => !x.registered);
  return (
    <li className="space-y-3 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={p.full_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.full_name}</p>
          <p className="truncate text-xs text-muted">{p.email} · signed in with Google</p>
        </div>
      </div>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="pending_id" value={p.id} />
        <select name="link_to" value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className="input" aria-label="Who is this">
          <option value="">New person</option>
          {unlinked.map((x) => (
            <option key={x.id} value={x.id}>
              This is {x.full_name} ({displayPhone(x.phone)})
            </option>
          ))}
        </select>
        {linkTo ? (
          <span className="self-center text-xs text-muted">Their Google login joins the existing balance.</span>
        ) : (
          <input name="phone" className="input" placeholder="Their mobile, 0771234567" inputMode="tel" aria-label="Mobile number" />
        )}
        <div className="flex gap-2">
          <SubmitButton pendingText="…">Approve</SubmitButton>
          <button formAction={rejectPending} className="btn-danger" formNoValidate>
            Reject
          </button>
        </div>
      </form>
      <FormMessage state={state} />
    </li>
  );
}
