import { z } from "zod";
export const authKeySchema = z.string().min(1).max(512).refine(v => v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v), "Invalid credential");
export const encryptedCredentialSchema = z.object({ ciphertext_b64: z.string().min(4).max(2048), iv_b64: z.string().min(16).max(32), auth_tag_b64: z.string().min(20).max(32), key_version: z.number().int().min(1).max(32767) }).strict();
