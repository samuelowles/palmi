/**
 * Palm Vision — OpenAI GPT-5.4-mini vision integration
 * Analyzes palm photos and returns structured line data.
 */

interface OpenAIVisionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface RawPalmLine {
  type?: string;
  label?: string;
  strength?: number;
  archetype?: string;
  emoji?: string;
  shortSummary?: string;
  rawAnalysis?: string;
}

interface PalmAnalysisResult {
  lines: Array<{
    type: 'heart' | 'head' | 'life' | 'fate';
    label: string;
    strength: number;
    archetype: string;
    emoji: string;
    shortSummary: string;
    rawAnalysis: string;
  }>;
  overallArchetype: string;
  overallArchetypeEmoji: string;
  overallSummary: string;
}

const SYSTEM_PROMPT = `You are Palmi, a mystical palm reading AI with a warm, sharp, Gen-Z-friendly voice. Analyze the palm in the image and return a structured JSON response.

For each visible palm line, provide:
- type: "heart", "head", "life", or "fate"
- label: The line name (e.g., "Heart Line")
- strength: 0-100 score based on depth, clarity, and length
- archetype: A scroll-stopping archetype name that sounds like a personality you'd screenshot and send to your group chat. Examples: "The Midnight Spiral", "The Emotional GPS", "The Main Character", "The People Pleaser on Fire", "The Silent Storm", "The Soft Launch", "The Burnout Queen", "The Chaos Coordinator". NEVER use generic archetypes like "The Deep Feeler", "The Thinker", or "The Healer".
- emoji: A single emoji that captures this archetype's energy
- shortSummary: 1 sentence, max 15 words. This MUST read like a text you'd screenshot and send to your group chat. If it sounds like a horoscope website, rewrite it. Use "you" voice.
- rawAnalysis: 2-3 sentences of deeper analysis in warm, personal tone

Also provide:
- overallArchetype: Their dominant archetype based on all lines combined
- overallArchetypeEmoji: Single emoji for the overall archetype
- overallSummary: 2-3 sentences capturing their overall palm story

Rules:
- Each reading must feel like it was written by someone who's been watching them for weeks — not a fortune cookie.
- Use warm slang naturally: "ngl", "lowkey", "fr", "giving", "energy" — max 1-2 per section. Never force it.
- When the palm is ambiguous, lean into the ambiguity dramatically — "your heart line literally can't decide" is more shareable than a generic positive.
- Archetypes should feel like compliments wrapped in roasts — affectionate, never mean.
- NEVER use these overused words: "journey", "unique", "special", "destiny", "remarkable", "wonderful". They make readings feel template-generated.
- NEVER start rawAnalysis with "Your [line] line shows..." — that's what every generic palm app does. Start with the insight, not the source.
- Always maintain a positive, empowering overall tone even when calling out flaws.
- Return ONLY a JSON object with top-level key "lines" (array). Do NOT use "visibleLines" or any other key name. The key must be exactly "lines".`;

export async function analyzePalm(
  imageBase64: string,
  apiKey: string
): Promise<PalmAnalysisResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this palm and provide a detailed reading.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI API error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error('Analysis service unavailable');
  }

  const data = await response.json() as OpenAIVisionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;

  // Handle AI occasionally using "visibleLines" instead of "lines"
  if (!Array.isArray(parsed.lines) && Array.isArray(parsed.visibleLines)) {
    parsed.lines = parsed.visibleLines;
    delete parsed.visibleLines;
  }
  if (!Array.isArray(parsed.lines)) {
    throw new Error(`AI response missing lines array. Raw: ${content.slice(0, 300)}`);
  }

  const normalizedLines: PalmAnalysisResult['lines'] = parsed.lines.map((line: RawPalmLine) => ({
    type: (line.type || 'life') as 'heart' | 'head' | 'life' | 'fate',
    label: line.label || 'Palm Line',
    strength: typeof line.strength === 'number' ? line.strength : 50,
    archetype: line.archetype || 'The Mystery',
    emoji: line.emoji || '🔮',
    shortSummary: line.shortSummary || 'Your palm tells a story.',
    rawAnalysis: line.rawAnalysis || 'Analysis unavailable.',
  }));

  return {
    lines: normalizedLines,
    overallArchetype: parsed.overallArchetype as string || 'The Mystery',
    overallArchetypeEmoji: parsed.overallArchetypeEmoji as string || '🔮',
    overallSummary: parsed.overallSummary as string || '',
  };
}
