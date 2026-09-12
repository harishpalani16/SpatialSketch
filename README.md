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

1. **3D is the default workspace.** Draw directly in the perspective viewport with Freehand, Rectangle, or Line. **Pick face** places a drawing plane at a tapped model face. **View plane** freezes a plane facing the current camera through the orbit center. **Ground** returns to the ground plane.
2. Open **Plane settings** to tilt, turn, or shift the next sketch plane, hide its grid, or align the camera to it. Ink remains fixed in world space when you orbit or change planes. Draw multiple strokes on different planes to build spatial studies. The optional **2D pad** retains the original ground/front/side workflow.
3. Choose **New form**, select the source stroke, and choose Building mass, Wall, Slab, Box, Cylinder, Ellipsoid, Gable roof, Table, Chair, or Pavilion. Height extrudes along the sketch plane normal. Furniture is an editable assembly with tops, legs, and a back for chairs; pavilions have posts and a roof.
4. **Straighten** simplifies noisy lines. **Square corners** also fits perpendicular edges in the sketch's dominant orientation, preserving concave notches. These tools work locally and through AI. Choose New form to refine the active ink; choose Properties to refine the selected object's outline. Source ink and created forms are independent after creation.
5. Use **Orbit / select** or the study list to select a form. Edit its dimensions, material tone, plane offset, profile size, position, or angle. **Duplicate alongside** creates a copy. Edits are deterministic and do not call an AI.
6. Use undo/redo. Download a `.spatial.json` project and reopen it to retain editable parameters. Export `.glb` for mesh exchange.

In 3D, fingers orbit; two fingers pan/zoom. Pencil and left mouse draw in Draw mode; Alt-drag or Orbit mode navigates with a mouse. The hand button enables finger ink. Pen strokes capture the pointer and freeze the camera; canceled strokes are discarded. The grid is in meters and optional snapping uses 0.25m increments. The internal 3D coordinate system is Y-up. In the 2D pad, fingers pan and two fingers zoom.

On narrow screens, open Properties with the sliders button. The browser needs WebGL. The previous 2D version was confirmed working on the user's iPad; the new 3D pointer paths have browser tests and still need a physical Pencil check.

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

**IFM status:** Live modeling tests passed on September 12, 2026, using `https://api.ifm.ai/v1/chat/completions` and `IFM/K2-Horizon-375B-A23B`: (1) the app previewed and applied a table plus two chairs built from text, and (2) the proxy validated a proposal to square a synthetic noisy U-shaped stroke and build a 4 m mass, preserving its notch. The credential was used in memory and is not part of this repository. Automated tests use simulated provider responses. Text models with long reasoning may need a different token budget than this POC's 4,096-token interpretation cap.

The server proxy permits exact hostnames from `src/lib/api-server.ts`: IFM's API/platform hosts, Cerebras, Groq, OpenRouter, and Together. This list is an outbound destination restriction, not a claim that every provider/model has been tested. For a different trusted hosted gateway, add its hostname to `ALLOWED_AI_HOSTS` in `.env.local` or Vercel environment settings. Never enable arbitrary user-controlled hosts. HTTPS, the `/chat/completions` path, no redirects, bounded bodies, and a 45-second provider timeout are enforced.

The key and request pass through the app's server to your chosen provider. They are not written to a database, browser storage, cookies, project files, or application logs. Provider/platform retention policies are separate from application storage. Connection tests make a small model request and can consume provider credits. Public deployments have no account system or durable rate limiting; every user supplies their own API key.

AI tools include `refine`, `create` from a stroke, `primitive` without a stroke, `update` dimensions/position/angle, and `duplicate` spaced arrays. The request includes exact sketch vectors and each object's 3D frame plus the active placement frame. The app validates IDs, numbers, supported operations, and geometry, then previews both ink and objects. Apply commits one undoable transaction. Results from an older project or placement revision are discarded. AI cannot run generated code.

Try “Straighten this sketch, square its corners, and build it 4 meters high”, “Build a 2 by 1 meter table with two chairs”, “Make this 12 meters wide”, or “Create three copies, spaced 5 meters along U”.

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

- Conceptual extrusions and parametric assemblies, not a CAD/BIM kernel. No NURBS, booleans, openings, stairs, or construction-ready solids. Gable roofs are solid triangular prisms.
- Every stroke has one frozen plane at an arbitrary angle. A single Pencil stroke does not vary depth continuously. Pick face uses the triangle's tangent plane on curved meshes, not curved-surface wrapping. Face frames are world-space snapshots; editing/deleting the host does not move existing ink or attached forms.
- Geometry is procedural and editable. This is not unrestricted image-to-mesh generation or a model trained to infer hidden 3D shape from a perspective drawing.
- Mass floor lines are visual divisions of a total height; they are not physical slabs.
- Walls use overlapping segment/join meshes. GLB is a visual mesh export and does not preserve the editable project recipe or guarantee printable watertight solids.
- Units are meters. Profile editing scales/translates/rotates the existing outline. Cylinder and Ellipsoid fit ellipse bounds; Box and furniture/roof recipes fit rectangular bounds. Dimensions of a rotated profile are measured along its frame U/V bounding axes.
- Version 2 project files include full spatial frames. Version 1 files remain readable and are upgraded on import/export.
- Limits: 100 objects, 100 strokes, 1,500 raw points per stroke, 256 points per generated profile, 30 undo snapshots, 2MB project imports, and 512KB AI request/response bodies.
- Work stays in memory until manually downloaded. There is no offline service worker, background synchronization, account system, or persistent API configuration.

## Code map

`src/components/studio.tsx` owns session state/history; `sketch-canvas.tsx` captures 2D input; `model-view.tsx` renders and captures direct 3D ink; `spatial-toolbar.tsx` places planes; `src/lib/spatial.ts` projects rays and constructs frames; `refine.ts` cleans outlines; `model.ts` validates projects/profiles; `geometry.ts` generates meshes; `intent.ts` validates AI operations; `api-server.ts` and `app/api/ai/route.ts` implement the stateless provider proxy.
