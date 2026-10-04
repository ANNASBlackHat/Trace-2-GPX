import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '30mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

// Gemini localization endpoint
app.post('/api/localize', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 in request body' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. You can enter location manually.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Clean base64 string if it contains data prefix
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const prompt = `Analyze this GPS route screenshot (e.g. from Strava, Garmin, Apple Fitness, Nike Run Club, Komoot, or AllTrails).
Your job is to identify the geographic location of this map so we can georeference the route onto real world coordinates.

CRITICAL LOCATION PRIOR:
The user is based in Indonesia, and the vast majority of route screenshots are located in Yogyakarta (Jogja / Daerah Istimewa Yogyakarta, Sleman, Bantul), Indonesia.
Always check and prioritize Yogyakarta / Indonesia landmarks, Indonesian road naming ("Jl.", "Jalan", "Gg.", "Ring Road", "Kaliurang", "Palagan", "Solo", "Gejayan", "Malioboro", "Kraton", "Alun-Alun", "UGM", "UNY", "UPN", "Maguwoharjo", "Mandala Krida", "Tambakboyo", "Wisdom Park", "Code River / Kali Code", "Selokan Mataram").
If the screenshot matches Yogyakarta or surrounding areas in Java / Indonesia, resolve the exact neighborhood, district, or sub-district. If you are unsure between international cities vs Yogyakarta, strongly favor Yogyakarta / Indonesia.

Inspect the basemap carefully for:
1. City name, metropolitan area, country, park/landmark names, street names, highway labels, body of water names (rivers, embung, bays, lakes).
2. The visible bounding location.
3. Specific readable labels on the map with their approximate pixel position (normalized 0 to 1000 from top-left: x from 0=left to 1000=right, y from 0=top to 1000=bottom).
4. Best estimated center latitude and longitude for this map area (e.g. Yogyakarta is approx lat: -7.7956, lng: 110.3695), plus a suggested map zoom level (typically 13 to 16).
5. The detected color of the route line (e.g. orange, cyan, volt green, red, purple).

Return strict JSON according to the schema.`;

    const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let lastError: any = null;
    let successfulData: any = null;
    let modelUsed = '';

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`Attempting Gemini localization with model: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                city: { type: Type.STRING, description: 'City or municipality name (e.g. San Francisco, New York, London)' },
                area: { type: Type.STRING, description: 'Specific area, park, or neighborhood (e.g. Central Park, Presidio, Hyde Park)' },
                country: { type: Type.STRING, description: 'Country (e.g. United States, United Kingdom)' },
                estimatedCenterLat: { type: Type.NUMBER, description: 'Approximate latitude for the center of this screenshot' },
                estimatedCenterLng: { type: Type.NUMBER, description: 'Approximate longitude for the center of this screenshot' },
                suggestedZoom: { type: Type.INTEGER, description: 'Suggested map zoom level from 10 to 18' },
                detectedRouteColor: { type: Type.STRING, description: 'Dominant color of the tracked path (e.g. "orange", "cyan", "red", "green")' },
                confidence: { type: Type.NUMBER, description: 'Confidence between 0.0 and 1.0 in this geographic identification' },
                labels: {
                  type: Type.ARRAY,
                  description: 'Readable place names, street names, landmarks or bodies of water visible on map',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: 'Exact text or place name seen on the map' },
                      type: { type: Type.STRING, description: 'park | road | water | landmark | neighborhood | poi' },
                      normX: { type: Type.INTEGER, description: 'Normalized X coordinate (0 to 1000) of this label in image' },
                      normY: { type: Type.INTEGER, description: 'Normalized Y coordinate (0 to 1000) of this label in image' },
                    },
                    required: ['name', 'normX', 'normY'],
                  },
                },
                summary: { type: Type.STRING, description: 'One sentence explanation of how the location was identified' },
              },
              required: ['city', 'country', 'estimatedCenterLat', 'estimatedCenterLng', 'labels', 'confidence'],
            },
          },
        });

        const text = response.text;
        if (text) {
          successfulData = JSON.parse(text);
          modelUsed = modelName;
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${modelName} failed or unavailable: ${err.message}`);
        lastError = err;
        // Continue loop to try next model in candidate list
      }
    }

    if (!successfulData) {
      throw lastError || new Error('All candidate Gemini models were unavailable');
    }

    return res.json({ success: true, modelUsed, result: successfulData });
  } catch (err: any) {
    console.error('Localization error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to localize screenshot',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Trace2GPX server running on port ${PORT}`);
  });
}

startServer();
