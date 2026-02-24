import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        let { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // If it's a TikTok web URL (not a direct CDN video link), use TikWM API to extract the raw mp4
        if (url.includes('tiktok.com') && !url.includes('.mp4') && !url.includes('tiktokcdn.com')) {
            const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
            if (tikwmRes.ok) {
                const tikwmData = await tikwmRes.json();
                if (tikwmData?.data?.play) {
                    url = tikwmData.data.play; // Replace the original URL with the direct MP4 URL
                } else {
                    return NextResponse.json({ error: 'Could not extract raw video URL from TikTok webpage', details: JSON.stringify(tikwmData) }, { status: 400 });
                }
            } else {
                return NextResponse.json({ error: 'TikWM extraction API failed', details: tikwmRes.statusText }, { status: 500 });
            }
        }

        // Fetch the video from the remote Server
        const videoResponse = await fetch(url, {
            headers: {
                // Some servers require a user-agent to return the video
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://www.tiktok.com/'
            }
        });

        if (!videoResponse.ok) {
            const errText = await videoResponse.text();
            throw new Error(`Failed to fetch video: ${videoResponse.status} ${videoResponse.statusText}. Response: ${errText.substring(0, 200)}`);
        }

        const arrayBuffer = await videoResponse.arrayBuffer();

        return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="tiktok-video-${Date.now()}.mp4"`,
                'Content-Length': arrayBuffer.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.json({ error: 'Failed to proxy request', details: error.message }, { status: 500 });
    }
}
