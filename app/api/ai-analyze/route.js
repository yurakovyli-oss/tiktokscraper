import { NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-2.0-flash-001';

const PROMPTS = {
    summary: (videoText, transcript, metrics) => `Ты — аналитик TikTok контента. Проанализируй это видео и напиши краткую, но ёмкую суть на русском языке (3-5 предложений).

Описание видео: ${videoText || 'Нет описания'}
${transcript ? `Транскрипция: ${transcript}` : ''}
Метрики: ${metrics.plays} просмотров, ${metrics.likes} лайков, ER: ${metrics.er}%

Объясни:
1. О чём это видео
2. Почему оно зашло аудитории (на основе метрик и содержания)
3. Какой ключевой посыл или эмоция

Отвечай кратко, по делу, без вступлений.`,

    ideas: (videoText, transcript, metrics) => `Ты — креативный продюсер TikTok. На основе этого успешного видео придумай 5 ИДЕЙ для НОВЫХ похожих видео.

Описание видео: ${videoText || 'Нет описания'}
${transcript ? `Транскрипция: ${transcript}` : ''}
Метрики: ${metrics.plays} просмотров, ${metrics.likes} лайков, ER: ${metrics.er}%

На каждую идею ответь в формате:
🎯 **Идея:** [Название/концепция]
📋 **Формат:** [Влог/Скетч/Обучение/Подборка/и т.д., длина]
💡 **Зачем:** [Почему это сработает]

Придумай разнообразные идеи. Пиши на русском языке. Без вступлений, сразу список.`,

    hook: (videoText, transcript, metrics) => `Ты — эксперт по вирусным видео в TikTok. Придумай 5 вариантов ХУКА (первые 3 секунды видео) для видео похожего на это.

Описание видео: ${videoText || 'Нет описания'}
${transcript ? `Транскрипция: ${transcript}` : ''}
Метрики: ${metrics.plays} просмотров, ${metrics.likes} лайков, ER: ${metrics.er}%

Для каждого хука используй формат:
🔥 **"[Первая фраза или действие]"**
_Почему цепляет: [короткое пояснение]_

Варианты должны быть разные по стилю: провокация, вопрос, шок, интрига, вызов.
Пиши на русском языке. Без вступлений, сразу варианты.`
};

export async function POST(request) {
    try {
        if (!OPENROUTER_API_KEY) {
            return NextResponse.json({ error: 'OpenRouter API ключ не настроен' }, { status: 500 });
        }

        const { type, videoText, transcript, metrics } = await request.json();

        if (!type || !PROMPTS[type]) {
            return NextResponse.json({ error: 'Неверный тип анализа. Допустимые: summary, ideas, hook' }, { status: 400 });
        }

        const safeMetrics = {
            plays: metrics?.plays || 0,
            likes: metrics?.likes || 0,
            er: metrics?.er || '0',
        };

        const prompt = PROMPTS[type](videoText, transcript, safeMetrics);

        const temperature = type === 'summary' ? 0.3 : 0.8;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://tiktok-scraper.app',
                'X-Title': 'TikTok Scraper AI',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: 1500,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('OpenRouter API error:', response.status, errBody);
            return NextResponse.json({ error: `Ошибка OpenRouter: ${response.status}` }, { status: 502 });
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || '';

        if (!result) {
            return NextResponse.json({ error: 'Пустой ответ от AI-модели' }, { status: 502 });
        }

        return NextResponse.json({ result, model: data.model || MODEL });
    } catch (err) {
        console.error('AI analyze error:', err);
        return NextResponse.json({ error: `Внутренняя ошибка: ${err.message}` }, { status: 500 });
    }
}
