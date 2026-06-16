// iamnotai — LLM 윤문 백엔드 프록시 (Vercel 서버리스 함수, Node 18+)
//
// 프런트(index.html)에서 { provider, text, fast, userKey? } 를 POST 받아
// LLM(Solar/Gemini)을 대신 호출한다.
// - Solar(byok): 사용자 키(userKey)를 통과 호출 — 과금=사용자, 서버 저장 안 함, 업스테이지 CORS 우회.
// - Gemini(server): 서버 env 키(GEMINI_API_KEY)로 호출 — 과금=운영자.
// - 프롬프트를 서버에서 조립해 범용 LLM 대리호출 악용을 막는다.
//
// 필요한 환경변수 (Vercel > Settings > Environment Variables):
//   GEMINI_API_KEY      (Gemini 용)
//   GEMINI_MODEL        (선택, 기본 gemini-2.5-flash)
//   ALLOWED_ORIGIN      (선택, 기본 *  — 공개 시 자기 도메인으로 제한 권장)


// 빠른모드 = 고빈도·고영향 카테고리 (patterns.json 의 fast_mode_categories 와 동일)
const FAST_CATS = ["A", "B", "C", "E", "K"];

// 패턴 가이드 — patterns.json 에서 추출해 인라인(Vercel 함수 번들 파일의존 제거)
const CATEGORIES = [{"id":"A","name":"번역투 표현","items":[{"n":"~를 통해","a":"노력으로 성장한다"},{"n":"~에 있어서","a":"교육에서 중요한 것은"},{"n":"~의 경우","a":"이럴 때는"},{"n":"~에 대한/~에 대해","a":"환경 문제에 관심"},{"n":"~함으로써","a":"노력해서 성과를 낸다"},{"n":"~의 측면에서","a":"경제적으로 보면"},{"n":"~로 인해/~로 인한","a":"기후변화가 부른 피해"},{"n":"~의 중요성","a":"교육이 얼마나 중요한지"},{"n":"~와/과 함께","a":"기술이 발전하면서 변화가"},{"n":"~를 위한/~를 위해","a":"성공 전략"}]},{"id":"B","name":"피동 남용","items":[{"n":"~되어진다 (이중 피동)","a":"제품이 팔린다"},{"n":"~로 여겨진다","a":"이것은 중요한 과제다"},{"n":"~된다고 할 수 있다","a":"성공이 보장된다"},{"n":"~하게 됩니다","a":"더욱 발전합니다"},{"n":"~로 판단된다","a":"효율적인 방법이다"}]},{"id":"C","name":"관용구·클리셰","items":[{"n":"시사하는 바가 크다","a":"이번 연구는 ___을 보여준다"},{"n":"결론적으로","a":"결국"},{"n":"주목할 만하다","a":"눈에 띄는 성과다"},{"n":"간과할 수 없다","a":"이 문제를 놓치면 안 된다"},{"n":"새로운 패러다임","a":"새로운 방향을 제시한다"},{"n":"심도 있는 논의","a":"깊이 따져봐야 한다"},{"n":"지속적인 노력이 필요하다","a":"계속 노력해야 한다"},{"n":"핵심 역량","a":"가장 중요한 능력"},{"n":"상생·시너지","a":"함께 커가는"},{"n":"미래 지향적","a":"앞을 내다보면"}]},{"id":"D","name":"기계적 병렬","items":[{"n":"첫째/둘째/셋째 나열","a":"글의 흐름에 맞춰 자연스럽게 연결"},{"n":"또한/그리고/더불어 연속","a":"문장을 직접 연결하거나 단락을 나눔"},{"n":"~뿐만 아니라 ~도","a":"효율적이고 효과적이다"},{"n":"한편으로는~다른 한편으로는","a":"기회이자 위기다"}]},{"id":"E","name":"접속사 남발","items":[{"n":"따라서 연발","a":"그러니"},{"n":"이에 따라","a":"그래서"},{"n":"그러므로","a":"그래서"},{"n":"이러한 맥락에서","a":"이런 점에서"},{"n":"종합적으로 보면","a":"전반적으로"}]},{"id":"F","name":"리듬 균일성","items":[{"n":"문장 길이 균일 (30±5자 반복)","a":"짧은 문장과 긴 문장을 섞어 리듬을 만들기"},{"n":"~습니다 말투 연속 5회+","a":"합니다/한다/해요 등을 섞어 변화를 주기"}]},{"id":"G","name":"이모지 남용","items":[{"n":"문장 시작 이모지","a":"이모지 없이 내용으로 승부"},{"n":"연속 이모지 3개+","a":"이모지 1개 이하로 절제"}]},{"id":"H","name":"영어 혼용","items":[{"n":"한글 문장 내 영어 단어 삽입","a":"이 방식이 효과적이다"},{"n":"스팬글리시 (영어 어미 한국어화)","a":"인맥을 쌓아"}]},{"id":"I","name":"과도한 단정","items":[{"n":"~임이 분명하다","a":"성공할 것이다"},{"n":"~에 틀림없다","a":"최선의 선택일 것이다"},{"n":"반드시 ~해야 한다 (과용)","a":"변화가 필요하다"},{"n":"누구나 알듯이/주지하듯이","a":"이미 널리 알려진"}]},{"id":"J","name":"격식체 과잉","items":[{"n":"~하겠습니다 반복","a":"설명합니다"},{"n":"~에 대해 말씀드리자면","a":"이 문제는"},{"n":"~를 살펴보도록 하겠습니다","a":"살펴보겠습니다"}]},{"id":"K","name":"빈 부사·강조어","items":[{"n":"매우/상당히/굉장히","a":"왜 중요한지 구체적으로 서술"},{"n":"다양한/여러 가지","a":"구체적으로 어떤 노력인지 서술"},{"n":"더욱더/한층 더","a":"더 노력해야 한다"}]},{"id":"L","name":"구조적 AI 신호","items":[{"n":"마크다운 제목 남용 (일반 글에서)","a":"일반 문단으로 자연스럽게 전환"},{"n":"불릿 포인트 과용","a":"산문으로 풀어 쓰거나 진짜 목록일 때만 사용"},{"n":"물음표로 시작하는 소제목","a":"직접 서술로 들어가기"},{"n":"글머리 고유명사 반복 나열","a":"필요한 것만 선택해 서술"}]}];

function buildGuide(fast) {
  const cats = CATEGORIES.filter((c) => !fast || FAST_CATS.includes(c.id));
  return cats
    .map((c) => `[${c.name}] ` + c.items.map((it) => `「${it.n}」→ ${it.a}`).join("; "))
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

// byok(bring-your-own-key) = true 면 사용자가 보낸 키(body.userKey)를 쓰고(과금=사용자),
// false 면 서버 env 키를 쓴다(과금=운영자).
const PROVIDERS = {
  solar: { type: "openai", endpoint: "https://api.upstage.ai/v1/chat/completions", byok: true },
  gemini: { type: "gemini", keyEnv: "GEMINI_API_KEY", byok: false },
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

    let key;
    if (p.byok) {
      key = body.userKey;
      if (!key || !String(key).trim()) return res.status(400).json({ error: "이 모델은 본인 API 키가 필요합니다. (userKey 누락)" });
    } else {
      key = process.env[p.keyEnv];
      if (!key) return res.status(500).json({ error: `${p.keyEnv} 가 설정되지 않았습니다.` });
    }

    const system = buildSystem(!!fast);
    let content = "";

    if (p.type === "openai") {
      const model = (p.byok ? body.userModel : process.env.UPSTAGE_MODEL) || "solar-open2-preview";
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
