import { getSettings, requireAdmin } from "@/lib/auth";
import { listPeople } from "@/lib/ledger";
import { SettingsForm } from "@/components/settings-form";

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, people] = await Promise.all([getSettings(), listPeople()]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm s={settings} people={people.map((p) => ({ id: p.id, name: p.full_name }))} />
    </div>
  );
}
