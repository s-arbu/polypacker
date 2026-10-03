# Project Context: PolyPacker (Hackathon MVP)

## 1. The Situation

- We are participating in a 48-hour Game Tech Hackathon.
- **DEADLINE:** Tomorrow at 13:00. Time is our most critical resource.
- **GOAL:** Speed, a polished UI, and a flawless demo flow. Perfect code architecture is secondary.
- Do NOT overengineer. Do NOT suggest complex backends, databases, or state management like Redux.

## 2. The Product: PolyPacker

PolyPacker is an "Arcade-Ready Asset Pipeline" built for game developers.
**The Problem:** Generating 3D assets via APIs (like Hyper3D) leaves developers with raw `.glb` files. Developers then waste 20 minutes manually scaling the asset, adding hitboxes, and writing engine-specific JSON configs for the "Arcade" game engine.
**Our Solution:** The user types a prompt. We generate the 3D model AND we use an LLM to simultaneously generate the required game logic metadata (`arcade-config.json`). We bundle both into a `.zip` file for instant 1-click game engine import.

## 3. Tech Stack

- Frontend: React 18, TypeScript, Vite
- Styling: Tailwind CSS
- Package Manager: Bun
- Icons: `lucide-react`
- Core Logic Libraries: `jszip` (for zipping files in browser) and `file-saver` (for downloading)

## 4. Architecture & Execution Rules (STRICT!)

- **RULE 1: Mock-First Approach.** We will NOT connect to the real Hyper3D or Gemini APIs until the entire UI and ZIP-download flow works perfectly with hardcoded mock data.
- **RULE 2: The Two Tracks.** When the user hits "Generate", simulate a 2-3 second loading state. Then resolve with:
  - Track A (Visuals): A placeholder `.glb` file representation.
  - Track B (Logic): A mocked JSON config (e.g., `{"type": "prop", "collider": "box", "mass": 50}`).
- **RULE 3: The ZIP Core.** The most important feature is the "Download Arcade Bundle" button. It must take the mocked `.glb` and the mocked `.json`, zip them together using `jszip`, and trigger a local download.
- **RULE 4: UI/UX Quality.** The UI must look like a premium B2B SaaS tool. Use Dark Mode by default, Bento-grid layouts, and clean loading skeletons/spinners.

## 5. Current Developer Task

Always refer to the latest prompt from the developer. Assume the priority is always the Frontend UI and the JSZip bundling logic unless explicitly told to implement real API fetch calls.

## Language

**Asset bundle**:
A downloadable package pairing a 3D asset with the Arcade metadata needed to use it in a game.
_Avoid_: Raw model

**Arcade config**:
The JSON metadata that describes an asset's gameplay properties for the Arcade engine.
_Avoid_: Model settings

**Mock asset**:
A clearly identified, non-importable placeholder used in the demo instead of a generated 3D model.
_Avoid_: Generated model, production asset
