import { describe, expect, it } from "vitest";
import { hashPassword, passwordSchema, verifyPassword } from "./passwords.js";

describe("password credentials", () => {
  it("salts each hash and verifies only the exact password", async () => {
    const password = "a long private password";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(`${password} `, first)).toBe(false);
    expect(await verifyPassword("wrong password", first)).toBe(false);
  });

  it("rejects missing and malformed credentials", async () => {
    expect(await verifyPassword("a long private password")).toBe(false);
    expect(await verifyPassword("a long private password", "invalid")).toBe(
      false,
    );
  });

  it.each([
    "",
    "short",
    "Aa1xxxx",
    "a".repeat(129),
    "a".repeat(8),
    "PasswordOnly",
    "UPPERCASE1234",
    "lowercase1234",
    null,
    123,
  ])("rejects an invalid password: %s", (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it.each([8, 128])("accepts a %s-character password", (length) => {
    expect(
      passwordSchema.safeParse(`Aa1${"x".repeat(length - 3)}`).success,
    ).toBe(true);
  });
});
