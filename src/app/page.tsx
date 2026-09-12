import { redirect } from "next/navigation";

/** There is no public landing page. Staff always start at the dashboard. */
export default function RootPage() {
  redirect("/dashboard");
}
