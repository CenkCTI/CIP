import "server-only";
export class IocCredentialError extends Error {
  constructor(public readonly code: "IOC_CREDENTIAL_CONFIGURATION_INVALID" | "IOC_CREDENTIAL_DECRYPTION_FAILED") { super(code); this.name = "IocCredentialError"; }
  toJSON() { return { code: this.code }; }
}
