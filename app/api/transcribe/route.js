import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import Groq from 'groq-sdk';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Initialize Groq client
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Set up ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const fetchWithRetry = async (url, options = {}, retries = 3, backoff = 1500) => {
    for (let i = 0; i < retries; i++) {
        try {
            // Add a timeout signal to the fetch
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 15000); // 15 second timeout per attempt

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(id);
            return response;
        } catch (error) {
            console.warn(`[Network Retry] Attempt ${i + 1} failed for ${url.substring(0, 50)}...: ${error.message}`);
            if (i === retries - 1) throw error; // If last retry, throw the error
            await new Promise(res => setTimeout(res, backoff * (i + 1))); // Exponential backoff
        }
    }
};

export async function POST(req) {
    if (!groq) {
        return NextResponse.json(
            { error: 'Groq API Key is not configured' },
            { status: 500 }
        );
    }

    const { videoUrl, webVideoUrl } = await req.json();

    if (!videoUrl && !webVideoUrl) {
        return NextResponse.json(
            { error: 'Video URL is required' },
            { status: 400 }
        );
    }

    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    const tempAudioPath = path.join(tempDir, `audio_${Date.now()}.m4a`);

    try {
        // Resolve the actual download URL: try CDN first, fall back to TikWM if CDN fails
        let resolvedUrl = videoUrl;

        const isCdnUrl = resolvedUrl && (resolvedUrl.includes('tiktokcdn') || resolvedUrl.includes('tiktok.com/video'));

        if (!resolvedUrl || !isCdnUrl) {
            // No CDN URL — extract directly via TikWM using the page URL
            const pageUrl = webVideoUrl || resolvedUrl;
            console.log(`[Transcription] No CDN URL, extracting via TikWM from: ${pageUrl}`);
            const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}`);
            if (tikwmRes.ok) {
                const tikwmData = await tikwmRes.json();
                if (tikwmData?.data?.play) {
                    resolvedUrl = tikwmData.data.play;
                    console.log(`[Transcription] TikWM resolved URL successfully`);
                }
            }
        }

        if (!resolvedUrl) {
            throw new Error('Не удалось получить ссылку для скачивания видео');
        }

        console.log(`[Transcription] Downloading video from: ${resolvedUrl.substring(0, 80)}...`);

        // 1. Download the video file with automatic retries
        let response = await fetchWithRetry(resolvedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.tiktok.com/',
                'Accept': 'video/mp4,video/*,*/*',
                'Range': 'bytes=0-'
            }
        });

        // CDN URL returned error — try TikWM as fallback
        if (!response.ok && webVideoUrl) {
            console.log(`[Transcription] CDN returned ${response.status}, falling back to TikWM...`);
            try {
                const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(webVideoUrl)}`);
                if (tikwmRes.ok) {
                    const tikwmData = await tikwmRes.json();
                    if (tikwmData?.data?.play) {
                        resolvedUrl = tikwmData.data.play;
                        response = await fetchWithRetry(resolvedUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Referer': 'https://www.tiktok.com/'
                            }
                        });
                        console.log(`[Transcription] TikWM fallback response: ${response.status}`);
                    }
                }
            } catch (tikwmErr) {
                console.warn(`[Transcription] TikWM fallback failed: ${tikwmErr.message}`);
            }
        }

        if (!response.ok) {
            throw new Error(`Не удалось скачать видео: ${response.status} ${response.statusText}`);
        }

        const fileStream = fs.createWriteStream(tempVideoPath);
        await pipeline(response.body, fileStream);
        console.log(`[Transcription] Video downloaded to: ${tempVideoPath}`);

        // 2. Extract Audio (this drastically reduces the payload size sent to Groq)
        console.log(`[Transcription] Extracting audio...`);
        await new Promise((resolve, reject) => {
            ffmpeg(tempVideoPath)
                .noVideo()
                .audioCodec('aac')
                .save(tempAudioPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
        console.log(`[Transcription] Audio extracted to: ${tempAudioPath}`);

        // 3. Send audio to Groq Whisper API
        console.log(`[Transcription] Sending to Groq Whisper API...`);
        let transcription = { text: '' };
        let transcriptionAttempts = 0;
        const maxTranscriptionAttempts = 3;

        while (transcriptionAttempts < maxTranscriptionAttempts) {
            try {
                // We need to re-create the read stream on every retry because it's consumed
                const audioStream = fs.createReadStream(tempAudioPath);
                transcription = await groq.audio.transcriptions.create({
                    file: audioStream,
                    model: 'whisper-large-v3-turbo', // Turbo is generally less prone to hallucinations and faster
                    response_format: 'verbose_json', // Returns segments with timestamps
                    temperature: 0.0 // Keep deterministic
                });
                break; // If successful, exit the retry loop
            } catch (err) {
                transcriptionAttempts++;
                console.warn(`[Groq Retry] Attempt ${transcriptionAttempts} failed: ${err.message}`);
                if (transcriptionAttempts >= maxTranscriptionAttempts) throw err;
                await new Promise(res => setTimeout(res, 2000 * transcriptionAttempts)); // Backoff 2s, 4s
            }
        }

        let resultText = transcription.text.trim();

        const lowerText = resultText.toLowerCase();

        // Remove things inside brackets like [Музыка] or (Вздох)
        const cleanedText = lowerText.replace(/\[.*?\]|\(.*?\)|【.*?】/g, '').trim();

        // 1. Severe hallucinations that void the transcript regardless of length (due to infinite repetition bugs)
        const severeHallucinations = [
            "dimatorzok",
            "dima torzok",
            "amara.org",
            "субтитры создавал",
            "субтитры сделал",
            "редактор субтитров",
            "продолжение следует",
            "terima kasih"
        ];

        // 2. Minor/Common end-of-video hallucinations that only apply if the video is very short
        const minorHallucinations = [
            "thank you",
            "thanks for watching",
            "subscribe",
            "telah menonton",
            "спасибо за просмотр",
            "подписывайтесь"
        ];

        let isHallucination = false;

        // Condition A: Contains a known severe hallucination spam word
        if (severeHallucinations.some(h => lowerText.includes(h))) {
            isHallucination = true;
        }
        // Condition B: Text consists entirely of brackets/punctuation (e.g., "[смех]")
        else if (cleanedText.length === 0 && lowerText.length > 0) {
            isHallucination = true;
        }
        // Condition C: Contains generic closing words but no other substantial content
        else if (minorHallucinations.some(h => lowerText.includes(h)) && cleanedText.length < 50) {
            isHallucination = true;
        }

        if (isHallucination) {
            console.log(`[Transcription] Filtered hallucination: "${resultText}"`);
            resultText = "— (Без голоса)";
        }

        if (!resultText) {
            resultText = "— (Без голоса)";
        }

        console.log(`[Transcription] Final Result:`, resultText);

        // Build clean segments array (only if transcription succeeded)
        const segments = (isHallucination || !transcription.segments)
            ? []
            : transcription.segments.map(s => ({
                start: Math.round(s.start),
                end: Math.round(s.end),
                text: s.text.trim()
            }));

        return NextResponse.json({
            success: true,
            text: resultText,
            segments,
            language: transcription.language || null
        });

    } catch (error) {
        console.error('[Transcription Error]:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to process transcription' },
            { status: 500 }
        );
    } finally {
        // 4. Clean up temporary files
        try {
            if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
            if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
            console.log(`[Transcription] Temporary files cleaned up.`);
        } catch (cleanupError) {
            console.error('[Transcription Error] Failed to clean up temp files:', cleanupError);
        }
    }
}
