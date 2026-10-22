import { afterEach, describe, expect, it, vi } from "vitest";

import { clearTabDrafts, readTabDraft, writeTabDraft } from "./tabDraft";

afterEach(() => vi.restoreAllMocks());

describe("private tab drafts", () => {
  it("isolates drafts, removes cleared text, and preserves unrelated storage", () => {
    sessionStorage.setItem("other", "keep");
    writeTabDraft("general", "public draft");
    writeTabDraft("general:private:bob", "private draft");
    expect(readTabDraft("general")).toBe("public draft");
    expect(readTabDraft("general:private:bob")).toBe("private draft");
    writeTabDraft("general", "");
    expect(readTabDraft("general")).toBeUndefined();
    clearTabDrafts();
    expect(readTabDraft("general:private:bob")).toBeUndefined();
    expect(sessionStorage.getItem("other")).toBe("keep");
  });

  it("expires drafts and rejects malformed or oversized data", () => {
    const now = Date.now();
    writeTabDraft("expired", "old draft");
    vi.spyOn(Date, "now").mockReturnValue(now + 8 * 60 * 60 * 1000 + 1);
    expect(readTabDraft("expired")).toBeUndefined();
    sessionStorage.setItem("chatter.draft.broken", "not json");
    expect(readTabDraft("broken")).toBeUndefined();
    writeTabDraft("large", "x".repeat(64_001));
    expect(readTabDraft("large")).toBeUndefined();
  });

  it("keeps a bounded number of drafts and tolerates unavailable storage", () => {
    clearTabDrafts();
    for (let index = 0; index < 40; index++)
      writeTabDraft(String(index), "draft");
    expect(readTabDraft("0")).toBeUndefined();
    expect(readTabDraft("39")).toBe("draft");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    expect(() => writeTabDraft("blocked", "draft")).not.toThrow();
  });
});
