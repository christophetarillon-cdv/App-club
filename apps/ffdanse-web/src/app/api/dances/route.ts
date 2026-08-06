import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const csvPath = join(process.cwd(), 'public', 'data', 'structures.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');

    const lines = csvContent.split('\n');
    const dances = new Set<string>();

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length > 12) {
        const dancesList = parts[12]?.split('|') || [];
        dancesList.forEach((d) => {
          const trimmed = d.trim();
          if (trimmed) dances.add(trimmed);
        });
      }
    }

    return NextResponse.json({
      dances: Array.from(dances).sort(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load dances' },
      { status: 500 }
    );
  }
}
