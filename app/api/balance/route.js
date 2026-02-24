import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const keyId = searchParams.get('keyId');

        let apifyKey = process.env.APIFY_API_TOKEN;

        if (keyId && process.env.APIFY_KEYS) {
            try {
                let keysConfig = process.env.APIFY_KEYS;
                if (keysConfig.startsWith("'") && keysConfig.endsWith("'")) {
                    keysConfig = keysConfig.slice(1, -1);
                }
                const keysList = JSON.parse(keysConfig);
                const selected = keysList.find(k => k.id === keyId);
                if (selected && selected.token) {
                    apifyKey = selected.token;
                }
            } catch (e) {
                console.error("Failed to parse APIFY_KEYS for balance check", e);
            }
        }

        let apifyBalance = null;
        let apifyError = null;

        if (apifyKey) {
            // Fetch Apify User Info (for limits)
            const userRes = await fetch(`https://api.apify.com/v2/users/me?token=${apifyKey}`);
            // Fetch Apify Monthly Usage (for spent amount)
            const usageRes = await fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${apifyKey}`);

            if (userRes.ok && usageRes.ok) {
                const userData = await userRes.json();
                const usageData = await usageRes.json();

                if (userData.data && usageData.data) {
                    // Get limit (usually inside data.data.plan for trial/free/personal)
                    const limit = userData.data.plan?.maxMonthlyUsageUsd || userData.data.plan?.monthlyUsageCreditsUsd || 5.0;

                    // Get spent (totalUsageCreditsUsdAfterVolumeDiscount or totalUsageCreditsUsd)
                    const spent = usageData.data.totalUsageCreditsUsdAfterVolumeDiscount || usageData.data.totalUsageCreditsUsd || 0;

                    const remaining = Math.max(0, limit - spent);

                    apifyBalance = `$${remaining.toFixed(2)} / $${limit.toFixed(2)}`;
                }
            } else {
                apifyError = 'Ошибка авторизации Apify ключа';
            }
        } else {
            apifyError = 'Ключ Apify не задан';
        }

        // Return the combined balances
        return NextResponse.json({
            apify: {
                balance: apifyBalance,
                error: apifyError,
            },
            groq: {
                balance: "—", // Groq doesn't expose a public billing API yet
                error: null
            }
        });

    } catch (err) {
        console.error('[Balance API Error]', err);
        return NextResponse.json(
            { error: 'Failed to fetch balances' },
            { status: 500 }
        );
    }
}
