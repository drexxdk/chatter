import { PayloadApi } from "./payload";

export default async function globalSetup() {
  const payload = new PayloadApi();

  try {
    await payload.login();
  } catch (error) {
    throw new Error(
      "The e2e tests need apps/admin running on http://localhost:3000 with its database seeded " +
        `(npm run dev:admin). ${error instanceof Error ? error.message : error}`,
    );
  }

  await payload.sweepLeftovers();
}
