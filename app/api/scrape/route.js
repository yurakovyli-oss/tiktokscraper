import { NextResponse } from 'next/server';

export const maxDuration = 300; // Allow Vercel to run up to 5 minutes (if plan supports) to prevent 504 Gateway errors

// In-memory cache to save on Apify requests
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

export async function POST(request) {
    try {
        const body = await request.json();
        const { query, type = 'keyword', maxItems = 10, forceRefresh = false, keyId } = body;

        if (!query) {
            return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
        }

        const cacheKey = `${type}:${JSON.stringify(query)}:${maxItems}`;

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

        const ACTOR_ID = process.env.APIFY_ACTOR_ID || 'apidojo/tiktok-scraper'; // Default to apidojo scraper
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

        // Safety cap to prevent user from accidentally burning their entire balance with an extra zero (e.g. 50000)
        if (fetchLimit > 1000) {
            fetchLimit = 1000;
        }

        const apifyInput = {
            resultsPerPage: fetchLimit,
            maxItems: fetchLimit,
            shouldDownloadVideos: false,
            shouldDownloadCovers: false,
            shouldDownloadSubtitles: false,
            shouldDownloadSlideshowImages: false
        };

        if (type === 'tag') {
            apifyInput.hashtags = query.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean);
        } else if (type === 'url') {
            // 'query' should be an array of URLs
            apifyInput.startUrls = Array.isArray(query) ? query.map(q => ({ url: q })) : [{ url: query }];
            // When scraping specific URLs, we usually don't need resultsPerPage or we set it high
            apifyInput.resultsPerPage = 100;
        } else {
            // apidojo often uses `searchQueries`, but we also add `keywords` as some actors prefer it
            const queries = query.split(',').map(q => q.trim()).filter(Boolean);
            apifyInput.searchQueries = queries;
            apifyInput.keywords = queries; // specific to some apidojo versions
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
        // 100 attempts * 3s = 300s timeout limit (matching Vercel maxDuration)
        while (status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'ABORTED' && attempts < 100) {
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

        // Slice to requested maxItems length just in case
        finalItems = finalItems.slice(0, maxItems || 10);

        // Normalize items so they map predictably to UI regardless of the used actor's output schema
        finalItems = finalItems.map(item => {
            const authorName = item.author?.uniqueId || item.authorMeta?.name || item.authorMeta?.nickName || 'user';
            const vidId = item.id || item.video?.id || item.postId;
            return {
                ...item,
                id: vidId,
                text: item.desc || item.text || item.title || '',
                playCount: item.playCount || item.stats?.playCount || item.video?.playCount || item.statsV2?.playCount || 0,
                diggCount: item.diggCount || item.stats?.diggCount || item.video?.diggCount || item.statsV2?.diggCount || 0,
                commentCount: item.commentCount || item.stats?.commentCount || item.video?.commentCount || item.statsV2?.commentCount || 0,
                shareCount: item.shareCount || item.stats?.shareCount || item.video?.shareCount || item.statsV2?.shareCount || 0,
                collectCount: item.collectCount || item.stats?.collectCount || item.video?.collectCount || item.statsV2?.collectCount || 0,
                webVideoUrl: item.webVideoUrl || item.videoUrl || item.url || `https://www.tiktok.com/@${authorName}/video/${vidId}`,
                authorMeta: item.authorMeta || {
                    name: authorName,
                    nickname: item.author?.nickname || '',
                    avatar: item.author?.avatar || item.author?.avatarLarger || ''
                },
                videoMeta: item.videoMeta || item.video || {
                    coverUrl: item.video?.cover || item.coverUrl || item.imageUrl,
                    downloadAddr: item.video?.downloadAddr || item.videoUrl || item.playAddr
                },
                createTime: item.createTime || item.video?.createTime || item.createdAt
            };
        });

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
