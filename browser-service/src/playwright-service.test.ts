import {
  PlaywrightService,
  isPrivateIPv4,
  isPrivateIPv6,
  redactHeaders,
  truncateBody,
} from "./playwright-service";

describe("isPrivateIPv4", () => {
  it("detects 10.x.x.x", () => expect(isPrivateIPv4("10.0.0.1")).toBe(true));
  it("detects 127.x.x.x", () => expect(isPrivateIPv4("127.0.0.1")).toBe(true));
  it("detects 172.16-31.x.x", () => {
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
  });
  it("detects 192.168.x.x", () => expect(isPrivateIPv4("192.168.1.1")).toBe(true));
  it("allows public IPs", () => expect(isPrivateIPv4("8.8.8.8")).toBe(false));
});

describe("isPrivateIPv6", () => {
  it("detects loopback", () => expect(isPrivateIPv6("::1")).toBe(true));
  it("detects unique local (fc00::)", () => expect(isPrivateIPv6("fc00::1")).toBe(true));
  it("detects unique local (fd00::)", () => expect(isPrivateIPv6("fd12::1")).toBe(true));
  it("detects link-local (fe80::)", () => expect(isPrivateIPv6("fe80::1")).toBe(true));
  it("allows public IPv6", () => expect(isPrivateIPv6("2001:4860:4860::8888")).toBe(false));
});

describe("redactHeaders", () => {
  it("redacts Authorization", () => {
    const result = redactHeaders({ Authorization: "Bearer secret" });
    expect(result.Authorization).toBe("[REDACTED]");
  });
  it("redacts Cookie", () => {
    const result = redactHeaders({ Cookie: "session=abc" });
    expect(result.Cookie).toBe("[REDACTED]");
  });
  it("redacts Set-Cookie", () => {
    const result = redactHeaders({ "Set-Cookie": "session=abc" });
    expect(result["Set-Cookie"]).toBe("[REDACTED]");
  });
  it("redacts x-api-key", () => {
    const result = redactHeaders({ "x-api-key": "sk-1234" });
    expect(result["x-api-key"]).toBe("[REDACTED]");
  });
  it("redacts headers containing token/secret/key", () => {
    const result = redactHeaders({ "x-auth-token": "abc", "client-secret": "xyz" });
    expect(result["x-auth-token"]).toBe("[REDACTED]");
    expect(result["client-secret"]).toBe("[REDACTED]");
  });
  it("preserves safe headers", () => {
    const result = redactHeaders({ "Content-Type": "application/json" });
    expect(result["Content-Type"]).toBe("application/json");
  });
});

describe("truncateBody", () => {
  it("truncates bodies over MAX_BODY_SIZE", () => {
    const large = "x".repeat(600_000);
    const result = truncateBody(large);
    expect(result.length).toBeLessThan(600_000);
    expect(result).toContain("<!-- truncated -->");
  });
  it("keeps small bodies intact", () => {
    const small = "hello world";
    expect(truncateBody(small)).toBe(small);
  });
});
