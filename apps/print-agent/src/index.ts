/**
 * Standalone local agent, meant to run on the restaurant's own PC/mini-PC/
 * Raspberry Pi (per RESTAURANT_OS_MASTER_PLAN.md section 31), not in the
 * cloud infrastructure. It authenticates with a per-device bearer key
 * (issued once via the admin panel's Printers page), polls the Core API
 * for pending print jobs, and acknowledges them once printed.
 *
 * The actual printer driver is a placeholder: no physical ESC/POS hardware
 * was available while building this, so `ConsolePrinterDriver` renders the
 * ticket to stdout instead of a real thermal printer. Swapping in a real
 * driver (e.g. the `escpos` npm package targeting a USB/network printer) is
 * the intended seam — implement `PrinterDriver` and pass it to `runLoop`.
 */

interface PrintJob {
  id: string;
  orderId: string | null;
  type: string;
  payload: {
    orderNumber?: number;
    fulfillmentType?: string;
    customerName?: string;
    customerPhone?: string;
    note?: string | null;
    items?: Array<{ name: string; variantName: string | null; quantity: number; modifiers: string[] }>;
    totalMinor?: number;
    createdAt?: string;
  };
}

interface PrinterDriver {
  print(ticket: string): Promise<void>;
}

class ConsolePrinterDriver implements PrinterDriver {
  async print(ticket: string): Promise<void> {
    process.stdout.write(`\n🖨️  [MOCK PRINTER]\n${ticket}\n`);
  }
}

function formatTicket(job: PrintJob): string {
  const lines: string[] = [];
  lines.push("========================================");
  lines.push(`SİPARİŞ #${job.payload.orderNumber ?? "?"}`);
  lines.push("========================================");
  if (job.payload.customerName) lines.push(`Müşteri: ${job.payload.customerName}`);
  if (job.payload.fulfillmentType) lines.push(`Teslimat: ${job.payload.fulfillmentType}`);
  lines.push("----------------------------------------");
  for (const item of job.payload.items ?? []) {
    const variant = item.variantName ? ` (${item.variantName})` : "";
    lines.push(`${item.quantity}x ${item.name}${variant}`);
    for (const modifier of item.modifiers) lines.push(`  + ${modifier}`);
  }
  lines.push("----------------------------------------");
  if (job.payload.note) lines.push(`Not: ${job.payload.note}`);
  if (job.payload.totalMinor !== undefined) lines.push(`Toplam: ${(job.payload.totalMinor / 100).toFixed(2)} TRY`);
  lines.push("========================================");
  return lines.join("\n");
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const apiUrl = readRequiredEnv("PRINT_AGENT_API_URL").replace(/\/$/, "");
const deviceKey = readRequiredEnv("PRINT_AGENT_DEVICE_KEY");
const pollIntervalMs = Number(process.env.PRINT_AGENT_POLL_INTERVAL_MS ?? 5_000);
const driver: PrinterDriver = new ConsolePrinterDriver();

let stopping = false;

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${deviceKey}` }
  });
}

async function sendHeartbeat(): Promise<void> {
  const response = await authorizedFetch("/v1/printers/heartbeat", { method: "POST" });
  if (!response.ok) throw new Error(`Heartbeat failed with status ${response.status}`);
}

async function pollAndPrint(): Promise<void> {
  const response = await authorizedFetch("/v1/printers/jobs/pending");
  if (!response.ok) throw new Error(`Fetching pending jobs failed with status ${response.status}`);
  const { jobs } = (await response.json()) as { jobs: PrintJob[] };

  for (const job of jobs) {
    try {
      await driver.print(formatTicket(job));
      await acknowledgeJob(job.id, { status: "PRINTED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown print error";
      process.stderr.write(`${JSON.stringify({ event: "print_agent_print_error", jobId: job.id, error: message })}\n`);
      await acknowledgeJob(job.id, { status: "FAILED", error: message }).catch(() => undefined);
    }
  }
}

async function acknowledgeJob(jobId: string, outcome: { status: "PRINTED" | "FAILED"; error?: string }): Promise<void> {
  const response = await authorizedFetch(`/v1/printers/jobs/${jobId}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outcome)
  });
  if (!response.ok) throw new Error(`Acknowledging job ${jobId} failed with status ${response.status}`);
}

async function tick(): Promise<void> {
  try {
    await sendHeartbeat();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "print_agent_heartbeat_error", error: String(error) })}\n`);
    return;
  }
  try {
    await pollAndPrint();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "print_agent_poll_error", error: String(error) })}\n`);
  }
}

const interval = setInterval(() => {
  if (!stopping) void tick();
}, pollIntervalMs);

process.stdout.write(`${JSON.stringify({ event: "print_agent_started", apiUrl, pollIntervalMs })}\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    clearInterval(interval);
    process.stdout.write(`${JSON.stringify({ event: "print_agent_stopping", signal })}\n`);
    process.exit(0);
  });
}
