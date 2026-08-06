import { NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const dataPath = join(process.cwd(), 'public', 'data');
    const files = readdirSync(dataPath);

    const csvFiles = files
      .filter((f) => f.startsWith('structures_') && f.endsWith('.csv'))
      .map((f) => {
        const match = f.match(/structures_(\d{8})\.csv/);
        if (!match) return null;
        const dateStr = match[1];
        return {
          filename: f,
          date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
          timestamp: dateStr,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.timestamp || '') - (a?.timestamp || ''))
      .reverse();

    // Always include the main file
    csvFiles.unshift({
      filename: 'structures.csv',
      date: 'Dernier (en ligne)',
      timestamp: '99999999',
    });

    return NextResponse.json({ dates: csvFiles });
  } catch (error) {
    console.error('Error reading available dates:', error);
    return NextResponse.json(
      { error: 'Failed to list available dates' },
      { status: 500 }
    );
  }
}
