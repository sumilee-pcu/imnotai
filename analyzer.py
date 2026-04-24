#!/usr/bin/env python3
"""
iamnotai — 한글 AI 티 제거기 v2.0
AI가 생성한 한국어 텍스트에서 번역투·AI 특유 패턴을 탐지하고
규칙 기반으로 수정합니다.

사용법:
  python analyzer.py "텍스트"
  python analyzer.py --file input.txt
  python analyzer.py --file input.txt --fix
  python analyzer.py --file input.txt --json
  python analyzer.py --file input.txt --fix --out output.txt
"""

import re
import sys
import json
import os
import argparse
import unicodedata
from collections import defaultdict
from typing import Optional

# ───────────────────────────────────────────
#  패턴 DB 로드
# ───────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PATTERNS_FILE = os.path.join(SCRIPT_DIR, "patterns.json")

def load_patterns():
    if not os.path.exists(PATTERNS_FILE):
        print(f"[오류] patterns.json 파일을 찾을 수 없습니다: {PATTERNS_FILE}")
        sys.exit(1)
    with open(PATTERNS_FILE, encoding="utf-8") as f:
        return json.load(f)

# ───────────────────────────────────────────
#  탐지 엔진
# ───────────────────────────────────────────
Match = dict  # { id, category, name, start, end, text, alternatives, severity }

def detect_patterns(text: str, db: dict) -> list[Match]:
    matches = []
    for cat in db["categories"]:
        cat_id = cat["id"]
        cat_name = cat["name"]
        for pat in cat["patterns"]:
            regex = pat.get("regex")
            if not regex:
                continue  # F01처럼 통계 분석이 필요한 경우는 별도 처리
            flags_str = pat.get("flags", "")
            flags = 0
            if "m" in flags_str:
                flags |= re.MULTILINE
            if "u" in flags_str:
                flags |= re.UNICODE
            try:
                for m in re.finditer(regex, text, flags):
                    matches.append({
                        "id": pat["id"],
                        "category": cat_id,
                        "category_name": cat_name,
                        "name": pat["name"],
                        "start": m.start(),
                        "end": m.end(),
                        "text": m.group(),
                        "alternatives": pat.get("alternatives", []),
                        "severity": pat.get("severity", 1),
                        "examples": pat.get("examples", []),
                    })
            except re.error:
                pass

    # 리듬 균일성 분석 (F01)
    sentences = re.split(r"[.。!?！？]\s*", text)
    lengths = [len(s.strip()) for s in sentences if len(s.strip()) > 5]
    if len(lengths) >= 4:
        mean_len = sum(lengths) / len(lengths)
        variance = sum((l - mean_len) ** 2 for l in lengths) / len(lengths)
        if variance < 80 and mean_len > 15:
            matches.append({
                "id": "F01",
                "category": "F",
                "category_name": "리듬 균일성",
                "name": "문장 길이 균일 (리듬 단조로움)",
                "start": 0, "end": len(text),
                "text": f"[문장 {len(lengths)}개 평균 {mean_len:.0f}자, 분산 {variance:.1f}]",
                "alternatives": ["짧은 문장과 긴 문장을 섞어 리듬에 변화를 주세요"],
                "severity": 2,
                "examples": [],
            })

    # 중복 제거 (같은 위치 겹침 방지)
    matches.sort(key=lambda x: (x["start"], -x["severity"]))
    deduped = []
    last_end = -1
    for m in matches:
        if m["start"] >= last_end:
            deduped.append(m)
            last_end = m["end"]
    return deduped

# ───────────────────────────────────────────
#  AI 티 점수 계산 (0~100)
# ───────────────────────────────────────────
def calc_score(text: str, matches: list[Match]) -> int:
    if not text.strip():
        return 0
    words = len(re.findall(r"[가-힣A-Za-z]+", text))
    if words == 0:
        return 0
    weighted = sum(m["severity"] for m in matches)
    # 1000자당 환산
    density = weighted / max(len(text), 1) * 1000
    score = min(100, int(density * 8))
    return score

# ───────────────────────────────────────────
#  규칙 기반 자동 수정
# ───────────────────────────────────────────
SIMPLE_FIXES = [
    # 번역투
    (r"(?:을|를)\s*통해(?:서)?", "으로"),
    (r"에\s*있어서?", "에서"),
    (r"함으로써", "해서"),
    (r"로\s*인해", "때문에"),
    (r"와\s*함께", "와"),
    # 이중 피동
    (r"되어\s*진다", "된다"),
    (r"되어지고", "되고"),
    (r"되어지며", "되며"),
    (r"되어지는", "되는"),
    # 불필요한 피동
    (r"하게\s*됩니다", "합니다"),
    (r"하게\s*되었습니다", "했습니다"),
    (r"하게\s*된다", "한다"),
    # 격식체 간소화
    (r"살펴보도록\s*하겠습니다", "살펴보겠습니다"),
    (r"알아보도록\s*하겠습니다", "알아보겠습니다"),
    # 빈 접속사
    (r"이러한\s*맥락에서", "이런 점에서"),
    (r"종합적으로\s*보면", "전반적으로"),
    (r"결론적으로", "결국"),
    (r"이에\s*따라", "그래서"),
    # 관용구
    (r"새로운\s*패러다임", "새로운 방향"),
    (r"심도\s*있는\s*논의", "깊은 논의"),
    (r"시사하는\s*바가\s*크다", "많은 것을 보여준다"),
    (r"주목할\s*만하다", "눈에 띈다"),
    # 빈 부사
    (r"더욱더\s+", "더 "),
    (r"한층\s*더\s+", "더 "),
]

