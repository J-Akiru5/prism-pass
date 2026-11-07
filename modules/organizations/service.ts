import { z } from "zod";

export const updateOrgStatusInput = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type UpdateOrgStatusInput = z.infer<typeof updateOrgStatusInput>;
