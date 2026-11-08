import { z } from "zod";
import { isValidSignatureOrder, SIGNATURE_METHODS, type SignatureOrderStep } from "./service";

// Server-side validation for the P5 routes. Kept beside the pure service so the
// API and tests share one definition of a valid order step.

const orderStep = z
  .object({
    order: z.number().int().min(1).max(50),
    signerUserId: z.string().min(1).max(120).optional(),
    signerPersonId: z.string().min(1).max(120).optional(),
    role: z.string().min(1).max(80).optional(),
  })
  .refine((step) => Boolean(step.signerUserId) !== Boolean(step.signerPersonId), {
    message: "Each step needs exactly one of signerUserId or signerPersonId",
  });

export const createDocumentInput = z.object({
  template: z.string().min(1).max(120),
  title: z.string().min(1).max(300).optional(),
  payload: z.record(z.unknown()),
});

export const createSignatureRequestInput = z
  .object({
    order: z.array(orderStep).min(1).max(50),
    consentVersion: z.string().min(1).max(120),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((value) => isValidSignatureOrder(value.order as SignatureOrderStep[]), {
    message: "Order must be contiguous from 1 with distinct signers",
  });

export const signInput = z.object({
  consentVersion: z.string().min(1).max(120),
  method: z.enum(SIGNATURE_METHODS),
  artifactRef: z.string().min(1).max(500).optional(),
  deviceId: z.string().min(1).max(200).optional(),
  authEvidence: z.record(z.unknown()).optional(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentInput>;
export type CreateSignatureRequestInput = z.infer<typeof createSignatureRequestInput>;
export type SignInput = z.infer<typeof signInput>;
