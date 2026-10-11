import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy policy" };

const mail = `mailto:${BRAND.contactEmail}`;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="11 October 2026">
      <section>
        <p>
          {BRAND.name} helps groups share costs and helps you keep your own budget. It is built and run by{" "}
          {BRAND.developer.name} in Sri Lanka. This page explains what we collect, why, who can see it, and how to
          have it deleted. Questions: <a href={mail}>{BRAND.contactEmail}</a>.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your name, and your email address if you sign in with Google. We get these
            from Google when you agree to it. We don&apos;t get your Google password, contacts or anything else.
          </li>
          <li>
            <strong>Your mobile number</strong>, if you or a group admin adds it. It&apos;s used for logging in with a
            PIN and for the weekly SMS. Your PIN is stored only as a secure hash.
          </li>
          <li>
            <strong>What you and your groups enter:</strong> expenses, splits, meal orders, payments between people,
            budgets and notes.
          </li>
          <li>
            <strong>Me, your personal space:</strong> your budgets, your spending, and your take-home pay and payday if
            you add them.
          </li>
          <li>
            <strong>Technical data:</strong> a sign-in cookie that keeps you logged in, your theme choice (saved in your
            browser), and anonymous page-view counts from Vercel Analytics, which uses no cookies.
          </li>
        </ul>
      </section>

      <section>
        <h2>Who can see what</h2>
        <ul>
          <li>People in a group see that group&apos;s expenses, balances and member names. They never see your other groups.</li>
          <li>
            <strong>Me is private.</strong> Nobody else, group admins included, can see your budgets, your own spending
            or your pay.
          </li>
          <li>
            Someone added to a group by name and mobile number gets a weekly SMS with a link to a read-only bill. Anyone
            who has that link can see that one person&apos;s bill in that group, so treat it like a private message.
          </li>
          <li>We don&apos;t sell your data, show ads, or share it with anyone except the services below.</li>
        </ul>
      </section>

      <section>
        <h2>Services we use</h2>
        <p>These process data for us, only to run {BRAND.name}:</p>
        <ul>
          <li><strong>Supabase:</strong> the database and sign-in.</li>
          <li><strong>Vercel:</strong> hosting, and the anonymous page-view counts.</li>
          <li><strong>Google:</strong> &ldquo;Sign in with Google&rdquo;.</li>
          <li><strong>Text.lk:</strong> sends the weekly SMS. It receives the mobile number and the message text.</li>
        </ul>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          We keep your data while you use {BRAND.name}. If you leave a group, its history stays with the group, because
          the other members&apos; balances depend on it. Your name stays on those entries.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>You can change your name, currency, pay and categories in Me › Settings, and delete your own entries.</li>
          <li>You can switch off the weekly SMS by asking your group admin.</li>
          <li>
            To get a copy of your data, or to have your account and your Me data deleted, email{" "}
            <a href={mail}>{BRAND.contactEmail}</a> from the address you sign in with. We reply within 30 days.
          </li>
        </ul>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          All traffic is encrypted. The database can&apos;t be read from the browser: every request is checked on our
          server first, and each group&apos;s data is kept separate from every other group&apos;s.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we change this policy, we&apos;ll update the date at the top. If a change is significant, we&apos;ll tell you
          in the app. See also our <Link href="/terms">terms of use</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
