// Demo-mode switch. AUTOROTATE_DEMO=1 forces demo behavior for every connector;
// when the variable is unset, demo mode defaults ON so the product is fully
// explorable without credentials. Set AUTOROTATE_DEMO=0 to require real config.
export function isDemoMode(): boolean {
  const flag = process.env.AUTOROTATE_DEMO;
  if (flag === undefined || flag === "") return true;
  return flag === "1" || flag.toLowerCase() === "true";
}

/** Prefix every simulated step message with [demo] (hard requirement). */
export function demoMessage(message: string): string {
  return `[demo] ${message}`;
}

/** Simulate realistic network latency for demo operations. */
export async function demoLatency(minMs = 80, maxMs = 400): Promise<number> {
  const ms = Math.round(minMs + Math.random() * (maxMs - minMs));
  await new Promise((resolve) => setTimeout(resolve, ms));
  return ms;
}
