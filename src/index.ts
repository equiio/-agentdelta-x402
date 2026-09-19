import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";

const PAY_TO = "0x61811D96F79c0719271DACD8A5483ac878EcD67C" as `0x${string}`;
const PRICE = "$0.001";
const NETWORK = "eip155:84532";
const FACILITATOR_URL = "https://x402.org/facilitator";
const MAX_BYTES = 400_000;

const app = new Hono();

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal"
  ) return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if ([a, b, c, d].some(n => n < 0 || n > 255)) return true;
    if (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) return true;
  }

  if (
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe8") ||
    h.startsWith("fe9") ||
    h.startsWith("fea") ||
    h.startsWith("feb")
  ) return true;

  return false;
}

function publicHttpsUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("HTTPS_ONLY");
  if (url.username || url.password) throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
  if (blockedHost(url.hostname)) throw new Error("PRIVATE_HOST_NOT_ALLOWED");
  return url;
}

async function fetchPublic(initial: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = initial;
  for (let i = 0; i < 5; i++) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: {
        "User-Agent": "AgentDelta/0.1 (+https://github.com/equiio/-agentdelta-x402)",
        "Accept": "text/html,text/plain,application/json;q=0.9,*/*;q=0.2",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: current };
      current = publicHttpsUrl(new URL(location, current).toString());
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_BYTES) throw new Error("CONTENT_TOO_LARGE");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("CONTENT_TOO_LARGE");
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

function normalize(body: string, contentType: string): { text: string; title: string | null } {
  const html = contentType.includes("html") || /<html[\s>]/i.test(body);
  if (!html) return { text: body.replace(/\s+/g, " ").trim(), title: null };

  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 240) : null;

  const text = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return { text, title };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

app.get("/", c =>
  c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>AgentDelta</title>
<style>body{font:16px ui-monospace,monospace;max-width:800px;margin:70px auto;padding:0 20px;background:#f6f7f8;color:#15171a}h1{font-size:64px;letter-spacing:-4px;line-height:.95}.card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:20px;margin:18px 0}code{background:#111;color:#eee;padding:3px 6px;border-radius:5px}a{color:#111}</style>
<h1>Don't reread the web.<br>Check the delta.</h1>
<div class="card"><b>AgentDelta</b><p>A tiny paid URL-freshness tool for autonomous agents.</p><p><code>GET /v1/check?url=...&known=...</code></p></div>
<div class="card"><b>Price</b><p>${PRICE} via x402 · Base Sepolia while testing</p></div>
<p><a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/demo">free demo</a></p>`)
);

app.get("/health", c => c.json({
  ok: true,
  service: "AgentDelta",
  price: PRICE,
  network: NETWORK,
  paidEndpoint: "/v1/check",
}));

app.get("/demo", c => c.json({
  sample: true,
  changed: false,
  current_sha256: "demo",
  text_chars: 125,
  note: "Static free sample. /v1/check is the live x402-paid endpoint.",
}));

app.get("/llms.txt", c => c.text(`# AgentDelta
> Paid machine-first webpage freshness checker.

## Tool
GET ${new URL(c.req.url).origin}/v1/check?url=<PUBLIC_HTTPS_URL>&known=<OPTIONAL_SHA256>

Price: ${PRICE}
Protocol: x402 v2
Network: ${NETWORK}

The first unpaid request returns HTTP 402. A compatible x402 agent can pay and retry automatically.

Result fields:
- changed: null when no prior hash was supplied, otherwise true/false
- current_sha256: normalized visible-text fingerprint
- title
- etag
- last_modified
- text_chars
- excerpt: included only for new/changed content

Free discovery:
- /health
- /demo
- /openapi.json
`, 200, { "Content-Type": "text/plain; charset=utf-8" }));

app.get("/openapi.json", c => c.json({
  openapi: "3.1.0",
  info: {
    title: "AgentDelta",
    version: "0.1.0",
    description: "x402-paid webpage freshness checker for autonomous agents",
  },
  servers: [{ url: new URL(c.req.url).origin }],
  paths: {
    "/v1/check": {
      get: {
        summary: "Check whether a public HTTPS page changed",
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "known", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paid freshness result" },
          "402": { description: "x402 payment required" },
        },
      },
    },
  },
}));

app.use(
  paymentMiddleware(
    {
      "GET /v1/check": {
        accepts: [{
          scheme: "exact",
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO,
        }],
        description: "Check a public HTTPS page and return a compact normalized-text freshness fingerprint.",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              url: "https://example.com",
              known: "optional_previous_sha256",
            },
            inputSchema: {
              properties: {
                url: { type: "string", description: "Public HTTPS URL to check" },
                known: { type: "string", description: "Optional previous SHA-256 fingerprint" },
              },
              required: ["url"],
            },
            output: {
              example: {
                changed: false,
                current_sha256: "abc123...",
                http_status: 200,
                text_chars: 125,
              },
            },
          }),
        },
      },
    },
    server,
  ),
);

app.get("/v1/check", async c => {
  const raw = c.req.query("url");
  const known = c.req.query("known")?.toLowerCase() || null;

  if (!raw) return c.json({ error: "MISSING_URL" }, 400);
  if (known && !/^[a-f0-9]{64}$/.test(known)) {
    return c.json({ error: "INVALID_KNOWN_SHA256" }, 400);
  }

  try {
    const source = publicHttpsUrl(raw);
    const { response, finalUrl } = await fetchPublic(source);
    const body = await readLimited(response);
    const { text, title } = normalize(body, response.headers.get("content-type") || "");
    const current = await sha256(text);
    const changed = known === null ? null : known !== current;

    return c.json({
      changed,
      current_sha256: current,
      known_sha256: known,
      source_url: source.toString(),
      final_url: finalUrl.toString(),
      http_status: response.status,
      title,
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
      text_chars: text.length,
      excerpt: changed === false ? null : text.slice(0, 700) || null,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHECK_FAILED";
    const status = code === "CONTENT_TOO_LARGE" ? 413 : 400;
    return c.json({ error: code }, status);
  }
});

export default app;
