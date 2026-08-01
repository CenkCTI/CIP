import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { IocCredentialError } from "./errors";
import { encryptedCredentialSchema } from "./schema";
export type CredentialBinding = { ownerId: string; connectionId: string; providerKey: string; keyVersion: number };
const aad = (b: CredentialBinding) => Buffer.from(JSON.stringify([b.ownerId,b.connectionId,b.providerKey,b.keyVersion]), "utf8");
export function credentialMasterKey(env: NodeJS.ProcessEnv = process.env) { const value=env.IOC_CREDENTIAL_ENCRYPTION_KEY; if(!value||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new IocCredentialError("IOC_CREDENTIAL_CONFIGURATION_INVALID"); const key=Buffer.from(value,"base64"); if(key.length!==32||key.toString("base64")!==value)throw new IocCredentialError("IOC_CREDENTIAL_CONFIGURATION_INVALID"); return key; }
export function encryptCredential(plaintext:string,binding:CredentialBinding,key=credentialMasterKey()){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(aad(binding));const ciphertext=Buffer.concat([cipher.update(plaintext,"utf8"),cipher.final()]);return{ciphertext_b64:ciphertext.toString("base64"),iv_b64:iv.toString("base64"),auth_tag_b64:cipher.getAuthTag().toString("base64"),key_version:binding.keyVersion};}
export function decryptCredential(value:unknown,binding:CredentialBinding,key=credentialMasterKey()){try{const v=encryptedCredentialSchema.parse(value);const d=createDecipheriv("aes-256-gcm",key,Buffer.from(v.iv_b64,"base64"));d.setAAD(aad(binding));d.setAuthTag(Buffer.from(v.auth_tag_b64,"base64"));return Buffer.concat([d.update(Buffer.from(v.ciphertext_b64,"base64")),d.final()]).toString("utf8");}catch{throw new IocCredentialError("IOC_CREDENTIAL_DECRYPTION_FAILED");}}
