// Vercel Serverless Function — 감사 에이전트 (수정본 검증)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { original, fixed, apiKey } = req.body || {};
  if (!original?.trim() || !fixed?.trim()) return res.status(400).json({ error: '원문과 수정본이 필요합니다' });

  const key = process.env.ANTHROPIC_API_KEY || apiKey;
  if (!key) return res.status(400).json({ error: 'API 키가 필요합니다' });

  const prompt = `당신은 한국어 문체 감사 전문가입니다. 원문과 수정본을 비교해서 수정이 적절했는지 검증해주세요.

[원문]
"""
${original.slice(0, 1500)}
"""

[수정본]
"""
${fixed.slice(0, 1500)}
"""

검증 기준:
1. 의미 보존: 원문의 핵심 내용이 그대로 유지됐는가?
2. 자연스러움: 수정본이 자연스러운 한국어인가?
3. AI 냄새 잔존: 수정 후에도 AI 티가 남아있지 않은가?
4. 과잉 수정: 필요 없는 부분까지 수정하진 않았는가?

다음 JSON 형식으로만 응답하세요:
{
  "pass": <true|false, 전체 통과 여부>,
  "score": <0~100, 수정 품질 점수>,
  "meaning_preserved": <true|false>,
  "natural": <true|false>,
  "ai_removed": <true|false>,
  "issues": ["<문제점 1>", "<문제점 2>"],
  "improvements": ["<잘된 수정 1>", "<잘된 수정 2>"],
  "verdict": "<한 줄 총평>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API 오류' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI 응답 파싱 실패' });

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ ok: true, result });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
