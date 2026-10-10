import { requirePermission } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getCategories, getMealSlots } from "@/lib/org-config";
import { BillingForm, CategoriesEditor, GroupForm, MealSlotsEditor, ModulesForm } from "@/components/settings-form";

export default async function SettingsPage(props: PageProps<"/g/[slug]/admin/settings">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "settings.manage");
  const [people, categories, slots] = await Promise.all([
    listMembers(ctx.org.id),
    getCategories(ctx.org.id, { includeArchived: true }),
    getMealSlots(ctx.org.id, { includeArchived: true }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <GroupForm name={ctx.org.name} />
      <ModulesForm s={ctx.settings} />
      <CategoriesEditor categories={categories} />
      {ctx.settings.meals_enabled && <MealSlotsEditor slots={slots} />}
      <BillingForm s={ctx.settings} people={people.map((p) => ({ id: p.id, name: p.full_name }))} />
    </div>
  );
}
