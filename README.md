# Spatial Sketch

A session-only web prototype for sketching editable architectural forms with an iPad, Pencil, or mouse. Next.js + React + Three.js. No database, accounts, Supabase, automatic project saving, or stored API credentials.

## Run locally

Use Node.js 22 LTS and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. An example courtyard study is loaded on a fresh page. Click **Start a fresh study** for an empty canvas. Refreshing resets the study and clears the API connection.

## Try the modeling loop

1. Draw a closed outline with Freehand or Rectangle on the ground, front, or side plane.
2. Choose **New form**, select the source stroke, and choose Building mass, Wall, Slab, Box, or Cylinder.
3. Adjust the height/depth, floor count, or wall thickness. Review the 3D preview and click **Create form**.
4. Select an object in 3D or in the study list. Change dimensions, material tone, plane offset, profile size, position, or rotate the profile 90 degrees. Edits are deterministic and do not call an AI.
5. Use undo/redo. Download a `.spatial.json` project and reopen it to retain editable parameters. Export `.glb` for mesh exchange.

Fingers pan the sketch; two fingers zoom. The hand button enables single-finger drawing. Pencil and mouse draw independently of that setting. Strokes stay anchored to their sketch plane. The grid is in meters and optional snapping uses 0.25m increments. Front/side profiles extrude perpendicular to the chosen plane. The internal 3D coordinate system is Y-up.

On narrow screens, use the Sketch/3D view buttons and open Properties with the sliders button. The browser needs WebGL. Synthetic pen events and tablet layouts are covered by tests; a physical iPad/Pencil check is still required.

## Bring your own API each session

Click **Connect API** and enter the full HTTPS Chat Completions endpoint, exact model ID, and API key. Test the connection, then use it for the session. You can also manually load a local JSON file with these fields:

```json
{
  "endpoint": "https://YOUR-PROVIDER/v1/chat/completions",
  "model": "YOUR-MODEL-ID",
  "key": "YOUR-SESSION-KEY"
}
```

The app does not export this settings file or include credentials in downloaded projects. If you create a settings file yourself, keep it out of Git.

The adapter supports a text Chat Completions request with `messages`, `model`, `max_tokens`, and a final string in `choices[0].message.content`. It sends vector sketch coordinates, object parameters, selection, and the instruction. It does not send screenshots or implement arbitrary image-to-3D generation. Native Responses APIs and provider-specific authentication formats are not supported.

**IFM status:** A live authenticated connection test passed through the app on September 12, 2026, using `https://api.ifm.ai/v1/chat/completions` and `IFM/K2-Horizon-375B-A23B`. The provider returned final text in the supported Chat Completions format. The supplied credential was entered in the browser session only and is not part of this repository. This verifies the connection; automated modeling-proposal tests still use simulated responses. Text models with long reasoning may need a different token budget than this POC's 4,096-token interpretation cap.

The server proxy permits exact hostnames from `src/lib/api-server.ts`: IFM's API/platform hosts, Cerebras, Groq, OpenRouter, and Together. This list is an outbound destination restriction, not a claim that every provider/model has been tested. For a different trusted hosted gateway, add its hostname to `ALLOWED_AI_HOSTS` in `.env.local` or Vercel environment settings. Never enable arbitrary user-controlled hosts. HTTPS, the `/chat/completions` path, no redirects, bounded bodies, and a 45-second provider timeout are enforced.

The key and request pass through the app's server to your chosen provider. They are not written to a database, browser storage, cookies, project files, or application logs. Provider/platform retention policies are separate from application storage. Connection tests make a small model request and can consume provider credits. Public deployments have no account system or durable rate limiting; every user supplies their own API key.

AI returns a constrained create/update proposal. The app validates IDs, numbers, supported operations, and geometry, then shows a preview. Apply commits one undoable transaction. Results from an older project revision are discarded. AI cannot run generated code.

## Deploy to Vercel

Import this GitHub repository into Vercel, select **Next.js**, and use the repository root (`.`) as the root directory. The default build command is `npm run build`; use the standard Next.js output settings. No database or shared API secret is required. Set `ALLOWED_AI_HOSTS` only if using an additional trusted provider.

Open the resulting HTTPS URL directly in Safari on your iPad. Each tab/user has an independent in-memory study. There is no shared live editing. This build does not automatically push or deploy the repository.

For LAN development, the dev server binds to `0.0.0.0`. Add your computer's LAN hostname/IP to `allowedDevOrigins` in `next.config.ts` before using that address. Use a trusted HTTPS preview for complete Pencil/browser capability checks; Vercel is the simplest test target.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Microsoft Edge by default. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. Tests cover the draw/create/edit/undo/file loop, GLB export, pen event handling, responsive layouts, API settings, credential exclusion, and AI preview/apply. Unit tests cover profile validity, spatial transforms, supported intents, outbound URL restrictions, response errors, and input limits. Real provider calls are not part of automated tests.

## Boundaries

- Conceptual extrusions and simple assemblies, not a CAD/BIM kernel. No NURBS, booleans, openings, roofs, stairs, face sketching, or construction-ready solids.
- Mass floor lines are visual divisions of a total height; they are not physical slabs.
- Walls use overlapping segment/join meshes. GLB is a visual mesh export and does not preserve the editable project recipe or guarantee printable watertight solids.
- Units are meters. Profile editing scales/translates the existing outline. Cylinder mode fits an ellipse to the stroke bounds; Box fits a rectangle.
- Limits: 100 objects, 100 strokes, 1,500 raw points per stroke, 256 points per generated profile, 30 undo snapshots, 2MB project imports, and 512KB AI request/response bodies.
- Work stays in memory until manually downloaded. There is no offline service worker, background synchronization, account system, or persistent API configuration.

## Code map

`src/components/studio.tsx` owns session state/history; `sketch-canvas.tsx` captures input; `model-view.tsx` manages rendering; `src/lib/model.ts` validates projects/profiles; `geometry.ts` generates meshes; `intent.ts` validates AI operations; `api-server.ts` and `app/api/ai/route.ts` implement the stateless provider proxy.
