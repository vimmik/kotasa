import { rs } from "@/lib/types";

const first = (name: string) => name.trim().split(" ")[0];

/** A friendly nudge to someone who owes you, ready for WhatsApp or any chat. */
export function remindText(v: { to: string; group: string; amount: number; payDetails?: string; link?: string }) {
  return [
    `Hi ${first(v.to)}, a small reminder: ${rs(v.amount)} for ${v.group} is still open on Kotasa.`,
    v.payDetails && `You can send it to: ${v.payDetails}`,
    v.link ? `Paid already? Record it here: ${v.link}` : "Paid already? Tell me and I'll mark it.",
    "Thanks!",
  ]
    .filter(Boolean)
    .join("\n");
}

/** "I've paid you" note: for after recording a payment, or for a guest who can't record one. */
export function paidText(v: { to: string; from: string; group: string; amount: number; recorded: boolean }) {
  return v.recorded
    ? `Hi ${first(v.to)}, I sent you ${rs(v.amount)} for ${v.group} and recorded it on Kotasa. Have a look when you can. Thanks!`
    : `Hi ${first(v.to)}, I sent you ${rs(v.amount)} for ${v.group}. Can you mark it as received on Kotasa? Thanks! - ${first(v.from)}`;
}

/** After recording a payment made earlier: ask the person who got it to confirm it on Kotasa. */
export function confirmText(v: { to: string; group: string; amount: number; day: string; link: string }) {
  return `Hi ${first(v.to)}, I recorded the ${rs(v.amount)} I paid you on ${v.day} for ${v.group} on Kotasa. Can you confirm you got it? It's on your Home: ${v.link}`;
}
