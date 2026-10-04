# Generate Arcade configs through a server-side Gemini route

The browser must not hold the Gemini API key, so Arcade config generation runs through a Nitro API route using a server-only `GEMINI_API_KEY`. We use Google's Interactions API with `gemini-3.8-flash` for the free-tier, non-commercial demo and validate the returned config before exposing it to the app. The route is public and unauthenticated for now, so Gemini quota use remains possible. The hackathon flow selects a pre-made local demo model rather than calling a paid 3D-generation API.
