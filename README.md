# iamnotai — 한글 AI 티 제거기 v3.0

> AI가 쓴 한국어 텍스트의 번역투·AI 특유 패턴을 탐지·분석하고, 자연스럽게 **윤문**합니다.
> [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai) 분류 체계 기반.

규칙 기반 패턴 탐지 + **Claude AI 심층 분석** + **LLM 윤문(Solar/Gemini)** + 감사 검증 + PDF·공유·히스토리를 한 웹앱에 통합한 버전입니다.

---

## 기능 한눈에

| 기능 | 설명 | 백엔드 |
|------|------|--------|
| 🔍 **분석** | 12카테고리 55+ 패턴 정규식 탐지 + 도메인별 가중치 + AI 티 점수 | (클라이언트) |
| 🤖 **AI 분석** | Claude가 문맥까지 보고 AI 흔적을 심층 분석 | `api/analyze` |
| ✏️ **자동수정** | 규칙 기반 즉시 치환 + diff 뷰 | (클라이언트) |
| ✨ **LLM 윤문** | Solar/Gemini로 의미 보존하며 자연스럽게 재작성 + 3대 지표 | `api/rewrite` |
| 🤖 **감사 검증** | 수정본/윤문본을 Claude가 의미보존·자연스러움·AI제거 채점 | `api/audit` |
| 📄 **PDF** · 🔗 **공유** · 📋 **히스토리** | 보고서 내보내기, URL 공유, 최근 기록 | (클라이언트) |

---

## ✨ LLM 윤문

| 항목 | 설명 |
|------|------|
| **모델** | Solar-Open2-Preview(Upstage) · Gemini(Google) |
| **빠른모드** | 고빈도 5개 카테고리(`A`번역투·`B`피동·`C`관용구·`E`접속사·`K`빈부사)만 주입 |
| **전체모드** | 12개 전체 카테고리 반영 |
| **3대 지표** | de-AI 점수(↓좋음) · 의미보존(↑좋음) · 변경률(자가보고 + 로컬 실측 교차검증) |

**키 출처 (프록시 배포 기준)**

| 모델 | 키 출처 | 과금 |
|------|---------|------|
| **Gemini** | 서버(운영자) 키 — 프록시가 처리, 입력 불필요 | 운영자 |
| **Solar** | 사용자가 ⚙️설정에 본인 키 입력 → 프록시가 통과 호출(저장 안 함) | 사용자 |
| **AI 분석/감사(Claude)** | `ANTHROPIC_API_KEY` 있으면 서버, 없으면 사용자 BYO 키 | 설정에 따라 |

프록시가 없는 환경(로컬 파일·GitHub Pages)에서는 모든 모델이 **BYO-키 직접호출**로 폴백합니다.

---

## 🛡️ 백엔드 / 배포 (Vercel)

```
api/rewrite.js   ← LLM 윤문 (Solar 사용자키 통과 / Gemini 서버키, 프롬프트 서버 조립, CORS 우회, 레이트리밋)
api/health.js    ← 프록시 감지 (프런트가 GET 해서 서버모드/BYO 폴백 자동 전환)
api/analyze.js   ← Claude AI 분석
api/audit.js     ← Claude 감사 검증
```

**배포 절차**
1. 레포를 Vercel에 임포트(Framework = Other, 빌드 설정 불필요).
2. Settings → Environment Variables (`.env.example` 참고):
   - `GEMINI_API_KEY`·`GEMINI_MODEL` — Gemini 윤문(운영자 키)
   - `ANTHROPIC_API_KEY` (선택) — AI 분석/감사를 운영자 키로 공용 제공. 비우면 사용자 BYO.
   - Upstage(Solar)는 서버 키 불필요 — 사용자 입력.
3. 푸시하면 자동 배포. 프로덕션은 기본 공개입니다.

> 로컬: `vercel dev` (`.env.example` → `.env.local`).

---

## Python CLI

```bash
python analyzer.py --file article.txt          # 분석
python analyzer.py --file article.txt --fix     # 자동수정
python analyzer.py --file article.txt --json    # JSON 출력
```

## 라이선스
MIT
