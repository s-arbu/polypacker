# Generate Arcade configs through a server-side Gemini route

The browser must not hold provider API keys, so Gemini config and Hyper3D model generation run through Nitro API routes using server-only `GEMINI_API_KEY` and `HYPER3D_API_KEY` variables. Gemini's validated config is retained if Hyper3D fails; the app then uses a prompt-matched local demo model so a ZIP can still be produced. Both routes are public and unauthenticated for now, so provider quota use remains possible.
