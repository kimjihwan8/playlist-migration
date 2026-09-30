# Design Brief — P1 (가칭: Playlist Migrator)

> 목적: 이 문서를 AI 디자인 도구나 디자이너에게 그대로 넘겨 P1 화면 시안을 뽑기 위한 브리프.
> 짝 문서: [PRD.md](./PRD.md) · [TRD.md](./TRD.md)
> 범위: **P1만** (CSV 업로드 → Spotify ISRC 매칭 → 결과·통계 → CSV 내보내기). 로그인·쓰기·리뷰 UI는 후속 Phase.

---

## 1. 사용법

- §5 **화면별 스펙**과 §7 **샘플 데이터**를 근거로 디자인.
- 빠르게 뽑고 싶으면 맨 아래 §9 **붙여넣기용 프롬프트**를 복사해 AI 도구에 입력.
- §4 **비주얼 방향**은 "추천 기본값"이니, 취향에 맞게 노브(knob)만 바꾸면 됨.

## 2. 제품 한 줄

"플레이리스트 CSV를 올리면, Spotify에서 같은 곡을 찾아 매칭 결과와 매칭률을 보여주고, 결과를 CSV로 내보내는 웹 도구."

## 3. P1 디자인 원칙

1. **명확 > 화려** — P1은 데이터 정확성을 보여주는 도구. 결과의 가독성이 최우선.
2. **3스텝 마법사** — 업로드 → 처리 → 결과. 사용자가 지금 어디에 있는지 항상 인지.
3. **상태를 숨기지 않기** — 로딩·에러·부분실패를 명확한 시각 신호로.
4. **결과 화면이 주인공** — 매칭률·성공/실패 대비를 한눈에.

## 4. 비주얼 방향 (추천 기본값 — 취향껏 조정)

- **무드:** 모던·클린·약간 프렌들리. 음악 앱 인접하되 촌스럽지 않게.
- **레이아웃:** 중앙 정렬 카드형, 넉넉한 여백, 콘텐츠 폭 제한(약 720–960px).
- **컬러(제안):**
  - 배경: 밝은 뉴트럴 (예: `#0B0B0F` 다크 또는 `#FAFAFA` 라이트 — **다크 우선 권장**, 음악앱 무드)
  - 액센트: 딥 그린/바이올렛 계열 1개 (Spotify 연상 피하려면 바이올렛 `#7C5CFF` 추천)
  - 의미색: 성공 그린, 실패 레드/앰버, 중립 그레이
- **타이포:** 산세리프(Inter/Pretendard). 숫자(통계) 강조용 큰 웨이트.
- **모서리/그림자:** 라운드 12–16px, 은은한 그림자. 카드 위주.
- **톤:** 한국어 UI, 간결한 마이크로카피.
- **노브(바꿔도 되는 것):** 다크/라이트, 액센트 컬러, 카드형 vs 리스트형, 일러스트 유무.

## 5. 화면별 스펙

### 화면 ① 업로드 (Landing)
- **목적:** CSV 올리기 + 무엇을 하는 도구인지 즉시 이해.
- **레이아웃:** 상단 제품명/한 줄 설명 → 중앙 드롭존 → 아래 "CSV 템플릿 다운로드" 링크 + 필요한 컬럼 안내.
- **콘텐츠:**
  - 헤드라인: "플레이리스트를 Spotify로 매칭해보세요"
  - 드롭존: "CSV 파일을 여기에 끌어다 놓거나 클릭해서 선택"
  - 보조: "필수 컬럼: title, artist · 선택: album, isrc, duration"
  - 템플릿 다운로드 버튼
- **상태(states):**
  - `idle`: 드롭존 기본
  - `dragover`: 드롭존 하이라이트
  - `file-selected`: 파일명·곡 수 미리보기 + "매칭 시작" 버튼 활성화
  - `validating`: 파싱/검증 중 스피너
  - `validation-error`: "필수 컬럼(title) 누락 — 3행" 같은 구체적 오류 + 어떤 행/컬럼인지

### 화면 ② 처리중 (Processing)
- **목적:** 매칭 진행 상황 표시(작아도 안정감).
- **레이아웃:** 중앙 진행 인디케이터 + 카운트.
- **콘텐츠:** "매칭 중… 100곡 중 62곡" (P1은 빠르므로 짧게 스쳐도 됨. 스켈레톤도 가능)
- **상태:** `processing` / `error`(API 실패 시 재시도 버튼)

### 화면 ③ 결과 (Results) ⭐ 주인공
- **목적:** 매칭 결과·통계 한눈에 + 내보내기.
- **레이아웃(위→아래):**
  1. **요약 통계 바** — 총 곡수 / 매칭 / 실패, 그리고 **매칭률(%)** 강조. 도넛 또는 수평 바 차트.
  2. **필터 탭** — 전체 / 매칭됨 / 실패
  3. **결과 테이블** — 각 행: [소스 곡(제목·아티스트)] → [매칭된 Spotify 곡(제목·아티스트·앨범아트·링크)] 또는 [실패 배지 + 사유]
  4. **하단 액션** — "결과 CSV 내보내기" 버튼, "다시 하기"
