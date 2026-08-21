import { describe, it, expect } from "vitest";
import { encryptJson, decryptJson, fingerprint } from "./crypto";
import { computeEntryHash, canonicalEntry } from "./engine";
import { renderUpdated } from "./files";

describe("crypto", () => {
  it("encryptJson/decryptJson round-trips", () => {
    const payload = { adminKey: "sk-test-123", nested: { a: [1, 2] } };
    const enc = encryptJson(payload);
    expect(enc).not.toContain("sk-test-123");
    expect(decryptJson(enc)).toEqual(payload);
  });

  it("decryptJson returns null for garbage", () => {
    expect(decryptJson("not-a-payload")).toBeNull();
    expect(decryptJson(null)).toBeNull();
  });

  it("fingerprint is a 16-char sha256 prefix", () => {
    expect(fingerprint("hello")).toBe("2cf24dba5fb0a30e");
    expect(fingerprint("hello")).toHaveLength(16);
  });
});

describe("audit hash chain", () => {
  it("is deterministic and chain-dependent", () => {
    const entry = {
      ts: "2025-01-01T00:00:00.000Z",
      actor: "web-user",
      action: "rotation.committed",
      secretId: 7,
      detail: { runId: 3 },
    };
    const h1 = computeEntryHash("0000000000000000", entry);
    expect(h1).toHaveLength(16);
    expect(computeEntryHash("0000000000000000", entry)).toBe(h1);
    expect(computeEntryHash("1111111111111111", entry)).not.toBe(h1);
    expect(canonicalEntry(entry)).toBe(canonicalEntry({ ...entry }));
  });
});

describe("file target renderers", () => {
  it("updates .env keys in place", () => {
    const out = renderUpdated(
      { path: "x/.env", format: "env", key: "API_KEY" },
      "FOO=1\nAPI_KEY=old\n",
      "new-value",
    );
    expect(out).toBe("FOO=1\nAPI_KEY=new-value\n");
  });

  it("appends missing .env keys", () => {
    const out = renderUpdated(
      { path: "x/.env", format: "env", key: "NEW_KEY" },
      "FOO=1\n",
      "v",
    );
    expect(out).toBe("FOO=1\nNEW_KEY=v\n");
  });

  it("updates JSON via dot path", () => {
    const out = renderUpdated(
      { path: "x/config.json", format: "json", key: "credentials.npmToken" },
      JSON.stringify({ credentials: { npmToken: "old" }, keep: 1 }),
      "npm_new",
    );
    expect(JSON.parse(out)).toEqual({
      credentials: { npmToken: "npm_new" },
      keep: 1,
    });
  });

  it("updates YAML flat keys", () => {
    const out = renderUpdated(
      { path: "x/p.yaml", format: "yaml", key: "aws_access_key_id" },
      "aws_access_key_id: AKIA_OLD\nother: 1\n",
      "AKIA_NEW",
    );
    expect(out).toContain("aws_access_key_id: AKIA_NEW");
    expect(out).toContain("other: 1");
  });

  it("updates INI section keys", () => {
    const out = renderUpdated(
      { path: "x/credentials", format: "ini", key: "prod.aws_access_key_id" },
      "[default]\naws_access_key_id = A\n\n[prod]\naws_access_key_id = B\n",
      "C",
    );
    expect(out).toContain("[default]\naws_access_key_id = A");
    expect(out).toContain("[prod]\naws_access_key_id = C");
  });
});
