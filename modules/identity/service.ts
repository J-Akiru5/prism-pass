import { z } from "zod";
export const createPersonInput = z.object({
  displayName: z.string().min(1).max(120),
  externalId: z.string().max(64).optional(),
  userId: z.string().optional(),
});
export type CreatePersonInput = z.infer<typeof createPersonInput>;

export const updatePersonInput = z.object({
  displayName: z.string().min(1).max(120).optional(),
  externalId: z.string().max(64).nullable().optional(),
  userId: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdatePersonInput = z.infer<typeof updatePersonInput>;

export const createProgramInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.string().min(1).max(40).default("event"),
});
export type CreateProgramInput = z.infer<typeof createProgramInput>;

export const createAssignmentInput = z.object({
  personId: z.string().min(1),
  programId: z.string().min(1).optional(),
  role: z.string().min(1).max(40).default("participant"),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentInput>;