- **행(row) 구성:**
  - 매칭 성공: 좌(소스) → 우(Spotify 곡 + 작은 앨범아트 + 열기 링크), 상태 배지 `매칭됨`
  - 실패: 좌(소스) → 우에 사유 배지 `ISRC 없음` 또는 `타겟에 없음`
- **상태:** `loading`(스켈레톤) / `loaded` / `empty`(매칭 0건일 때 안내)

## 6. 컴포넌트 인벤토리

- 업로드 드롭존 (idle/dragover/error)
- 파일 미리보기 카드 (파일명·곡수)
- 스텝 인디케이터 (1 업로드 · 2 처리 · 3 결과)
- 통계 카드 / 매칭률 차트 (도넛 or 수평 바)
- 필터 탭
- 결과 행 (소스 ↔ 타겟 2열, 상태 배지)
- 배지 (매칭됨 / ISRC 없음 / 타겟에 없음)
- 버튼 (Primary: 매칭 시작·내보내기 / Ghost: 다시 하기)
- 빈/에러 상태 일러스트(선택)

## 7. 샘플 데이터 (디자인 시 이 값으로 채우세요)

**요약:** 총 100곡 · 매칭 78 · 실패 22 · **매칭률 78%** (ISRC 없음 9 · 타겟에 없음 13)

**결과 테이블 예시:**

| 소스 곡 | 소스 아티스트 | 결과 | 매칭된 Spotify 곡 |
| -------- | -------------- | ------ | ------------------ | 
| Get Lucky | Daft Punk | ✅ 매칭됨 | Get Lucky — Daft Punk (Random Access Memories) |
| Ditto | NewJeans | ✅ 매칭됨 | Ditto — NewJeans (Ditto) |
| Spring Day | BTS | ✅ 매칭됨 | Spring Day — BTS (You Never Walk Alone) |
| 밤편지 | 아이유 | ⚠️ ISRC 없음 | — |
| Old Town Road (Remix) | Lil Nas X | ❌ 타겟에 없음 | — |

## 8. 카피/톤 (마이크로카피 예시)

- 업로드: "CSV 파일을 끌어다 놓으세요"
- 검증오류: "필수 컬럼 'title'이 없어요 (3번째 줄). 템플릿을 확인해 주세요."
- 처리: "곡을 Spotify에서 찾는 중…"
- 결과 요약: "100곡 중 78곡을 찾았어요"
- 실패 사유: "ISRC 없음" / "Spotify에서 못 찾음"
- 내보내기: "결과 CSV 내보내기"

## 9. 붙여넣기용 AI 프롬프트 (복사해서 사용)

```
Design a clean, modern web app called "Playlist Migrator" (Korean UI). It matches
a user's playlist (uploaded as CSV) against Spotify's catalog and shows results.

Design 3 screens as a 3-step wizard (Upload → Processing → Results):

1) UPLOAD: centered card layout, a drag-and-drop CSV dropzone, a "download template"
   link, and helper text ("필수 컬럼: title, artist / 선택: album, isrc, duration").
   Show states: idle, dragover (highlighted), file-selected (shows filename + track
   count + primary "매칭 시작" button), and validation-error (specific message like
   "필수 컬럼 'title'이 없어요 (3번째 줄)").

2) PROCESSING: centered progress indicator with count text "매칭 중… 100곡 중 62곡".

3) RESULTS (hero screen): top summary bar with big match-rate stat "78%" plus
   counts (총 100 · 매칭 78 · 실패 22), a donut or horizontal bar chart, filter tabs
   (전체/매칭됨/실패), and a results table. Each row shows the source track (title,
   artist) on the left and the matched Spotify track (title, artist, small album art,
   open link) on the right — or a failure badge ("ISRC 없음" / "타겟에 없음"). Bottom
   actions: primary "결과 CSV 내보내기" and ghost "다시 하기".

Use sample data: total 100, matched 78, failed 22 (no-ISRC 9, not-found 13). Example
rows: "Get Lucky – Daft Punk" (matched), "Ditto – NewJeans" (matched), "밤편지 – 아이유"
(ISRC 없음), "Old Town Road (Remix) – Lil Nas X" (타겟에 없음).

Visual: dark theme, violet accent (#7C5CFF), success green / error red-amber, Inter or
Pretendard font, rounded cards (12–16px), generous whitespace, content width ~720–960px.
Clear over flashy. Emphasize readability of the results table and the match-rate stat.
```

---

**다음 단계:** 이 브리프를 (1) v0/Figma Make에 §9 프롬프트로 넣거나, (2) OMC `designer` 에이전트에 넘겨 HTML/CSS 시안을 뽑으면 됩니다.
