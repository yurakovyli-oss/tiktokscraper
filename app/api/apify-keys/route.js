import { NextResponse } from 'next/server';

export async function GET() {
    try {
        let keysConfig = process.env.APIFY_KEYS;
        // If not configured, we just return empty array or fake one derived from default token
        if (!keysConfig) {
            return NextResponse.json({ keys: [{ id: 'default', name: 'Дефолтный' }] });
        }

        // Clean up accidental single quotes if they got passed directly from .env.local
        if (keysConfig.startsWith("'") && keysConfig.endsWith("'")) {
            keysConfig = keysConfig.slice(1, -1);
        }

        const parsedKeys = JSON.parse(keysConfig);

        // Strip out the secret tokens before sending to the browser
        const safeKeys = parsedKeys.map(k => ({
            id: k.id,
            name: k.name
        }));

        return NextResponse.json({ keys: safeKeys });

    } catch (error) {
        console.error('Failed to parse APIFY_KEYS from env:', error);
        // Fallback
        return NextResponse.json({ keys: [{ id: 'default', name: 'ОШИБКА КОНФИГА' }] });
    }
}
