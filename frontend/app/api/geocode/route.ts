import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q) {
        return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
    }

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`, {
            headers: { "User-Agent": "PlannerApp/1.0" },
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error("Nominatim API error");
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: 'Failed to geocode address' }, { status: 500 });
    }
}
