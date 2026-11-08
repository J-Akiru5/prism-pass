import { OrgDetailConsole } from "@/components/platform/org-detail-console";

export const metadata = { title: "Organization detail" };

export default async function PlatformOrgDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <OrgDetailConsole orgId={orgId} />;
}
