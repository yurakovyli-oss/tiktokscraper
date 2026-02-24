import { NextResponse } from 'next/server';

// In-memory cache to save on Apify requests
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

export async function POST(request) {
    try {
        const body = await request.json();
        const { query, type = 'keyword', maxItems = 10, minViews = 0, dateFrom = null, dateTo = null, forceRefresh = false, keyId } = body;

        if (!query) {
            return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
        }

        const cacheKey = `${type}:${JSON.stringify(query)}:${maxItems}:${minViews}:${dateFrom}:${dateTo}`;

        if (!forceRefresh && cache.has(cacheKey)) {
            const cachedData = cache.get(cacheKey);
            if (Date.now() - cachedData.timestamp < CACHE_TTL) {
                console.log(`Returning cached data for ${cacheKey}`);
                return NextResponse.json({ success: true, data: cachedData.data, cached: true });
            } else {
                cache.delete(cacheKey); // expired
            }
        }

        let APIFY_TOKEN = process.env.APIFY_API_TOKEN;

        if (keyId && process.env.APIFY_KEYS) {
            try {
                let keysConfig = process.env.APIFY_KEYS;
                if (keysConfig.startsWith("'") && keysConfig.endsWith("'")) {
                    keysConfig = keysConfig.slice(1, -1);
                }
                const keysList = JSON.parse(keysConfig);
                const selected = keysList.find(k => k.id === keyId);
                if (selected && selected.token) {
                    APIFY_TOKEN = selected.token;
                    console.log(`Using Apify Token from selected key ID: ${keyId}`);
                }
            } catch (e) {
                console.error("Failed to parse APIFY_KEYS for custom token selection", e);
            }
        }

        const ACTOR_ID = process.env.APIFY_ACTOR_ID || 'GdWCkxBtKWOsKjdch'; // Default to popular tiktok scraper
        // Fallback to mock data if no token is provided (useful for UI development & testing)
        if (!APIFY_TOKEN || !ACTOR_ID) {
            console.log('No Apify credentials found, returning mock data.');
            // Simulate network delay
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return NextResponse.json({
                success: true,
                mock: true,
                data: [
                    {
                        id: '1',
                        text: `Тестовое видео для ${type}: ${query}`,
                        authorMeta: { name: 'TikTokCreator', avatar: 'https://placehold.co/100x100' },
                        playCount: 1540000,
                        diggCount: 250000,
                        commentCount: 4000,
                        shareCount: 12000,
                        coverUrl: 'https://placehold.co/300x533/1E293B/FFF?text=Video+Cover+1',
                        webVideoUrl: 'https://tiktok.com/@tiktokcreator/video/1',
                        videoMeta: {
                            downloadAddr: 'https://www.w3schools.com/html/mov_bbb.mp4'
                        }
                    },
                    {
                        id: '2',
                        text: `Невероятные трюки с ${query} #рек`,
                        authorMeta: { name: 'ViralMaster', avatar: 'https://placehold.co/100x100' },
                        playCount: 820000,
                        diggCount: 45000,
                        commentCount: 1200,
                        shareCount: 500,
                        coverUrl: 'https://placehold.co/300x400/1E293B/FFF?text=Video+Cover+2',
                        webVideoUrl: 'https://tiktok.com/@viralmaster/video/2'
                    },
                    {
                        id: '3',
                        text: `Вы не поверите в это ${query} видео!`,
                        authorMeta: { name: 'DailyTrends', avatar: 'https://placehold.co/100x100' },
                        playCount: 50000,
                        diggCount: 3000,
                        commentCount: 150,
                        shareCount: 20,
                        coverUrl: 'https://placehold.co/300x533/1E293B/FFF?text=Video+Cover+3',
                        webVideoUrl: 'https://tiktok.com/@dailytrends/video/3'
                    }
                ]
            });
        }

        // Prepare Apify input based on the chosen TikTok scraper actor.
        let fetchLimit = maxItems || 10;
        if (dateFrom || dateTo) {
            // Overfetch to ensure we have enough items left after date filtering
            fetchLimit = Math.max(fetchLimit * 3, 30);
        }

        const apifyInput = {
            resultsPerPage: fetchLimit,
            maxItems: fetchLimit,
            maxVideos: fetchLimit,
            scrapeDetailPages: false,
            includeComments: false,
            includeRelatedVideos: false,
            includeMusic: false,
            includeAuthor: false,
            downloadVideo: false
        };

        if (type === 'tag') {
            apifyInput.hashtags = [query];
        } else if (type === 'url') {
            // 'query' should be an array of URLs
            apifyInput.postURLs = Array.isArray(query) ? query : [query];
            // When scraping specific URLs, we usually don't need resultsPerPage or we set it high
            apifyInput.resultsPerPage = 100;
        } else {
            apifyInput.searchQueries = [query];
        }

        // Start Apify Run
        const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apifyInput)
        });

        if (!runResponse.ok) {
            let errorMsg = `Apify Run failed with status ${runResponse.status}`;
            const rawBody = await runResponse.text();
            try {
                const errJson = JSON.parse(rawBody);
                if (errJson.error && errJson.error.type === 'not-enough-usage-to-run-paid-actor') {
                    errorMsg = 'Недостаточно лимитов на аккаунте Apify. Пожалуйста, пополните баланс.';
                } else if (errJson.error && errJson.error.message) {
                    errorMsg = errJson.error.message;
                }
            } catch (e) {
                // Not JSON, use raw body
                errorMsg = rawBody;
            }
            return NextResponse.json({ error: errorMsg }, { status: runResponse.status });
        }

        const runData = await runResponse.json();
        const runId = runData.data.id;
        const datasetId = runData.data.defaultDatasetId;

        // Poll for completion (Wait until status is SUCCEEDED)
        let status = runData.data.status;
        let attempts = 0;
        while (status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'ABORTED' && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s between checks
            const statusRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs/${runId}?token=${APIFY_TOKEN}`);
            const statusData = await statusRes.json();
            status = statusData.data.status;
            attempts++;
        }

        if (status !== 'SUCCEEDED') {
            return NextResponse.json({ error: `Scraping did not succeed. Final status: ${status}` }, { status: 500 });
        }

        // Fetch the dataset results
        const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`);
        const datasetItems = await datasetRes.json();

        let finalItems = datasetItems || [];

        // Apply date limits
        if (dateFrom || dateTo) {
            let fromTimestamp = 0;
            let toTimestamp = Infinity;

            if (dateFrom) {
                fromTimestamp = Math.floor(new Date(dateFrom).getTime() / 1000);
            }
            if (dateTo) {
                // To include the whole entire selected day, set the boundary to 1 second before the NEXT day
                const toDateObj = new Date(dateTo);
                toDateObj.setDate(toDateObj.getDate() + 1);
                toTimestamp = Math.floor(toDateObj.getTime() / 1000) - 1;
            }

            finalItems = finalItems.filter(item => {
                const createTime = item.createTime || (item.videoMeta && item.videoMeta.createTime) || (item.video && item.video.createTime);
                if (!createTime) return true; // Keep if we can't determine date

                const timeStr = String(createTime);
                // Handle both seconds (10 chars) and ms (13 chars)
                const timeNum = timeStr.length === 10 ? parseInt(timeStr) : parseInt(timeStr) / 1000;

                return timeNum >= fromTimestamp && timeNum <= toTimestamp;
            });
        }

        // Slice to requested maxItems length
        finalItems = finalItems.slice(0, maxItems || 10);

        console.log(`=== APIFY FETCH (${finalItems.length}/${datasetItems.length} items after filtering) ===`);

        // Save to cache
        cache.set(cacheKey, { timestamp: Date.now(), data: finalItems });

        return NextResponse.json({
            success: true,
            data: finalItems
        });

    } catch (error) {
        console.error('Scrape API Error:', error);
        return NextResponse.json({ error: `System Error: ${error.message}` }, { status: 500 });
    }
}
