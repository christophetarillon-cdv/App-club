import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const { dances, department, filename } = await request.json();

    const csvFilename = filename || 'structures.csv';
    const csvPath = join(process.cwd(), 'public', 'data', csvFilename);
    const csvContent = readFileSync(csvPath, 'utf-8');

    const lines = csvContent.split('\n');
    const results = [];

    // Parse CSV (simple parser for semicolon-delimited with quotes)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(';').map((p) => p.replace(/^"|"$/g, ''));

      if (parts.length < 13) continue;

      const [nom, , , adresse, cp, ville, email, telephone, site, lat, lon, , dancesList] =
        parts;

      if (department && !cp.startsWith(department)) continue;

      const structureDances = dancesList
        .split('|')
        .map((d) => d.trim())
        .filter(Boolean);

      // Check if structure has ALL selected dances (ET logic)
      const hasAllDances = dances.every((selectedDance: string) =>
        structureDances.some((d) => normalise(d) === normalise(selectedDance))
      );

      if (hasAllDances) {
        results.push({
          n: nom,
          a: adresse,
          cp,
          v: ville,
          e: email,
          t: telephone,
          w: site,
          lat: lat ? parseFloat(lat) : null,
          lon: lon ? parseFloat(lon) : null,
          d: structureDances,
          u: '', // URL from CSV
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
