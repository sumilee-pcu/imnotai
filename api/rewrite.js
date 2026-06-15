// iamnotai — LLM 윤문 백엔드 프록시 (Vercel 서버리스 함수, Node 18+)
//
// 프런트(index.html)에서 { provider, text, fast } 를 POST 받아
// 서버에 보관된 API 키로 Upstage/Anthropic 을 대신 호출한다.
// - 키가 브라우저로 노출되지 않는다.
// - 업스테이지의 브라우저 CORS 제약을 우회한다.
// - 프롬프트를 서버에서 조립해, 범용 LLM 대리호출 악용을 막는다.
//
// 필요한 환경변수 (Vercel > Settings > Environment Variables):
//   ANTHROPIC_API_KEY   (Opus/Sonnet 용)
//   UPSTAGE_API_KEY     (Solar 용)
//   UPSTAGE_MODEL       (선택, 기본 solar-open2-preview)
//   ALLOWED_ORIGIN      (선택, 기본 *  — 공개 시 자기 도메인으로 제한 권장)

const fs = require("fs");
const path = require("path");

// 빠른모드 = 고빈도·고영향 카테고리 (patterns.json 의 fast_mode_categories 와 동일)
const FAST_CATS = ["A", "B", "C", "E", "K"];

let _patterns = null;
function loadPatterns() {
  if (_patterns) return _patterns;
  const p = path.join(process.cwd(), "patterns.json");
  _patterns = JSON.parse(fs.readFileSync(p, "utf8"));
  return _patterns;
}

function buildGuide(fast) {
  const db = loadPatterns();
  const cats = db.categories.filter((c) => !fast || FAST_CATS.includes(c.id));
  return cats
    .map((c) => {
      const items = c.patterns
        .map((pt) => `「${pt.name}」→ ${(pt.alternatives && pt.alternatives[0]) || "자연스럽게"}`)
        .join("; ");
      return `[${c.name}] ${items}`;
    })
    .join("\n");
}

function buildSystem(fast) {
  const guide = buildGuide(fast);
  return `너는 한국어 문체 교정 전문가다. 입력 글을 "AI가 쓴 티"가 나지 않는 자연스러운 한국어로 윤문한다.
절대 규칙:
- 의미·정보·주장·숫자·고유명사·인용을 추가/삭제/왜곡하지 않는다(의미 100% 보존).
- 문단 수와 순서를 유지한다. 원문에 없던 마크다운/이모지/불릿을 새로 만들지 않는다.
- 아래 AI 특유 패턴을 자연스러운 표현으로 바꾼다:
${guide}
출력은 아래 JSON 객체 하나만. 코드펜스(\`\`\`)나 설명 문장을 절대 붙이지 마라.
{"rewritten":"윤문된 전체 글","de_ai_score":정수 0~100(낮을수록 AI티 없음),"meaning_preservation":정수 0~100(높을수록 원문 의미 보존),"change_rate":정수 0~100(원문 대비 바뀐 분량 %),"notes":"핵심 수정 요약 1~2문장"}`;
}

const PROVIDERS = {
  solar: { type: "openai", endpoint: "https://api.upstage.ai/v1/chat/completions", keyEnv: "UPSTAGE_API_KEY" },
  gemini: { type: "gemini", keyEnv: "GEMINI_API_KEY" },
};

function extractJSON(s) {
  if (!s) throw new Error("빈 응답");
  let t = String(s).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

// ── 베스트-에포트 레이트리밋 (인스턴스 메모리, 콜드스타트 시 초기화) ──
// 실제 공개 서비스에서는 Upstash/Vercel KV 등 외부 저장소로 교체 권장.
const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 20;
const _hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  _hits.set(ip, arr);
  return arr.length > RL_MAX;
}

module.exports = async (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST 만 허용됩니다." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { provider, text, fast } = body;
    const p = PROVIDERS[provider];
    if (!p) return res.status(400).json({ error: "알 수 없는 모델입니다." });
    if (!text || !String(text).trim()) return res.status(400).json({ error: "text 가 비어 있습니다." });
    if (String(text).length > 8000) return res.status(413).json({ error: "8000자 이내로 입력하세요." });

    const key = process.env[p.keyEnv];
    if (!key) return res.status(500).json({ error: `${p.keyEnv} 가 설정되지 않았습니다.` });

    const system = buildSystem(!!fast);
    let content = "";

    if (p.type === "openai") {
      const model = process.env.UPSTAGE_MODEL || "solar-open2-preview";
      const r = await fetch(p.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: text }], temperature: 0.7 }),
      });
      if (!r.ok) return res.status(502).json({ error: "Upstage API " + r.status, detail: (await r.text()).slice(0, 300) });
      const j = await r.json();
      content = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : "";
    } else {
      // Gemini (Google Generative Language API). 키는 헤더로 전달(URL 노출 금지).
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
        }),
      });
      if (!r.ok) return res.status(502).json({ error: "Gemini API " + r.status, detail: (await r.text()).slice(0, 300) });
      const j = await r.json();
      const cand = j.candidates && j.candidates[0];
      content = cand && cand.content && cand.content.parts && cand.content.parts[0] ? cand.content.parts[0].text : "";
    }

    const data = extractJSON(content);
    if (!data || !data.rewritten) return res.status(502).json({ error: "모델 응답을 파싱하지 못했습니다." });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: "서버 오류", detail: String((e && e.message) || e) });
  }
};

// 테스트용으로 내부 함수 노출 (Vercel 런타임에는 영향 없음)
module.exports._internal = { buildGuide, buildSystem, extractJSON, FAST_CATS };
