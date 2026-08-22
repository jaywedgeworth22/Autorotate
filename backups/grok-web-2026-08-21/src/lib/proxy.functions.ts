import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_HOSTS = new Set([
  "us.infisical.com",
  "eu.infisical.com",
  "app.infisical.com",
  "api.github.com",
  "api.openai.com",
  "api.anthropic.com",
  "api.stripe.com",
  "api.vercel.com",
  "api.cloudflare.com",
  "api.x.ai",
  "api.groq.com",
  "api.resend.com",
  "api.twilio.com",
  "api.sendgrid.com",
  "api.mailgun.net",
  "api.digitalocean.com",
  "api.neon.tech",
  "console.neon.tech",
  "api.supabase.com",
  "huggingface.co",
  "registry.npmjs.org",
  "slack.com",
  "api.slack.com",
  "discord.com",
  "gitlab.com",
  "api.bitbucket.org",
  "api.render.com",
  "api.railway.app",
  "api.linode.com",
  "api.heroku.com",
  "api.planetscale.com",
  "api.linear.app",
  "api.notion.com",
  "hub.docker.com",
  "iam.amazonaws.com",
  "mac.jays.services",
  "host.jays.services",
]);

const ALLOWED_SUFFIXES = [
  ".infisical.com",
  ".amazonaws.com",
  ".googleapis.com",
  ".cloudflare.com",
  ".jays.services",
];

const PRIVATE =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1|localhost|.*\.local$)/i;

function hostAllowed(hostname: string, protocol: string): boolean {
  const host = hostname.toLowerCase();
  if (PRIVATE.test(host)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const isMac =
    host === "mac.jays.services" ||
    host === "host.jays.services" ||
    host.endsWith(".jays.services");
  if (protocol === "http:" && !isMac) return false;
  if (protocol !== "https:" && protocol !== "http:") return false;
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

const Input = z.object({
  url: z.string().url().max(2000),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(500_000).optional(),
  form: z.record(z.string(), z.string()).optional(),
});

export type ProxyResult = {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
};

export const proxyRequest = createServerFn({ method: "POST" })
  .validator(Input)
  .handler(async ({ data }): Promise<ProxyResult> => {
    let url: URL;
    try {
      url = new URL(data.url);
    } catch {
      return { ok: false, status: 0, body: "", error: "Invalid URL" };
    }
    if (!hostAllowed(url.hostname, url.protocol)) {
      return {
        ok: false,
        status: 0,
        body: "",
        error: `Host not allowed: ${url.hostname}`,
      };
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(data.headers ?? {})) {
      const key = k.toLowerCase();
      if (["host", "origin", "referer", "cookie", "content-length"].includes(key)) continue;
      headers.set(k, v);
    }

    let body: string | undefined;
    if (data.form) {
      const params = new URLSearchParams(data.form);
      body = params.toString();
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/x-www-form-urlencoded");
      }
    } else if (data.body != null) {
      body = data.body;
      if (!headers.has("content-type") && data.method !== "GET") {
        headers.set("content-type", "application/json");
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url.toString(), {
        method: data.method,
        headers,
        body: data.method === "GET" ? undefined : body,
        signal: controller.signal,
        redirect: "manual",
      });
      clearTimeout(timer);
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        body: text.slice(0, 200_000),
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        body: "",
        error: err instanceof Error ? err.message : "Request failed",
      };
    }
  });
