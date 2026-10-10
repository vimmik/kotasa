"use client";

import { useActionState, useState } from "react";
import { createGroupAction } from "@/app/actions/auth";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { ORG_KINDS, type OrgKind } from "@/lib/types";

export function CreateGroupForm() {
  const [state, action] = useActionState(createGroupAction, null);
  const [kind, setKind] = useState<OrgKind>("office");
  return (
    <ActionForm action={action} className="card space-y-4">
      <div>
        <h2 className="font-semibold">Create a group</h2>
        <p className="text-xs text-muted">You become its owner. You can change modules and categories later.</p>
      </div>
      <div>
        <label className="label" htmlFor="group-name">Name</label>
        <input id="group-name" name="name" maxLength={60} className="input" placeholder="Colombo office" autoComplete="off" required />
      </div>
      <fieldset>
        <legend className="label">What is it for?</legend>
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ORG_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${kind === k.id ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
            >
              <span className={`block text-sm font-semibold ${kind === k.id ? "text-brand-strong" : ""}`}>{k.label}</span>
              <span className="text-xs text-muted">{k.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating…">Create group</SubmitButton>
    </ActionForm>
  );
}
