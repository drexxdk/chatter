import { afterEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({
  PUBLIC_API_URL: "https://api.example.com",
  AUTH_TOKEN_SECRET: "a-secret-of-at-least-32-characters!!",
  DEV_OAUTH: false,
  GOOGLE_CLIENT_ID: "g-id" as string | undefined,
  GOOGLE_CLIENT_SECRET: "g-secret" as string | undefined,
  FACEBOOK_APP_ID: "f-id" as string | undefined,
  FACEBOOK_APP_SECRET: "f-secret" as string | undefined,
  DISCORD_CLIENT_ID: "d-id" as string | undefined,
  DISCORD_CLIENT_SECRET: "d-secret" as string | undefined,
}));

vi.mock("./env.js", () => ({ env: testEnv }));

const { authorizeUrl, enabledProviders, profileFromCode, redirectUri } =
  await import("./oauth.js");

type Call = [string, RequestInit | undefined];

// Answers the token request, then the profile request.
function providerAnswers(
  profile: unknown,
  token: unknown = { access_token: "tok" },
) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json(token))
    .mockResolvedValueOnce(Response.json(profile));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which providers are on", () => {
  it("is each that has an id and a secret", () => {
    expect(enabledProviders(testEnv.AUTH_TOKEN_SECRET)).toEqual([
      "google",
      "facebook",
      "discord",
    ]);
  });

  it("leaves out one that has only half of it", () => {
    testEnv.FACEBOOK_APP_SECRET = undefined;

    expect(enabledProviders(testEnv.AUTH_TOKEN_SECRET)).toEqual([
      "google",
      "discord",
    ]);
    testEnv.FACEBOOK_APP_SECRET = "f-secret";
  });

  it("is none without a secret for the sessions", () => {
    expect(enabledProviders("")).toEqual([]);
  });
});

describe("the address at the provider", () => {
  it.each([
    ["google", "https://accounts.google.com/o/oauth2/v2/auth", true],
    ["discord", "https://discord.com/oauth2/authorize", true],
    ["facebook", "https://www.facebook.com/dialog/oauth", false],
  ] as const)("%s", (id, address, pkce) => {
    const url = new URL(authorizeUrl(id, { state: "st", verifier: "ver" }));

    expect(url.origin + url.pathname).toBe(address);
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri(id));
    expect(url.searchParams.get("code_challenge_method")).toBe(
      pkce ? "S256" : null,
    );
    // The challenge is derived from the verifier, which itself is never sent.
    expect(url.search).not.toContain("ver&");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("is the same one, exactly, for every sign-in", () => {
    expect(redirectUri("google")).toBe(
      "https://api.example.com/auth/google/callback",
    );
  });
});

describe("the person behind a code", () => {
  it("is read from Google, after trading the code with the app's secret and the PKCE verifier", async () => {
    const fetchMock = providerAnswers({
      sub: "g1",
      email: "a@example.com",
      email_verified: true,
      name: "Alice",
    });

    expect(await profileFromCode("google", "the-code", "the-verifier")).toEqual(
      {
        id: "g1",
        email: "a@example.com",
        emailVerified: true,
        name: "Alice",
      },
    );

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as Call;
    const body = new URLSearchParams(String(tokenInit?.body));

    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: "authorization_code",
      code: "the-code",
      client_id: "g-id",
      client_secret: "g-secret",
      code_verifier: "the-verifier",
      redirect_uri: redirectUri("google"),
    });

    const [profileUrl, profileInit] = fetchMock.mock.calls[1] as Call;
    expect(profileUrl).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect((profileInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("is read from Discord, with the display name before the user name", async () => {
    providerAnswers({
      id: "d1",
      username: "alice#1",
      global_name: "Alice",
      email: "a@example.com",
      verified: true,
    });

    expect(await profileFromCode("discord", "c", "v")).toEqual({
      id: "d1",
      email: "a@example.com",
      emailVerified: true,
      name: "Alice",
    });
  });

  it("is read from Facebook, which gives no email to some, and gets no PKCE verifier", async () => {
    const fetchMock = providerAnswers({ id: "f1", name: "Alice" });

    expect(await profileFromCode("facebook", "c", "v")).toEqual({
      id: "f1",
      email: undefined,
      name: "Alice",
    });

    const body = new URLSearchParams(
      String((fetchMock.mock.calls[0] as Call)[1]?.body),
    );
    expect(body.has("code_verifier")).toBe(false);
  });

  it("is refused when the provider refuses the code, without repeating what it said", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "secret-detail" }, { status: 400 }),
        ),
    );

    await expect(profileFromCode("google", "c", "v")).rejects.toThrow(
      "google token request failed: 400",
    );
    await expect(profileFromCode("google", "c", "v")).rejects.not.toThrow(
      /secret-detail/,
    );
  });

  it.each([
    ["a profile without an id", { name: "Alice" }],
    ["an answer that is not a profile", "nope"],
  ])("is refused for %s", async (_name, profile) => {
    providerAnswers(profile);

    await expect(profileFromCode("google", "c", "v")).rejects.toThrow();
  });

  it("is refused when there is no token in the answer", async () => {
    providerAnswers({ sub: "g1" }, { token_type: "Bearer" });

    await expect(profileFromCode("google", "c", "v")).rejects.toThrow();
  });
});
