const POLL_INTERVAL_MS = 500;
const MAX_TIMEOUT_SECONDS = 110; // stay under typical reverse-proxy idle timeouts

export async function waitFor<T extends { status: string }>(
  resolve: () => T,
  requestedTimeoutSeconds: number
): Promise<T> {
  const timeoutSeconds = Math.min(Math.max(requestedTimeoutSeconds || 30, 1), MAX_TIMEOUT_SECONDS);
  const deadline = Date.now() + timeoutSeconds * 1000;

  let result = resolve();
  while (result.status === "pending" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    result = resolve();
  }
  return result;
}