def auto_fix(text: str) -> tuple[str, int]:
    fixed = text
    count = 0
    for pattern, replacement in SIMPLE_FIXES:
        new_text, n = re.subn(pattern, replacement, fixed)
        fixed = new_text
        count += n
    return fixed, count

# ───────────────────────────────────────────
#  콘솔 출력
# ───────────────────────────────────────────
SEVERITY_LABEL = {1: "낮음", 2: "중간", 3: "높음"}
SEVERITY_COLOR = {1: "\033[93m", 2: "\033[33m", 3: "\033[31m"}
RESET = "\033[0m"
BOLD = "\033[1m"
CYAN = "\033[96m"
GREEN = "\033[92m"
GRAY = "\033[90m"

def print_report(text: str, matches: list[Match], score: int, use_color: bool = True):
    def c(code): return code if use_color else ""

    print(f"\n{c(BOLD)}{'─'*60}{c(RESET)}")
    print(f"{c(BOLD)} 🔍 iamnotai 분석 결과{c(RESET)}")
    print(f"{'─'*60}")
    print(f" 텍스트 길이  : {len(text)}자 / {len(text.split())}어절")
    print(f" 패턴 감지   : {len(matches)}건")

    color_score = c(SEVERITY_COLOR[3] if score >= 60 else SEVERITY_COLOR[2] if score >= 30 else SEVERITY_COLOR[1])
    print(f" AI 티 점수  : {color_score}{score}/100{c(RESET)}")
    print(f"{'─'*60}\n")

    if not matches:
        print(f"{c(GREEN)} ✅ AI 특유 패턴이 감지되지 않았습니다.{c(RESET)}\n")
        return

    # 카테고리별 그룹핑
    by_cat = defaultdict(list)
    for m in matches:
        by_cat[m["category_name"]].append(m)

    for cat_name, cat_matches in by_cat.items():
        print(f"{c(BOLD)}{c(CYAN)}▶ {cat_name}{c(RESET)} ({len(cat_matches)}건)")
        for m in cat_matches:
            sev = m["severity"]
            sev_c = c(SEVERITY_COLOR.get(sev, ""))
            print(f"  {sev_c}[{SEVERITY_LABEL[sev]}]{c(RESET)} [{m['id']}] {m['name']}")
            print(f"         발견: {c(BOLD)}\"{m['text']}\"{c(RESET)}")
            if m["alternatives"]:
                print(f"         대안: {c(GRAY)}{' / '.join(m['alternatives'][:2])}{c(RESET)}")
        print()

    # 심각도별 요약
    by_sev = defaultdict(int)
    for m in matches:
        by_sev[m["severity"]] += 1
    print(f"{'─'*60}")
    print(f" 심각도 분포: 높음 {c(SEVERITY_COLOR[3])}{by_sev[3]}건{c(RESET)} / 중간 {c(SEVERITY_COLOR[2])}{by_sev[2]}건{c(RESET)} / 낮음 {c(SEVERITY_COLOR[1])}{by_sev[1]}건{c(RESET)}")
    print(f"{'─'*60}\n")

def print_diff(original: str, fixed: str, count: int, use_color: bool = True):
    def c(code): return code if use_color else ""
    print(f"\n{c(BOLD)}{'─'*60}{c(RESET)}")
    print(f"{c(BOLD)} ✏️  자동 수정 결과 ({count}곳 수정){c(RESET)}")
    print(f"{'─'*60}\n")
    print(fixed)
    print(f"\n{'─'*60}\n")

# ───────────────────────────────────────────
#  메인
# ───────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="iamnotai — 한글 AI 티 제거기 v2.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  python analyzer.py "결론적으로 시사하는 바가 크다"
  python analyzer.py --file article.txt
  python analyzer.py --file article.txt --fix
  python analyzer.py --file article.txt --fix --out result.txt
  python analyzer.py --file article.txt --json
        """
    )
    parser.add_argument("text", nargs="?", help="분석할 텍스트 (직접 입력)")
    parser.add_argument("--file", "-f", help="분석할 텍스트 파일 경로")
    parser.add_argument("--fix", action="store_true", help="규칙 기반 자동 수정")
    parser.add_argument("--json", action="store_true", help="JSON 형식으로 출력")
    parser.add_argument("--out", "-o", help="수정 결과를 저장할 파일 경로 (--fix와 함께)")
    parser.add_argument("--no-color", action="store_true", help="색상 출력 비활성화")
    args = parser.parse_args()

    # 텍스트 로드
    if args.file:
        try:
            with open(args.file, encoding="utf-8") as f:
                text = f.read()
        except FileNotFoundError:
            print(f"[오류] 파일을 찾을 수 없습니다: {args.file}")
            sys.exit(1)
    elif args.text:
        text = args.text
    else:
        # stdin
        print("분석할 텍스트를 입력하세요 (Ctrl+D로 종료):")
        text = sys.stdin.read()

    if not text.strip():
        print("[오류] 텍스트가 비어 있습니다.")
        sys.exit(1)

    db = load_patterns()
    matches = detect_patterns(text, db)
    score = calc_score(text, matches)
    use_color = not args.no_color and sys.stdout.isatty()

    if args.json:
        out = {
            "score": score,
            "total_matches": len(matches),
            "matches": matches,
        }
        if args.fix:
            fixed_text, fix_count = auto_fix(text)
            out["fixed_text"] = fixed_text
            out["fix_count"] = fix_count
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return

    print_report(text, matches, score, use_color)

    if args.fix:
        fixed_text, fix_count = auto_fix(text)
        print_diff(text, fixed_text, fix_count, use_color)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                f.write(fixed_text)
            print(f"📁 저장 완료: {args.out}\n")

if __name__ == "__main__":
    main()
