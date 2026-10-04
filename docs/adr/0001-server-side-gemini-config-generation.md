# Generate Arcade configs through a server-side Gemini route

The browser must not hold provider API keys, so Gemini config and Hyper3D model generation run through Nitro API routes using server-only `GEMINI_API_KEY` and `HYPER3D_API_KEY` variables. Gemini's validated config is retained if Hyper3D fails; the app then uses a prompt-matched local demo model so a ZIP can still be produced. Both routes are public and unauthenticated for now, so provider quota use remains possible.

Hyper3D generation uses a short submission request followed by independent status requests. The submission route returns an AES-GCM-encrypted task token, derived from the server-only Hyper3D key, so clients can poll without exposing provider task credentials or requiring server-side session storage. The client polls for up to five minutes; a failed or still-pending job falls back to the local demo model.
