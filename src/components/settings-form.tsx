"use client";

import { useActionState } from "react";
import { saveSettings } from "@/app/actions/admin";
import { FormMessage, SubmitButton } from "@/components/ui";
import { WEEKDAYS } from "@/lib/time";
import type { Settings } from "@/lib/types";

export function SettingsForm({ s, people }: { s: Settings; people: { id: string; name: string }[] }) {
  const [state, action] = useActionState(saveSettings, null);
  return (
    <form action={action} className="space-y-4">
      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Office</h2>
        <div>
          <label className="label" htmlFor="office_name">Office name</label>
          <input id="office_name" name="office_name" defaultValue={s.office_name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="collector_id">Meal and SMS collector</label>
          <select id="collector_id" name="collector_id" defaultValue={s.collector_id ?? ""} className="input">
            <option value="">Nobody</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Pays the food vendor and SMS bill; meal orders are owed to them.</p>
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Meal orders close at</h2>
        <div>
          <label className="label" htmlFor="breakfast_cutoff">Breakfast</label>
          <input id="breakfast_cutoff" name="breakfast_cutoff" type="time" defaultValue={s.breakfast_cutoff.slice(0, 5)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lunch_cutoff">Lunch</label>
          <input id="lunch_cutoff" name="lunch_cutoff" type="time" defaultValue={s.lunch_cutoff.slice(0, 5)} className="input" />
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Weekly SMS</h2>
        <div>
          <label className="label" htmlFor="billing_weekday">Send on (last office day)</label>
          <select id="billing_weekday" name="billing_weekday" defaultValue={s.billing_weekday} className="input">
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sms_send_hour">From hour (0–23)</label>
          <input id="sms_send_hour" name="sms_send_hour" type="number" min={0} max={23} defaultValue={s.sms_send_hour} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="sms_fee">SMS fee per person (Rs.)</label>
          <input id="sms_fee" name="sms_fee" inputMode="decimal" defaultValue={s.sms_fee} className="input" />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="sms_enabled" defaultChecked={s.sms_enabled} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>
            <b>Really send SMS.</b> When off, sends are logged as a dry run — nothing is sent or charged.
          </span>
        </label>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="sms_template">Message</label>
          <textarea id="sms_template" name="sms_template" defaultValue={s.sms_template} rows={3} className="input font-mono text-sm" />
          <p className="mt-1 text-xs text-muted">
            {"{name} {full_name} {week} {owe_lines} {total} {link} {office} {app}"} — must include {"{total}"} and {"{link}"}.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
