/**
 * Sample GPS route screenshots with preconfigured metadata, realistic map features,
 * and ground truth coordinates for 1-click testing.
 */

import { GeoCoordinate } from '../utils/georeferencing';

export interface SampleRoute {
  id: string;
  title: string;
  location: string;
  appBrand: string;
  colorPresetId: string;
  defaultColorHex: string;
  description: string;
  approxCenter: GeoCoordinate;
  suggestedZoom: number;
  anchors: [
    { name: string; pixelPercent: { x: number; y: number }; geo: GeoCoordinate },
    { name: string; pixelPercent: { x: number; y: number }; geo: GeoCoordinate }
  ];
  drawMap: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export const SAMPLE_ROUTES: SampleRoute[] = [
  {
    id: 'ugm-jogja',
    title: 'UGM Campus Loop (Jogja)',
    location: 'Yogyakarta (Jogja), Sleman, Indonesia',
    appBrand: 'Strava',
    colorPresetId: 'strava-orange',
    defaultColorHex: '#FC4C02',
    description: 'Iconic running & cycling loop around Universitas Gadjah Mada, GSP & Boulevard.',
    approxCenter: { lat: -7.7712, lng: 110.3778 },
    suggestedZoom: 15,
    anchors: [
      {
        name: 'UGM Boulevard / Bundaran (South)',
        pixelPercent: { x: 0.5, y: 0.86 },
        geo: { lat: -7.7758, lng: 110.3778 },
      },
      {
        name: 'Wisdom Park / Selokan (North)',
        pixelPercent: { x: 0.5, y: 0.16 },
        geo: { lat: -7.7655, lng: 110.3789 },
      },
    ],
    drawMap: (ctx, width, height) => {
      // Indonesian city basemap background (warm grey)
      ctx.fillStyle = '#f3efe8';
      ctx.fillRect(0, 0, width, height);

      // Selokan Mataram water canal (running east-west across top)
      ctx.strokeStyle = '#b4d7ee';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.18);
      ctx.lineTo(width, height * 0.18);
      ctx.stroke();

      // Kali Code / river (curving on left)
      ctx.strokeStyle = '#c2e0f4';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(width * 0.12, 0);
      ctx.bezierCurveTo(width * 0.08, height * 0.4, width * 0.16, height * 0.7, width * 0.1, height);
      ctx.stroke();

      // UGM campus green campus park areas
      ctx.fillStyle = '#d8ebd4';
      ctx.beginPath();
      ctx.roundRect(width * 0.28, height * 0.22, width * 0.46, height * 0.62, 16);
      ctx.fill();

      // GSP (Graha Sabha Pramana) lawn
      ctx.fillStyle = '#c1e2bd';
      ctx.fillRect(width * 0.42, height * 0.48, width * 0.18, height * 0.16);

      // Surrounding roads (Jl. Kaliurang, Jl. Colombo, Jl. Gejayan)
      ctx.strokeStyle = '#e2dfd7';
      ctx.lineWidth = 3;
      // Jl. Kaliurang (left)
      ctx.beginPath();
      ctx.moveTo(width * 0.24, 0);
      ctx.lineTo(width * 0.24, height);
      ctx.stroke();
      // Jl. Colombo (bottom)
      ctx.beginPath();
      ctx.moveTo(0, height * 0.88);
      ctx.lineTo(width, height * 0.88);
      ctx.stroke();

      // Labels on map (Indonesian road names)
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('UNIVERSITAS GADJAH MADA (UGM)', width * 0.51, height * 0.42);
      ctx.font = '10px sans-serif';
      ctx.fillText('Graha Sabha Pramana (GSP)', width * 0.51, height * 0.56);
      ctx.fillText('Selokan Mataram', width * 0.7, height * 0.14);

      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('Jl. Kaliurang', width * 0.23, height * 0.35);
      ctx.fillText('Jl. Colombo Yogyakarta', width * 0.55, height * 0.93);

      // Strava GPS Track (Bold Orange `#FC4C02`) looping the campus
      ctx.strokeStyle = '#FC4C02';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(width * 0.5, height * 0.86); // Bundaran UGM Boulevard
      ctx.lineTo(width * 0.32, height * 0.86);
      ctx.lineTo(width * 0.32, height * 0.45);
      ctx.lineTo(width * 0.32, height * 0.24);
      ctx.lineTo(width * 0.5, height * 0.16); // North Wisdom Park
      ctx.lineTo(width * 0.68, height * 0.24);
      ctx.lineTo(width * 0.7, height * 0.58);
      ctx.lineTo(width * 0.68, height * 0.86);
      ctx.closePath();
      ctx.stroke();

      // Start/Finish dot
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.86, 5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'alkid-kraton-jogja',
    title: 'Alun-Alun Kidul & Kraton Jogja',
    location: 'Yogyakarta (Jogja), DIY, Indonesia',
    appBrand: 'Garmin',
    colorPresetId: 'garmin-cyan',
    defaultColorHex: '#00A3E0',
    description: 'Popular night running circuit around Alun-Alun Kidul and Plengkung Gading.',
    approxCenter: { lat: -7.8118, lng: 110.3632 },
    suggestedZoom: 16,
    anchors: [
      {
        name: 'Plengkung Gading (South)',
        pixelPercent: { x: 0.5, y: 0.86 },
        geo: { lat: -7.8148, lng: 110.3632 },
      },
      {
        name: 'Kraton Ngayogyakarta (North)',
        pixelPercent: { x: 0.5, y: 0.2 },
        geo: { lat: -7.8052, lng: 110.3642 },
      },
    ],
    drawMap: (ctx, width, height) => {
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(0, 0, width, height);

      // Kraton complex (North)
      ctx.fillStyle = '#e2dfd5';
      ctx.fillRect(width * 0.32, height * 0.12, width * 0.38, height * 0.24);

      // Alun-Alun Kidul (Green square at South)
      ctx.fillStyle = '#d2e8cb';
      ctx.fillRect(width * 0.36, height * 0.52, width * 0.3, height * 0.3);

      // Two iconic beringin trees in middle of Alkid!
      ctx.fillStyle = '#5c8a52';
      ctx.beginPath();
      ctx.arc(width * 0.48, height * 0.67, 7, 0, Math.PI * 2);
      ctx.arc(width * 0.54, height * 0.67, 7, 0, Math.PI * 2);
      ctx.fill();

      // Labels
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ALUN-ALUN KIDUL (ALKID)', width * 0.51, height * 0.48);
      ctx.fillText('KRATON NGAYOGYAKARTA', width * 0.51, height * 0.22);
      ctx.font = '10px sans-serif';
      ctx.fillText('Plengkung Nirbaya (Gading)', width * 0.51, height * 0.92);

      // Garmin Cyan GPS line around Alkid square
      ctx.strokeStyle = '#00A3E0';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(width * 0.34, height * 0.5);
      ctx.lineTo(width * 0.68, height * 0.5);
      ctx.lineTo(width * 0.68, height * 0.84);
      ctx.lineTo(width * 0.34, height * 0.84);
      ctx.closePath();
      ctx.stroke();

      // Waypoint circle
      ctx.fillStyle = '#00A3E0';
      ctx.beginPath();
      ctx.arc(width * 0.34, height * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'central-park-ny',
    title: 'Central Park 10K Loop',
    location: 'New York City, NY, USA',
    appBrand: 'Strava',
    colorPresetId: 'strava-orange',
    defaultColorHex: '#FC4C02',
    description: 'Classic Strava loop around Central Park Main Drive and the Reservoir.',
    approxCenter: { lat: 40.782865, lng: -73.965355 },
    suggestedZoom: 14,
    anchors: [
      {
        name: 'Columbus Circle (SW Corner)',
        pixelPercent: { x: 0.28, y: 0.88 },
        geo: { lat: 40.7681, lng: -73.9819 },
      },
      {
        name: 'Harlem Meer (NE Corner)',
        pixelPercent: { x: 0.72, y: 0.12 },
        geo: { lat: 40.7968, lng: -73.9515 },
      },
    ],
    drawMap: (ctx, width, height) => {
      // Background city grid (light grey)
      ctx.fillStyle = '#f0f0ed';
      ctx.fillRect(0, 0, width, height);

      // Surrounding streets (light lines)
      ctx.strokeStyle = '#e2e2de';
      ctx.lineWidth = 2;
      for (let x = 20; x < width; x += 35) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 20; y < height; y += 45) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Central park polygon (pale green rectangle with angle)
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((-29 * Math.PI) / 180); // NYC 29-degree street grid
      const parkW = width * 0.38;
      const parkH = height * 0.82;

      ctx.fillStyle = '#d8ecd5';
      ctx.fillRect(-parkW / 2, -parkH / 2, parkW, parkH);

      // Central Park Reservoir (pale blue)
      ctx.fillStyle = '#c5e3f6';
      ctx.beginPath();
      ctx.ellipse(0, -parkH * 0.1, parkW * 0.35, parkH * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // The Lake
      ctx.beginPath();
      ctx.ellipse(-parkW * 0.05, parkH * 0.18, parkW * 0.28, parkH * 0.08, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Internal park paths (faint grey)
      ctx.strokeStyle = '#c0d4be';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, parkW * 0.44, parkH * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Labels on map
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CENTRAL PARK', 0, parkH * 0.02);
      ctx.font = '10px sans-serif';
      ctx.fillText('Jacqueline Kennedy Reservoir', 0, -parkH * 0.1);

      ctx.restore();

      // Street labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('5th Avenue', width * 0.72, height * 0.45);
      ctx.fillText('Central Park West', width * 0.15, height * 0.55);

      // Strava GPS Track (Bold Orange `#FC4C02`)
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((-29 * Math.PI) / 180);

      ctx.strokeStyle = '#FC4C02';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      // Smooth loop around park perimeter drive
      const w = parkW * 0.42;
      const h = parkH * 0.45;
      ctx.moveTo(-w, -h * 0.7);
      ctx.lineTo(-w * 0.9, -h * 0.95);
      ctx.lineTo(-w * 0.3, -h);
      ctx.lineTo(w * 0.4, -h * 0.95);
      ctx.lineTo(w * 0.95, -h * 0.7);
      ctx.lineTo(w * 0.9, 0);
      ctx.lineTo(w * 0.95, h * 0.7);
      ctx.lineTo(w * 0.6, h * 0.95);
      ctx.lineTo(0, h);
      ctx.lineTo(-w * 0.8, h * 0.95);
      ctx.lineTo(-w * 0.95, h * 0.6);
      ctx.lineTo(-w * 0.92, 0);
      ctx.closePath();
      ctx.stroke();

      // Start/Finish dot
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(-w, -h * 0.7, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    },
  },
  {
    id: 'golden-gate-sf',
    title: 'Crissy Field & Golden Gate Bridge',
    location: 'San Francisco, CA, USA',
    appBrand: 'Garmin',
    colorPresetId: 'garmin-cyan',
    defaultColorHex: '#00A3E0',
    description: 'Garmin run from Marina Green along Crissy Field to Fort Point.',
    approxCenter: { lat: 37.8065, lng: -122.455 },
    suggestedZoom: 14,
    anchors: [
      {
        name: 'Marina Green (East Start)',
        pixelPercent: { x: 0.82, y: 0.74 },
        geo: { lat: 37.8055, lng: -122.4375 },
      },
      {
        name: 'Fort Point / Bridge (West End)',
        pixelPercent: { x: 0.16, y: 0.28 },
        geo: { lat: 37.8105, lng: -122.4772 },
      },
    ],
    drawMap: (ctx, width, height) => {
      // Land
      ctx.fillStyle = '#f2efe9';
      ctx.fillRect(0, 0, width, height);

      // San Francisco Bay (North side - blue)
      ctx.fillStyle = '#c8e2f8';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(width, 0);
      ctx.lineTo(width, height * 0.62);
      ctx.bezierCurveTo(width * 0.7, height * 0.64, width * 0.45, height * 0.45, width * 0.2, height * 0.38);
      ctx.lineTo(0, height * 0.32);
      ctx.closePath();
      ctx.fill();

      // Shoreline line
      ctx.strokeStyle = '#b0d0ea';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Presidio park area (soft green)
      ctx.fillStyle = '#d5ebd1';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.35);
      ctx.lineTo(width * 0.55, height * 0.52);
      ctx.lineTo(width * 0.5, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Labels
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('SAN FRANCISCO BAY', width * 0.45, height * 0.2);
      ctx.fillText('CRISSY FIELD', width * 0.42, height * 0.62);
      ctx.fillText('PRESIDIO', width * 0.25, height * 0.8);
      ctx.fillText('MARINA BLVD', width * 0.75, height * 0.78);

      // Garmin Cyan GPS Line
      ctx.strokeStyle = '#00A3E0';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(width * 0.85, height * 0.72); // Marina Green
      ctx.lineTo(width * 0.68, height * 0.68);
      ctx.lineTo(width * 0.52, height * 0.56);
      ctx.lineTo(width * 0.38, height * 0.48);
      ctx.lineTo(width * 0.25, height * 0.42);
      ctx.lineTo(width * 0.16, height * 0.32); // Fort Point
      ctx.lineTo(width * 0.14, height * 0.16); // South tower bridge span
      ctx.stroke();

      // Waypoint circle
      ctx.fillStyle = '#00A3E0';
      ctx.beginPath();
      ctx.arc(width * 0.85, height * 0.72, 5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'hyde-park-london',
    title: 'Hyde Park & Kensington Loop',
    location: 'London, England, UK',
    appBrand: 'Nike Run Club',
    colorPresetId: 'nike-volt',
    defaultColorHex: '#D4FF00',
    description: 'Nike Volt run looping the Serpentine and Diana Memorial Fountain.',
    approxCenter: { lat: 51.5074, lng: -0.1656 },
    suggestedZoom: 15,
    anchors: [
      {
        name: 'Hyde Park Corner (SE)',
        pixelPercent: { x: 0.88, y: 0.82 },
        geo: { lat: 51.5033, lng: -0.1517 },
      },
      {
        name: 'Kensington Palace (West)',
        pixelPercent: { x: 0.12, y: 0.42 },
        geo: { lat: 51.5052, lng: -0.1878 },
      },
    ],
    drawMap: (ctx, width, height) => {
      ctx.fillStyle = '#ebe9e4';
      ctx.fillRect(0, 0, width, height);

      // Hyde park green polygon
      ctx.fillStyle = '#d4edd0';
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height * 0.18);
      ctx.lineTo(width * 0.88, height * 0.18);
      ctx.lineTo(width * 0.92, height * 0.85);
      ctx.lineTo(width * 0.45, height * 0.82);
      ctx.lineTo(width * 0.1, height * 0.65);
      ctx.closePath();
      ctx.fill();

      // The Serpentine lake (curved blue ribbon)
      ctx.strokeStyle = '#b8dcf5';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(width * 0.32, height * 0.42);
      ctx.bezierCurveTo(width * 0.45, height * 0.52, width * 0.6, height * 0.5, width * 0.74, height * 0.58);
      ctx.stroke();

      // Labels
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('HYDE PARK', width * 0.65, height * 0.35);
      ctx.fillText('KENSINGTON GARDENS', width * 0.18, height * 0.32);
      ctx.font = '10px sans-serif';
      ctx.fillText('The Serpentine', width * 0.52, height * 0.62);

      // Nike Volt GPS Line
      ctx.strokeStyle = '#D4FF00';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(width * 0.88, height * 0.82); // Hyde park corner
      ctx.lineTo(width * 0.75, height * 0.72);
      ctx.lineTo(width * 0.55, height * 0.68);
      ctx.lineTo(width * 0.32, height * 0.62);
      ctx.lineTo(width * 0.14, height * 0.5);
      ctx.lineTo(width * 0.16, height * 0.28);
      ctx.lineTo(width * 0.48, height * 0.25);
      ctx.lineTo(width * 0.82, height * 0.28);
      ctx.lineTo(width * 0.88, height * 0.82);
      ctx.closePath();
      ctx.stroke();
    },
  },
  {
    id: 'tokyo-imperial-palace',
    title: 'Tokyo Imperial Palace Moat',
    location: 'Chiyoda, Tokyo, Japan',
    appBrand: 'Apple Fitness',
    colorPresetId: 'apple-red',
    defaultColorHex: '#FA233B',
    description: 'Iconic 5 km circular circuit around the Tokyo Imperial Palace and moat.',
    approxCenter: { lat: 35.6852, lng: 139.7528 },
    suggestedZoom: 15,
    anchors: [
      {
        name: 'Sakuradamon Gate (South)',
        pixelPercent: { x: 0.52, y: 0.86 },
        geo: { lat: 35.6782, lng: 139.7513 },
      },
      {
        name: 'Chidorigafuchi Moat (NW)',
        pixelPercent: { x: 0.22, y: 0.22 },
        geo: { lat: 35.6912, lng: 139.7468 },
      },
    ],
    drawMap: (ctx, width, height) => {
      ctx.fillStyle = '#f0eee9';
      ctx.fillRect(0, 0, width, height);

      // Outer moat (darker blue water)
      ctx.strokeStyle = '#badcf2';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.5, width * 0.32, height * 0.34, 0.2, 0, Math.PI * 2);
      ctx.stroke();

      // Palace gardens (lush green)
      ctx.fillStyle = '#c5e8c1';
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.5, width * 0.26, height * 0.28, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Labels
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('TOKYO IMPERIAL PALACE', width * 0.32, height * 0.5);
      ctx.font = '10px sans-serif';
      ctx.fillText('Chidorigafuchi Moat', width * 0.16, height * 0.24);
      ctx.fillText('Sakuradamon', width * 0.5, height * 0.92);

      // Apple Red GPS Line
      ctx.strokeStyle = '#FA233B';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.5, width * 0.35, height * 0.37, 0.2, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
];

/**
 * Renders a sample route to a data URL for initial loading.
 */
export function generateSampleImageDataUrl(sample: SampleRoute, width = 720, height = 540): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    sample.drawMap(ctx, width, height);
  }
  return canvas.toDataURL('image/png');
}
