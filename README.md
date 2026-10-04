# PolyPacker

### The Arcade-Ready Asset Pipeline

Turn an asset idea into a game-ready bundle: a 3D model paired with the Arcade
engine metadata it needs.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Live_API-4285F4?logo=google&logoColor=white)
![JSZip](https://img.shields.io/badge/JSZip-ZIP_packaging-229ED9)

## 🚨 The Problem

3D generation APIs can deliver a `.glb` mesh, but a mesh alone is not ready for
gameplay. Developers still have to configure colliders, mass, damage radius,
and other engine-facing properties by hand—often spending 20 minutes turning a
raw asset into something an Arcade project can use.

## 💡 Our Solution

PolyPacker turns that manual setup into one prompt-driven pipeline:

1. Describe the asset you need.
2. Gemini analyzes the prompt and generates validated Arcade logic metadata.
3. PolyPacker pairs that config with a matching 3D model.
4. Download a ZIP containing the `.glb`, `arcade-config.json`, and a bundle
   README—ready to import into an Arcade project.

The result connects asset creation to gameplay setup, so developers can spend
less time wiring metadata and more time building.

## 🏗️ Architecture & fallback

PolyPacker uses a live 3D generation API with a deterministic local fallback:

- **Live Gemini integration:** The prompt is sent to a server-side Gemini
  endpoint, which returns schema-constrained JSON. The server validates the
  response before it is used in the bundle.
- **Live Hyper3D generation:** A server-side Nitro endpoint submits a Rodin
  generation job, polls until it finishes, and downloads the generated `.glb`.
- **Local demo fallback:** If Hyper3D is unavailable, fails, or exceeds the
  60-second deadline, the app fetches a pre-made `.glb` from `public/` based on
  the prompt. Gemini failures remain visible and do not produce a ZIP.

Both API keys are kept server-side; the browser calls the Nitro routes, not the
provider APIs directly.

## 🚀 How to Run Locally

You need [Bun](https://bun.sh/), a Gemini API key, and a Hyper3D API key.

1. Install dependencies:

   ```sh
   bun install
   ```

2. Create a `.env.local` file in the project root and add your key:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   HYPER3D_API_KEY=your_hyper3d_api_key
   ```

   Keep both keys server-side. Do not prefix them with `VITE_`, which would
   expose them to browser code.

3. Start the development server:

   ```sh
   bun run dev
   ```

Open the local URL printed by Vite. The app and Gemini/Hyper3D endpoints run
together through the Vite/Nitro development server. Configure `GEMINI_API_KEY`
and `HYPER3D_API_KEY` as server environment variables in production as well.
Both generation endpoints are public and unauthenticated; anyone who can reach
the app can use the configured provider quotas. Monitor the Gemini and Hyper3D
accounts for usage.
