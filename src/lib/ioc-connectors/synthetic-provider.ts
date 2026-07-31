import { normalizeProviderItem } from "./normalize";
import { candidateTypes, type IocCandidateType, type IocProviderAdapter } from "./types";
const examples: ReadonlyArray<readonly [IocCandidateType, string]> = [
  ["IPV4", "192.0.2.44"], ["IPV6", "2001:db8::44"], ["CIDR", "198.51.100.77/24"], ["DOMAIN", "example[.]com"],
  ["HOSTNAME", "host.example.com"], ["URL", "hxxps://example[.]com/path#ignored"], ["MD5", "d41d8cd98f00b204e9800998ecf8427e"],
  ["SHA1", "da39a3ee5e6b4b0d3255bfef95601890afd80709"], ["SHA256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"], ["CVE", "cve-2024-0001"],
];
const item = (providerItemId: string, type: IocCandidateType, value: string) => normalizeProviderItem({ providerKey: "TEST_SYNTHETIC", providerItemId, type, value, tags: ["TEST", "SYNTHETIC"], confidence_score: 50, threat_type: "Synthetic demonstration" });
export const syntheticProvider: IocProviderAdapter = {
  key: "TEST_SYNTHETIC", displayName: "Deterministic Test IOC Provider", supportedTypes: candidateTypes, supportsScheduling: true,
  async sync() {
    const items = examples.map(([type, value], index) => item(`synthetic-${index}`, type, value));
    items.push({ ...items[0] }, item("synthetic-ip-port", "IPV4", "192.0.2.44:443"), item("synthetic-second-claim", "DOMAIN", "example.com"));
    return { status: "SUCCEEDED", items };
  },
};
