# iamnotai — 한글 AI 티 제거기 v2.0

> AI가 생성한 한국어 텍스트에서 번역투·AI 특유 패턴을 탐지하고 수정합니다.
> [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai) 원본 분류 체계 기반, 향상된 기능 추가

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **패턴 탐지** | 12카테고리 × 55+ 패턴을 정규식으로 실시간 탐지 |
| **하이라이트** | 카테고리별 색상으로 문장 내 문제 구간 표시 |
| **AI 티 점수** | 0~100 점수로 AI 냄새 강도 시각화 |
| **수정 제안** | 각 패턴별 대안 표현 제시 |
| **자동 수정** | 규칙 기반 자동 변환 (--fix 옵션) |
| **diff 뷰** | 원문 ↔ 수정본 변경 내역 시각화 |

---

## 파일 구성

```
iamnotai/
├── index.html      ← 브라우저 웹앱 (외부 의존성 없음, 오프라인 작동)
├── analyzer.py     ← Python CLI 도구
├── patterns.json   ← 패턴 데이터베이스
└── README.md
```

---

## 웹앱 사용법

`index.html`을 브라우저로 열면 바로 사용 가능합니다.

| 단축키 | 기능 |
|--------|------|
| `Ctrl/⌘ + Enter` | 분석 |
| `Ctrl/⌘ + Shift + F` | 자동 수정 |

---

## Python CLI 사용법

```bash
# 직접 텍스트 분석
python analyzer.py "결론적으로 시사하는 바가 크다"

# 파일 분석
python analyzer.py --file article.txt

# 자동 수정
python analyzer.py --file article.txt --fix

# 수정 결과 저장
python analyzer.py --file article.txt --fix --out result.txt

# JSON 출력 (파이프라인용)
python analyzer.py --file article.txt --json
```

---

## 12대 카테고리

| ID | 카테고리 | 예시 패턴 |
|----|----------|-----------|
| A | 번역투 표현 | ~를 통해, ~에 있어서, ~함으로써 |
| B | 피동 남용 | 되어진다, 하게 됩니다 |
| C | 관용구·클리셰 | 시사하는 바가 크다, 새로운 패러다임 |
| D | 기계적 병렬 | 첫째/둘째/셋째, 뿐만 아니라 |
| E | 접속사 남발 | 이러한 맥락에서, 종합적으로 보면 |
| F | 리듬 균일 | 비슷한 길이 문장 반복 |
| G | 이모지 남용 | 문단마다 이모지 |
| H | 영어 혼용 | stakeholder를, networking을 |
| I | 과도한 단정 | 임이 분명하다, 틀림없다 |
| J | 격식체 과잉 | 말씀드리자면, 살펴보도록 하겠습니다 |
| K | 빈 부사 | 매우, 상당히, 더욱더 |
| L | AI 구조 신호 | 마크다운 제목, 불릿 포인트 과용 |

---

## 원본 프로젝트

- **원본**: [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai)
- **이 리포**: 웹앱 + Python CLI + 확장 패턴 DB 추가

## 라이선스

MIT
