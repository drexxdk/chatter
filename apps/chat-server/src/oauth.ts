import crypto from "crypto";

import { z } from "zod";

import { env } from "./env.js";

// Signing in with another service's account, by the authorization code flow: the browser is sent to the provider, which
// sends it back here with a code, which is traded (with the app's secret) for a token that may read who the person is.
// Only the provider's id for them, an email if it gives one, and a name to suggest are kept.
export const PROVIDER_IDS = ["google", "facebook", "discord", "dev"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const isProviderId = (value: unknown): value is ProviderId =>
  PROVIDER_IDS.includes(value as ProviderId);

export interface ProviderProfile {
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

interface Provider {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  // Not every provider understands PKCE; the state still protects against a forged return.
  pkce: boolean;
  profileUrl: string;
  readProfile: (body: unknown) => ProviderProfile;
}

const TIMEOUT_MS = 10_000;

const googleProfile = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

const discordProfile = z.object({
  id: z.string().min(1),
  username: z.string().optional(),
  global_name: z.string().nullish(),
  email: z.string().nullish(),
  verified: z.boolean().optional(),
});

const facebookProfile = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
});

const devProfile = z.object({
  id: z.string().min(1),
  email: z.string().optional(),
  name: z.string().optional(),
});

const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    pkce: true,
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    readProfile: (body) => {
      const profile = googleProfile.parse(body);

      return {
        id: profile.sub,
        email: profile.email,
        emailVerified: profile.email_verified,
        name: profile.name,
      };
    },
  },
  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scope: "identify email",
    pkce: true,
    profileUrl: "https://discord.com/api/users/@me",
    readProfile: (body) => {
      const profile = discordProfile.parse(body);

      return {
        id: profile.id,
        email: profile.email ?? undefined,
        emailVerified: profile.verified,
        name: profile.global_name ?? profile.username,
      };
    },
  },
  facebook: {
    authorizeUrl: "https://www.facebook.com/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/oauth/access_token",
    scope: "public_profile,email",
    pkce: false,
    profileUrl: "https://graph.facebook.com/me?fields=id,name,email",
    readProfile: (body) => {
      const profile = facebookProfile.parse(body);

      return { id: profile.id, email: profile.email, name: profile.name };
    },
  },
  // The stand-in of dev.ts, on this server.
  dev: {
    authorizeUrl: "/dev-oauth/authorize",
    tokenUrl: "/dev-oauth/token",
    scope: "profile",
    pkce: true,
    profileUrl: "/dev-oauth/userinfo",
    readProfile: (body) => {
      const profile = devProfile.parse(body);

      return { id: profile.id, email: profile.email, name: profile.name };
    },
  },
};

function credentials(id: ProviderId) {
  switch (id) {
    case "google":
      return [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET] as const;
    case "facebook":
      return [env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET] as const;
    case "discord":
      return [env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET] as const;
    case "dev":
      return env.DEV_OAUTH ? (["dev", "dev"] as const) : ([] as const);
  }
}

// The providers that are switched on: both of their settings are there, and tokens can be signed.
export function enabledProviders(authTokenSecret: string): ProviderId[] {
  if (!authTokenSecret || !env.PUBLIC_API_URL) return [];

  return PROVIDER_IDS.filter((id) => {
    const [clientId, secret] = credentials(id);
    return Boolean(clientId && secret);
  });
}

// Where the provider sends the browser back to; the same for every sign-in, as the provider's settings need it exactly.
export const redirectUri = (id: ProviderId) =>
  `${env.PUBLIC_API_URL}/auth/${id}/callback`;

const absolute = (url: string) =>
  url.startsWith("/") ? `${env.PUBLIC_API_URL}${url}` : url;

export function newVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

const challengeOf = (verifier: string) =>
  crypto.createHash("sha256").update(verifier).digest("base64url");

export function authorizeUrl(
  id: ProviderId,
  options: { state: string; verifier: string },
): string {
  const provider = PROVIDERS[id];
  const [clientId] = credentials(id);
  const url = new URL(absolute(provider.authorizeUrl));

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId ?? "");
  url.searchParams.set("redirect_uri", redirectUri(id));
  url.searchParams.set("scope", provider.scope);
  url.searchParams.set("state", options.state);

  if (provider.pkce) {
    url.searchParams.set("code_challenge", challengeOf(options.verifier));
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url.toString();
}

// What a failed call says is left out of the error: a provider's answer can carry a token or a code.
async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${what} failed: ${response.status}`);
  }

  return response.json();
}

// The profile of the person who has just approved the sign-in.
export async function profileFromCode(
  id: ProviderId,
  code: string,
  verifier: string,
): Promise<ProviderProfile> {
  const provider = PROVIDERS[id];
  const [clientId, clientSecret] = credentials(id);

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(id),
    client_id: clientId ?? "",
    client_secret: clientSecret ?? "",
    ...(provider.pkce ? { code_verifier: verifier } : {}),
  });

  const token = z.object({ access_token: z.string().min(1) }).parse(
    await readJson(
      await fetch(absolute(provider.tokenUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenBody,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      `${id} token request`,
    ),
  );

  return provider.readProfile(
    await readJson(
      await fetch(absolute(provider.profileUrl), {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      `${id} profile request`,
    ),
  );
}
