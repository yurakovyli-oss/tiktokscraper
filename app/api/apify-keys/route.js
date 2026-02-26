import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // The primary key always uses APIFY_API_TOKEN directly.
        // This way changing APIFY_API_TOKEN automatically updates the balance display
        // without needing to also update APIFY_KEYS.
        const keys = [{ id: 'default', name: 'Основной аккаунт' }];

        if (process.env.APIFY_KEYS) {
            let keysConfig = process.env.APIFY_KEYS;
            // Clean up accidental single quotes from .env.local
            if (keysConfig.startsWith("'") && keysConfig.endsWith("'")) {
                keysConfig = keysConfig.slice(1, -1);
            }
            const parsedKeys = JSON.parse(keysConfig);
            // Append extra/backup keys, skip any that conflict with 'default'
            parsedKeys
                .filter(k => k.id !== 'default')
                .forEach(k => keys.push({ id: k.id, name: k.name }));
        }

        return NextResponse.json({ keys });

    } catch (error) {
        console.error('Failed to parse APIFY_KEYS from env:', error);
        return NextResponse.json({ keys: [{ id: 'default', name: 'Основной аккаунт' }] });
    }
}
