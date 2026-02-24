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

    const { videoUrl } = await req.json();

    if (!videoUrl) {
        return NextResponse.json(
            { error: 'Video URL is required' },
            { status: 400 }
        );
    }

    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    const tempAudioPath = path.join(tempDir, `audio_${Date.now()}.m4a`);

    try {
        console.log(`[Transcription] Downloading video from: ${videoUrl}`);

        // 1. Download the video file with automatic retries
        const response = await fetchWithRetry(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.tiktok.com/',
                'Accept': '*/*, video/mp4, audio/mp4'
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
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
                    prompt: 'Это видео из TikTok. Текст может быть разговорным, сленговым. Пожалуйста, игнорируй тишину и музыку, не придумывай текст, если его нет.',
                    response_format: 'json',
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

        return NextResponse.json({
            success: true,
            text: resultText
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
