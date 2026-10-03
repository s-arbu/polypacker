# PolyPacker

PolyPacker creates an Arcade config from an asset prompt and packages it with a
mock `.glb` placeholder in a ZIP. Gemini generates the config; the 3D model
remains mocked.

## Local development

1. Create `.env.local` in the project root:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```

   Keep this server-only variable as `GEMINI_API_KEY`; do not prefix it with
   `VITE_`. `.env.local` is ignored by Git.
2. Install dependencies and start Vite:

   ```sh
   bun install
   bun run dev
   ```

The Nitro route and Vite app run together in the same dev server. The route
rejects prompts longer than 500 characters and returns a validated Arcade
config before the app enables ZIP download.

## Deployment

The Vite + Nitro setup can deploy to Vercel. Import the repository and add
`GEMINI_API_KEY` under the project's Environment Variables, then deploy. Do not
add the key to frontend build variables or source control.

Vercel Hobby is free for personal, non-commercial demos. This deployment has a
public generation endpoint with no sign-in, so anyone who can reach it can use
the Gemini project's quota. The prompt-length limit does not prevent repeated
requests; configure and monitor the Gemini project's quota.

Google's Gemini Free Tier has usage limits and may use submitted prompts and
outputs to improve its products. The Interactions API retains data for one day
by default on the Free Tier. Do not submit sensitive information.

## Checks

```sh
bun run test
bun run lint
bun run build
```
