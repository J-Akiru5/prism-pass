import { AuditConsole } from "@/components/platform/audit-console";

export const metadata = { title: "Audit" };

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string | string[] }>;
}) {
  const params = await searchParams;
  const organizationId = Array.isArray(params.organizationId) ? params.organizationId[0] : params.organizationId;
  return <AuditConsole initialOrganizationId={organizationId ?? ""} />;
}
