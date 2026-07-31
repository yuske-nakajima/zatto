import { type HealthProbe, probeHealth } from "./server-api.js";

const LEGACY_PORT_START = 6280;
const LEGACY_PORT_COUNT = 10;

export async function findUnmanagedServer(
  preferredPort: number,
  fetchFn: typeof globalThis.fetch,
): Promise<{ port: number; probe: HealthProbe } | null> {
  const ports = new Set<number>([preferredPort]);
  for (let offset = 0; offset < LEGACY_PORT_COUNT; offset += 1) {
    ports.add(LEGACY_PORT_START + offset);
  }
  for (const port of ports) {
    const probe = await probeHealth(port, fetchFn);
    if (
      probe.kind === "legacy" ||
      probe.kind === "compatible" ||
      probe.kind === "same-instance-incompatible"
    ) {
      return { port, probe };
    }
  }
  return null;
}
