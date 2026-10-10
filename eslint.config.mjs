import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Group isolation: pages, components and group actions read and write through orgDb(), which
  // always filters by org_id. Only identity-level code may use the raw service-role client.
  {
    files: ["src/app/**", "src/components/**"],
    ignores: ["src/app/actions/auth.ts", "src/app/actions/admin.ts", "src/app/auth/callback/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/server",
              importNames: ["createAdminClient"],
              message: "Use orgDb(ctx.org.id) from @/lib/org-db, or a helper in src/lib, so queries stay inside one group.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
