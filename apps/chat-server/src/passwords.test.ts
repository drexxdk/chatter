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

  it.each(["", "short", "a".repeat(129), null, 123])(
    "rejects an invalid password: %s",
    (value) => {
      expect(passwordSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each([12, 128])("accepts a %s-character password", (length) => {
    expect(passwordSchema.safeParse("a".repeat(length)).success).toBe(true);
  });
});
