import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Terms of use" };

const mail = `mailto:${BRAND.contactEmail}`;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="11 October 2026">
      <section>
        <p>
          These terms cover your use of {BRAND.name}, built and run by {BRAND.developer.name} in Sri Lanka. By using{" "}
          {BRAND.name} you agree to them. If you don&apos;t agree, please don&apos;t use it.
        </p>
      </section>

      <section>
        <h2>What {BRAND.name} is</h2>
        <p>
          {BRAND.name} is a record-keeping tool. It keeps track of shared expenses, who owes whom, and your own budget,
          based on what you and your groups enter. <strong>It doesn&apos;t hold or move money.</strong> Paying people back
          happens outside the app, and a payment shows in {BRAND.name} only when someone records it.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Keep your PIN and Google account safe. What happens in your account is your responsibility.</li>
          <li>Use your real name, so the people in your groups know who you are.</li>
          <li>Only add someone&apos;s mobile number to a group if they&apos;ve agreed to receive its weekly SMS.</li>
        </ul>
      </section>

      <section>
        <h2>Groups</h2>
        <ul>
          <li>
            Each group is run by its owners and admins. They decide who joins, who can do what, and settings like the
            weekly SMS and its fee.
          </li>
          <li>
            Amounts and balances are only as accurate as what&apos;s entered. If something looks wrong, sort it out with
            your group. {BRAND.name} doesn&apos;t settle disputes between members.
          </li>
        </ul>
      </section>

      <section>
        <h2>Fair use</h2>
        <p>
          Don&apos;t use {BRAND.name} for anything illegal, to harass people, to send messages people didn&apos;t ask for,
          or to get into accounts or groups that aren&apos;t yours. We may suspend accounts that do.
        </p>
      </section>

      <section>
        <h2>Price</h2>
        <p>
          {BRAND.name} is currently free to use. If we add paid features later, we&apos;ll say so clearly before anything
          is charged. Nothing you already use becomes paid without notice.
        </p>
      </section>

      <section>
        <h2>No guarantees</h2>
        <p>
          We work to keep {BRAND.name} running and your data safe, but it&apos;s provided as it is, without a guarantee
          that it will always be available or error-free. As far as the law allows, we aren&apos;t liable for losses from
          using it, including from wrong amounts someone entered.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms. We&apos;ll change the date at the top, and tell you in the app if a change is
          significant. These terms follow the laws of Sri Lanka. Questions: <a href={mail}>{BRAND.contactEmail}</a>. How
          we handle your data is in our <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
