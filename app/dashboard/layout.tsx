import { Header } from "@/components/shell";
import { requireOrganizer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOrganizer();
  return <><Header mode="organizer" />{children}</>;
}
