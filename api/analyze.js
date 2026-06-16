// Vercel Serverless Function — Claude AI 분석 프록시
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, domain = 'general', apiKey } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: '텍스트가 없습니다' });

  const key = process.env.ANTHROPIC_API_KEY || apiKey;
  if (!key) return res.status(400).json({ error: 'Anthropic API 키가 필요합니다. Vercel 환경 변수 ANTHROPIC_API_KEY를 설정하거나 앱 설정에서 입력하세요.' });

  const domainGuide = {
    academic: '학술 논문·보고서 기준. 격식체는 허용하되 번역투·피동 남용은 엄격히 검출.',
    business: '비즈니스 문서 기준. 지나친 관용구·클리셰 위주로 검출.',
    blog: '블로그·칼럼 기준. 자연스러운 구어체와의 차이를 중점 검출.',
    sns: 'SNS·짧은 글 기준. 이모지 남용·리듬 균일성 위주로 검출.',
    general: '일반 기준. 모든 카테고리 균등 검출.',
  };

  const prompt = `당신은 한국어 문체 전문가입니다. 아래 텍스트에서 AI가 생성한 흔적(번역투, AI 특유 관용구, 피동 남용, 기계적 병렬 등)을 분석해주세요.

도메인: ${domainGuide[domain] || domainGuide.general}

분석할 텍스트:
"""
${text.slice(0, 3000)}
"""

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "ai_score": <0~100 정수, 0=완전히 자연스러움, 100=AI 냄새 매우 강함>,
  "verdict": "<한 줄 총평>",
  "issues": [
    {
      "text": "<문제가 되는 원문 구절 (정확히)>",
      "category": "<카테고리: 번역투|피동남용|관용구|기계적병렬|접속사남발|리듬균일|격식체과잉|영어혼용|과도한단정|빈부사|AI구조>",
      "reason": "<왜 AI 티가 나는지 한 문장으로>",
      "suggestion": "<자연스러운 대안 표현>"
    }
  ],
  "strengths": ["<자연스러운 부분 1>", "<자연스러운 부분 2>"],
  "summary": "<전체 총평 2~3문장>"
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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API 오류' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';

    // JSON 파싱
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI 응답 파싱 실패', raw });

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ ok: true, result });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
