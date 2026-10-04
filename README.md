# Trace2GPX 🗺️ ➔ 📍

> **Convert route screenshots into accurate, real-world GPX tracks.**  
> Supports Strava, Garmin Connect, Nike Run Club, Apple Fitness, Komoot, and AllTrails screenshots.

---

## 🚀 Overview

Fitness applications strip GPS coordinates when exporting or sharing route images. **Trace2GPX** reconstructs the full vector GPS path directly from a raster screenshot using a hybrid deterministic computer vision engine and AI-assisted georeferencing:

1. **Deterministic Shape Extraction (Browser-local):** Extracts 100% of the vector path using HSV filtering, Zhang-Suen topological skeletonization, and graph traversal with dead-end spur backtracking.
2. **AI & OpenStreetMap Georeferencing:** Identifies visible basemap street labels via Gemini Vision, geocodes them against OpenStreetMap, and solves a 2-point conformal affine transformation.
3. **Interactive Map & OSRM Road Snapping:** Provides draggable map anchors, fine-tuning controls, OSRM road-snapping, and instant GPX XML export.

---

## ⚡ The Pipeline

```
Raw Screenshot
   │
   ▼ [1. Color Masking & Morphological Filter]
Clean Binary Mask (Route = 1, Background = 0)
   │
   ▼ [2. Zhang-Suen Topological Thinning]
1-Pixel Topological Skeleton (Centerline)
   │
   ▼ [3. Smart Graph Walk & Spur Backtracking]
Ordered Sequence of Vertices [100% Skeleton Coverage]
   │
   ▼ [4. Gemini Vision Label Extraction + OSM Geocoding]
Ground Control Anchors (Pixel Box ⟷ Real Lat/Lng)
   │
   ▼ [5. 2-Point Conformal Similitude Transform]
Initial Georeferenced Coordinates (Scale & North-Up True)
   │
   ▼ [6. OSRM Road Snapping & Fine-Tuning]
Locked to Real OpenStreetMap Road Vectors (< 3m Error)
   │
   ▼ [7. GPX Exporter]
Standard GPX File (Tracks, Timestamps, Elevation)
```

---

## 🎯 Benchmark & Evaluation

Tested against real ground truth GPS recordings in [`.examples/`](.examples):

| Image / Route | Extraction Coverage | Aligned Rotation | Median Error to True GPS | Status |
|---|:---:|:---:|:---:|:---:|
| **`kudalumping.jpeg`** (Hobby Horse GPS Art) | **100.0%** (235 vertices) | $0.0^\circ$ (North-Up) | $\pm 12\text{m}$ (Initial placement) | Verified |
| **`perahu.jpeg`** (Boat GPS Art) | **100.0%** (144 vertices) | $-0.64^\circ$ | **$2.71\text{m}$** (After OSRM Snap) | Verified |

* Benchmark test suite runs in under **1 second** using `bun scripts/evaluate_perahu_alignment.ts`.

---

## 🛠️ Key Features

- **Topological Graph Extraction:** Resolves dead-ends and out-and-back spurs by automatically traversing into dead-ends and backtracking along the edge to explore the full route network.
- **Green Start Pin Auto-Detection:** Scans RGB pixel signatures to automatically pin the start of the route to Strava/Garmin green start icons.
- **Correct Coordinate Handedness:** Formulates image pixels $(u = x, v = -y)$ in unified Cartesian space to completely eliminate accidental 90° rotations and horizontal mirroring.
- **Realistic Fallback Scaling:** Calibrates image scale against latitude-adjusted Web Mercator zoom levels, preventing uploaded images from defaulting to oversized bounds.
- **Interactive Leaflet Canvas:** Offers draggable anchor pins, pan/rotate/scale fine-tuning pads, and semi-transparent screenshot overlay for visual confirmation.
- **One-Click Road Snapping:** Snaps candidate coordinates to OpenStreetMap footpaths and roads using the public OSRM routing engine.
- **GPX Export:** Generates GPX XML with custom speeds, simulated timestamps, and elevation data.

---

## 💻 Quick Start

### Prerequisites
- Node.js (v18+) or [Bun](https://bun.sh)
- A [Google Gemini API Key](https://aistudio.google.com/) (for automatic basemap label localization)

### 1. Clone & Install
```bash
git clone https://github.com/annasblackhat/trace2gpx.git
cd trace2gpx
bun install # or npm install
```

### 2. Configure Environment
Create a `.env` file from the example:
```bash
cp .env.example .env
```
Add your Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Run Development Server
```bash
bun dev # or npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

Run the automated test suite directly:

```bash
# Test 1: Verify 100% line extraction coverage on example images
bun scripts/test_extraction.ts

# Test 2: Evaluate georeferencing accuracy against ground truth perahu.gpx
bun scripts/evaluate_perahu_alignment.ts

# Type checking
bun run lint

# Production build
bun run build
```

---

## 📁 Project Structure

```
trace2gpx/
├── .examples/                # Test screenshots (kudalumping, perahu) and ground truth GPX
├── scripts/                  # Fast-paced evaluation scripts & benchmark suite
│   ├── evaluate_perahu_alignment.ts  # Measures meter-accuracy against real GPX
│   └── test_extraction.ts            # Measures skeleton coverage & vertex count
├── src/
│   ├── components/
│   │   ├── AlignmentControls.tsx     # Map fine-tuning (pan/rotate/scale pads)
│   │   ├── ExportPanel.tsx           # GPX summary, pace selection & download
│   │   ├── ImageMaskEditor.tsx       # Canvas HSV color filter & Zhang-Suen preview
│   │   └── InteractiveMap.tsx        # Leaflet map with draggable anchors & overlays
│   ├── utils/
│   │   ├── georeferencing.ts         # Conformal similitude transform & projection math
│   │   ├── gpxExporter.ts            # GPX 1.1 XML generation
│   │   ├── imageProcessing.ts        # Color thresholding, thinning & graph traversal
│   │   └── osmGeocoding.ts           # Nominatim / Photon & OSRM road snapping
│   ├── App.tsx                       # Main step-by-step workflow & Gemini proxy integration
│   └── main.tsx
├── server.ts                 # Express proxy for Gemini Vision structured label extraction
├── package.json
└── vite.config.ts
```

---

## 📄 License

This project is licensed under the Apache 2.0 License.
