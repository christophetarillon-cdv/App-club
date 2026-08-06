import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { results, dances } = await request.json();

    const csvContent = [
      'nom;adresse;code_postal;ville;email;telephone;site_web;latitude;longitude;danses',
      ...results.map((s: any) =>
        [s.n, s.a, s.cp, s.v, s.e, s.t, s.w, s.lat || '', s.lon || '', s.d.join(' | ')]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(';')
      ),
    ].join('\r\n');

    const bom = '﻿';
    const content = bom + csvContent;

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ffdanse_${dances.join('_')}_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    );
  }
}
