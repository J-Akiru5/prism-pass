import { AppShell } from "@/components/app-shell";

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  // Org display name resolves client-side in later phases; the shell uses the
  // route id only as a label (never as an authorization source).
  return <AppShell orgId={orgId}>{children}</AppShell>;
}
