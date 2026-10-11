import { redirect } from "next/navigation";

/** "/" opens Me, your own money. Groups are one tap away from there. */
export default function Root(): never {
  redirect("/me");
}
