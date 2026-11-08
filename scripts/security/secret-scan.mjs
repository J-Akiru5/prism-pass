// Credential-pattern matcher used by scripts/security/scan-secrets.mjs and the
// pure tests. Plain ESM with no dependencies so CI and a laptop run the same
// code. Patterns are intentionally narrow: false positives train people to
// ignore the scanner.

export const SECRET_RULES = [
  {
    id: "private-key",
    description: "PEM private key block",
    pattern: "-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----",
    flags: "",
  },
  {
    id: "aws-access-key",
    description: "AWS access key id",
    pattern: "\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b",
    flags: "",
  },
  {
    id: "github-token",
    description: "GitHub personal access token",
    pattern: "\\bgh[pousr]_[A-Za-z0-9]{36,}\\b",
    flags: "",
  },
  {
    id: "github-fine-grained-token",
    description: "GitHub fine-grained token",
    pattern: "\\bgithub_pat_[A-Za-z0-9_]{22,}\\b",
    flags: "",
  },
  {
    id: "stripe-secret-key",
    description: "Stripe secret key",
    pattern: "\\bsk_(?:live|test)_[A-Za-z0-9]{16,}\\b",
    flags: "",
  },
  {
    id: "openai-key",
    description: "OpenAI-style secret key",
    pattern: "\\bsk-[A-Za-z0-9]{20,}\\b",
    flags: "",
  },
  {
    id: "supabase-secret-key",
    description: "Supabase secret API key",
    pattern: "\\bsb_secret_[A-Za-z0-9_-]{10,}\\b",
    flags: "",
  },
  {
    id: "service-role-assignment",
    description: "SUPABASE_SERVICE_ROLE_KEY with a concrete value",
    pattern: "SUPABASE_SERVICE_ROLE_KEY\\s*[:=]\\s*[\"']?[A-Za-z0-9._-]{20,}",
    flags: "i",
  },
  {
    id: "jwt-service-role",
    description: "Decoded JWT payload carrying the service_role claim",
    pattern: "\"role\"\\s*:\\s*\"service_role\"",
    flags: "",
  },
  {
    id: "database-url-with-password",
    description: "Postgres URL with an inline password",
    pattern: "postgres(?:ql)?://[^\\s:@/]+:[^\\s@/]{4,}@[^\\s/]+",
    flags: "i",
  },
];

const PLACEHOLDER = /(example|placeholder|redacted|dummy|sample|your[-_]|xxx|test[-_]?only|not[-_]?a[-_]?real|changeme)/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db", "postgres", "host"]);
const LOCAL_PASSWORDS = new Set(["postgres", "password", "pass", "test", "secret"]);

/** Never print a full credential from a scanner. */
export function redactMatch(value) {
  if (value.length <= 10) return `${value.slice(0, 3)}…`;
  return `${value.slice(0, 6)}…(${value.length} chars)`;
}

export function isPlaceholder(value) {
  return PLACEHOLDER.test(value);
}

function isLocalDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (LOCAL_HOSTS.has(url.hostname)) return true;
    const password = decodeURIComponent(url.password);
    return LOCAL_PASSWORDS.has(password.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Find credential-like strings. Returns positions and redacted previews only;
 * the caller decides whether to fail a build.
 */
export function scanText(text, { file = "<text>" } = {}) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const rule of SECRET_RULES) {
    const flags = rule.flags.includes("g") ? rule.flags : `${rule.flags}g`;
    const regex = new RegExp(rule.pattern, flags);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const value = match[0];
        if (isPlaceholder(value)) continue;
        if (rule.id === "database-url-with-password" && isLocalDatabaseUrl(value)) continue;
        findings.push({
          file,
          line: index + 1,
          column: match.index + 1,
          rule: rule.id,
          description: rule.description,
          preview: redactMatch(value),
        });
      }
    }
  }
  return findings;
}

const SKIP_PREFIXES = [".git/", "node_modules/", ".next/", "dist/", "coverage/", "screenshots/", "scripts/security/"];
const SKIP_FILES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "pdf", "zip", "gz", "tar", "woff", "woff2", "ttf", "otf",
  "mp4", "mov", "webm", "mp3", "wav", "wasm", "so", "dll", "exe", "node", "jar", "class",
]);

export function isScannablePath(relativePath) {
  const path = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || SKIP_FILES.has(path)) return false;
  if (SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  const dot = path.lastIndexOf(".");
  if (dot > 0 && BINARY_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())) return false;
  return true;
}
