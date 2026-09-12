# Spatial Sketch

A session-only web prototype for developing spatial design sketches with an iPad, Pencil, or mouse, including furniture and interiors. Next.js + React + Three.js. No database, accounts, Supabase, automatic saving, or stored API credentials. Version 0.3 adds organized sketch sessions, ink and plane transforms, and imported reference geometry.

## Run locally

Use Node.js 22 LTS and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. A fresh page starts an empty sketch session. Refreshing resets the session and clears the API connection. The optional **Project → Load example forms** command opens a sample study.

## Develop a sketch session

1. **3D is the default workspace.** Draw directly in the perspective viewport with Freehand, Rectangle, or Line. **Pick face** places a drawing plane at a tapped model face. **View plane** freezes a plane facing the current camera through the orbit center. **Ground** returns to the ground plane.
2. Give the active sketch a name in **Sketches**. All strokes you draw, across any number of planes, belong to that sketch. **Finish & next sketch** marks the idea ready and starts another without clearing previous ink. Reopen any sketch to keep developing it, hide it, or lock its ink.
3. Select a complete sketch from its list, or individual strokes using the checkboxes or **Orbit / select**. Shift-click adds strokes with a mouse. Use **Move / Rotate / Scale** handles in the viewport or **Precise transform** for numeric changes. Ink transforms around the selection center. Move selected strokes between sketches, rename a stroke, delete selected ink, or delete a whole sketch. Undo restores deleted or transformed ink.
4. Open **Plane settings** for world XYZ position and rotation, grid width/height, and move/rotate/scale handles. Scaling the plane changes its visible extent; one meter remains one meter. Plane changes affect the next stroke; existing ink stays fixed in world space. The optional **2D pad** retains the original ground/front/side workflow.
5. Ink stays ink while you develop the idea. **Straighten** and **Square corners** optionally clean selected strokes. AI proposals require review and **Apply**. The current modeling tools remain limited to supported forms and assemblies; full reconstruction of a complex sketch is not implemented.
6. **Project → Download session** includes all sketches, editable forms, and plane settings. A session with imported geometry becomes a `.spatial.zip` package containing its source files too; otherwise it is `.spatial.json`. Use **Open session** to restore it. No API settings are included. **New session** starts a blank workspace; its previous state remains in the bounded undo history.

Manual form construction is available under the collapsed **Model tools → New form** section. It supports mass, wall, slab, box, cylinder, ellipsoid, gable roof, table, chair, and pavilion recipes. This is optional and does not run automatically after drawing. Created objects have editable dimensions, material tones, and profile controls. **Export model GLB** exports visible reference meshes and created forms; use the session package to preserve sketches and editable parameters.

## Import an interior model

Choose **Import geometry** and select one model with its companion files, or use **Imports → Import model folder** on a browser with directory selection.

| Format | Files to select | Units and behavior |
| --- | --- | --- |
| GLB | The `.glb` and any externally referenced textures | glTF meters, materials and embedded textures; Draco and Meshopt decoding included |
| glTF | `.gltf`, `.bin`, and texture files; preferably their containing folder | glTF meters; relative resource paths preserved |
| OBJ | `.obj`, referenced `.mtl` files, and textures | Defaults to meters; choose the original source units after import |
| FBX | `.fbx` and any external textures | Reads file unit metadata; Three.js normalizes the FBX up axis |

The import stays in browser memory. It does not upload the model to an application server or AI provider. Each reference has a name, visibility, opacity, source units, and position/rotation/scale. **Pick face** works on its meshes so you can sketch on a wall, floor, furniture surface, or a freely positioned plane nearby. Moving/removing the reference leaves existing ink fixed. OBJ exports using Z-up can be reoriented with **Rotate Z-up model to Y-up**.

Imported models are static mesh references, with whole-model transforms; their parts are not converted into editable CAD/BIM elements. External HTTP resource loading is disabled: include local textures and buffers. KTX2 textures are not supported yet; export PNG/JPEG textures. Keep large interiors lightweight for iPad use. Limits are 150 MB and 500 source files per model, 3 million triangles and 20,000 meshes per model, 12 references, and 300 MB of retained model sources including undo history. A new tab releases the previous tab's history when it is closed.

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

The adapter supports a text Chat Completions request with `messages`, `model`, `max_tokens`, and a final string in `choices[0].message.content`. It sends vector sketch coordinates, sketch groups, object parameters, reference metadata, selection, and the instruction. Imported mesh data, source files, and screenshots are not sent. It does not implement arbitrary image-to-3D generation. Native Responses APIs and provider-specific authentication formats are not supported.

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

Browser tests use installed Microsoft Edge by default. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. Set `PLAYWRIGHT_BASE_URL` for an already running preview. Tests cover sketch groups and locks, world-space ink/plane transforms, transform cancellation, synthetic GLB/glTF/OBJ/FBX imports and face picking, missing resources, complete session packages, the manual modeling loop, GLB export, pen input, responsive layouts, credentials, and AI preview/apply. Unit tests cover profile validity, spatial transforms, session migration, file resolution, supported intents, outbound URL restrictions, response errors, and input limits. Real provider calls are not part of automated tests; the user's actual interior file has not yet been tested.

## Boundaries

- Conceptual extrusions and parametric assemblies, not a CAD/BIM kernel. No NURBS, booleans, openings, stairs, or construction-ready solids. Gable roofs are solid triangular prisms.
- Every stroke has one frozen plane at an arbitrary angle. A single Pencil stroke does not vary depth continuously. Pick face uses the triangle's tangent plane on curved meshes, not curved-surface wrapping. Face frames are world-space snapshots; editing/deleting the host does not move existing ink or attached forms.
- Geometry is procedural and editable. This is not unrestricted image-to-mesh generation or a model trained to infer hidden 3D shape from a perspective drawing.
- Mass floor lines are visual divisions of a total height; they are not physical slabs.
- Walls use overlapping segment/join meshes. GLB is a visual mesh export and does not preserve the editable project recipe or guarantee printable watertight solids.
- Units are meters. Profile editing scales/translates/rotates the existing outline. Cylinder and Ellipsoid fit ellipse bounds; Box and furniture/roof recipes fit rectangular bounds. Dimensions of a rotated profile are measured along its frame U/V bounding axes.
- Version 3 session files include groups, reference metadata, and the active drawing plane. Version 1 and 2 files remain readable and are upgraded on import/export.
- Limits: 100 objects, 100 sketch groups, 1,000 strokes, 1,500 raw points per stroke, 256 points per generated profile, 30 undo snapshots, 25 MB session JSON, 300 MB session ZIP (including decompressed content), and 512 KB AI request/response bodies. Large sessions can exceed the AI body limit even while sketching and session download remain available.
- Work stays in memory until manually downloaded. There is no offline service worker, background synchronization, account system, or persistent API configuration.

## Code map

`src/components/studio.tsx` owns session state/history; `sketch-session-panel.tsx` organizes ink; `reference-panel.tsx` manages imports; `transform-editor.tsx` edits numeric transforms; `model-view.tsx` handles 3D ink, picking, and transform controls; `spatial-toolbar.tsx` places planes; `sketch-canvas.tsx` captures 2D input. `src/lib/session.ts` transforms ink; `session-file.ts` packages/restores complete sessions; `import-geometry.ts` loads local model assets; `spatial.ts` constructs frames; `refine.ts` cleans outlines; `model.ts` validates sessions/profiles; `geometry.ts` generates meshes; `intent.ts` validates AI operations; `api-server.ts` and `app/api/ai/route.ts` implement the stateless provider proxy. Bundled Draco decoder licenses are in `public/decoders/draco/`.
