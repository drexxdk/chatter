import { describe, expect, it, vi } from "vitest";

import { PayloadApi } from "../e2e/payload";

describe("E2E account ownership", () => {
  it("removes only accounts with this run's prefix and suffix", async () => {
    const payload = new PayloadApi();
    const users = [
      "E2EAccAliceRun12345",
      "e2eaccbobrun12345",
      "E2EAccAlicerun99999",
      "somebodyrun12345",
      "E2EAccrun12345elsewhere",
    ].map((nickname, index) => ({
      id: index + 1,
      nickname,
      provider: "dev",
      avatar: "neutral",
    }));
    const find = vi.spyOn(payload, "findUsers").mockResolvedValue(users);
    const remove = vi.spyOn(payload, "remove").mockResolvedValue();

    await payload.removeRunUsers("Run12345");

    expect(find).toHaveBeenCalledWith("run12345");
    expect(remove.mock.calls).toEqual([
      ["users", 1],
      ["users", 2],
    ]);
  });

  it.each(["", "abc", "run with spaces", "*"])(
    "rejects an unsafe run identifier: %j",
    async (run) => {
      const payload = new PayloadApi();
      const find = vi.spyOn(payload, "findUsers");

      await expect(payload.removeRunUsers(run)).rejects.toThrow(
        "Invalid E2E account run identifier",
      );
      expect(find).not.toHaveBeenCalled();
    },
  );
});
