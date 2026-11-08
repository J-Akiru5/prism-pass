import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { ok, fail, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createDocumentInput } from "@/modules/documents/schema";
import { documentContentHash } from "@/modules/documents/service";

type P = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("documents.manage", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const where = { organizationId: ctx.organizationId };
    const [rows, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        // List views never need the inline body; keep the payload in the detail read.
        select: { id: true, template: true, title: true, version: true, sha256: true, status: true, sealedAt: true, createdAt: true },
      }),
      prisma.document.count({ where }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("documents.manage", orgId);
    const input = createDocumentInput.parse(await req.json());
    const id = randomUUID();
    const sha256 = documentContentHash({ template: input.template, version: 1, payload: input.payload });
    const document = await prisma.document.create({
      data: {
        id,
        organizationId: ctx.organizationId,
        template: input.template,
        title: input.title ?? null,
        version: 1,
        sha256,
        payload: input.payload as Prisma.InputJsonValue,
        // v1 stores the canonical body inline; the seam for a private-bucket PDF is kept.
        storageRef: `inline:${id}`,
        // Public verification token: random and unguessable, never derived from org data.
        verifyToken: `dv_${randomUUID().replace(/-/g, "")}`,
        status: "DRAFT",
      },
      select: { id: true, template: true, title: true, version: true, sha256: true, status: true, verifyToken: true, createdAt: true },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "document.create",
        resource: `document:${document.id}`,
        result: "ok",
        meta: { template: document.template, sha256: document.sha256 } as never,
      },
    });
    // The verify token is a bearer capability; return it to the managing caller only.
    return ok(document);
  } catch (e) {
    return handleRouteError(e);
  }
}
