# Screenshot to GPX: Frontend-Only Build Plan

Goal: take a route screenshot (orange line on a grey basemap) and produce a GPX file, entirely in the browser (React / Next.js / Vite), using AI where it helps.

The problem splits in two:

1. **Shape extraction:** which pixels are the route, and in what order are they walked?
2. **Localization:** where on Earth is this picture? The image has no coordinates, so this is the hard part.

## Architecture (all in the browser)

| Step | How, with no backend |
|---|---|
| Extract the orange line | Canvas `getImageData`, then HSV threshold. Pure JS, or opencv.js (WASM) if you want morphology for free. |
| Skeleton + ordering | Zhang-Suen thinning in JS (~50 lines), then a graph walk from the start marker. Run it in a Web Worker so the UI doesn't freeze. |
| Localization | **Gemini vision.** Send the screenshot and ask for structured JSON: city/area guess, plus each readable place label with its pixel box (`box_2d`). |
| Geocode labels | Nominatim or Photon (both work from the browser with CORS). Respect the ~1 req/sec limit. |
| Fit transform | Least squares for scale + translation in Web Mercator meters. RANSAC if there are more than 2 anchors. |
| Drag-to-fix | MapLibre GL JS. Draw the route as GeoJSON from the transform, and give the user 2 draggable anchor handles (move and scale only, no rotation). |
| Snap to streets | See "Snapping without a backend" below. |
| Verify | Re-rasterize the route to a canvas and compute overlap with the original mask. Show it as a confidence score. |
| Export | Build the GPX XML as a string, then download it as a `Blob`. |

### Where AI helps and where it doesn't

- **Use Gemini for:** reading labels, guessing the area, and optionally critiquing the final overlay ("does this look right?").
- **Don't use it for:** tracing the line. LLMs are not pixel-accurate, so keep that step deterministic.

## Snapping without a backend

This is the weakest link. Options, from most to least ambitious:

1. **Public Valhalla or OSRM instance.** Easy, but demo servers are rate-limited, and CORS plus the foot profile for map matching need testing early.
2. **Mapbox Map Matching API.** Works from the browser with a token and has a free tier, but it's a third-party dependency.
3. **Waypoint routing.** Take a point every ~150 m along the trace and ask a foot-routing API for the path between consecutive points. A cheap "snap".
4. **Skip snapping in v1.** A 3-4 m/pixel trace, Douglas-Peucker simplified, is already usable for a GPX. Add snapping later.

Recommendation: start with option 4, then add option 1 or 3 as an optional "Snap to roads" button.

## Build order for AI Studio

1. Upload an image, then show the orange mask and skeleton overlay, to prove extraction works.
2. Order the path and export a GPX with fake coordinates, to prove the pipeline end to end.
3. Add the Gemini localization call, the geocoding, and the transform fit.
4. Add the MapLibre overlay with draggable anchors.
5. Add snapping and the verify score.

## Risks to know up front

- **API key exposure:** a Gemini key in frontend code is visible to anyone. AI Studio handles this for prototypes, but a public deployment needs a thin proxy or per-user keys.
- **Overlapping segments:** the skeleton can't tell whether a segment was walked once or twice, so keep a "mark as out-and-back" toggle.
- **Direction:** keep a flip toggle, since a screenshot has no direction.
- **UI overlays and crops:** Strava/Komoot buttons or legends can cover parts of the line, and cropped screenshots have unknown zoom, so scale must come from anchors, not from the image.
- **Basemap style:** satellite or dark basemaps break grey-road alignment.

## Next step

Turn this into a ready-to-paste AI Studio prompt, including the Gemini JSON schema for label extraction (place name, pixel box, confidence).
