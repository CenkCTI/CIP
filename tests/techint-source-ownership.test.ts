import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const technicalSourcesPage = readFileSync("src/app/techint/sources/page.tsx", "utf8");
const technicalSourceActions = readFileSync("src/app/techint/sources/actions.ts", "utf8");
const threatFoxAdapter = readFileSync("src/lib/techint/collection/providers/threatfox.ts", "utf8");
const shellNav = readFileSync("src/components/shell-nav.tsx", "utf8");
const legacyOsintPage = readFileSync("src/app/osint/page.tsx", "utf8");

describe("TechINT source ownership", () => {
  it("owns ThreatFox credential configuration inside Technical Sources", () => {
    expect(technicalSourcesPage).toContain("ThreatFox Auth-Key");
    expect(technicalSourcesPage).toContain("configureThreatFoxCredential");
    expect(technicalSourcesPage).toContain("disconnectThreatFoxSourceCredential");
    expect(technicalSourceActions).toContain("encryptCredential");
    expect(technicalSourceActions).toContain("configureThreatFoxConnection");
    expect(technicalSourceActions).toContain("p_scheduler_enabled: false");
  });

  it("keeps the API key server-side and tests it before encrypted storage", () => {
    expect(technicalSourceActions).toContain('getIocProvider("THREATFOX")');
    expect(technicalSourceActions).toContain("await adapter.testConnection(credential.data)");
    expect(technicalSourcesPage).toContain('type="password"');
    expect(technicalSourcesPage).toContain('autoComplete="off"');
  });

  it("retires the standalone OSINT navigation surface without deleting legacy data", () => {
    expect(shellNav).not.toContain('href: "/osint"');
    expect(legacyOsintPage).toContain('redirect("/techint/sources")');
    expect(legacyOsintPage).not.toContain("IocInbox");
    expect(legacyOsintPage).not.toContain("OsintWorkspace");
  });

  it("reports bounded ThreatFox provider failures instead of a generic bridge error", () => {
    expect(threatFoxAdapter).toContain('credentialRequirement: "TECHINT_MANAGED_CREDENTIAL"');
    expect(threatFoxAdapter).toContain('"THREATFOX_AUTH_FAILED"');
    expect(threatFoxAdapter).toContain('"THREATFOX_RATE_LIMITED"');
    expect(threatFoxAdapter).toContain('"THREATFOX_TIMEOUT"');
    expect(threatFoxAdapter).toContain('"THREATFOX_RESPONSE_TOO_LARGE"');
    expect(threatFoxAdapter).not.toContain("Connect ThreatFox in the IOC Inbox");
  });
});
