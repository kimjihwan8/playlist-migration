# playlist-migration

음악 플레이리스트를 서비스 간에 옮긴다. ISRC(국제표준녹음코드)로 곡을 대조하고,
찾지 못한 곡은 사유를 남긴다.

> **상태: P1 완료 후 중단 (2026-10).** 동작하는 코드이고, 중단 이유는 아래 「왜 멈췄나」에 적었다.

## 지금 되는 것

Spotify 계정으로 로그인 → 재생목록·곡 선택 → 다른 Spotify 계정이나 CSV 파일로 이전.
실제 계정으로 끝까지 동작하는 것을 확인했다.

- **OAuth 2.0 (Authorization Code + PKCE)** — client_secret 을 쓰지 않는다. 서버에 보관할 비밀이 없다.
- **세션** — AES-256-GCM 으로 봉인한 httpOnly 쿠키. 변조되면 복호화가 실패해 "세션 없음"이 된다.
- **ISRC 매칭** — 코드가 같으면 같은 녹음이므로 confidence 1. 실패는 사유별로 갈린다
  (`NO_SOURCE_ISRC` = 소스에 코드가 없음 / `NOT_FOUND_IN_TARGET` = 타겟 카탈로그에 없음).
- **타겟 2종** — Spotify(새 비공개 재생목록 / 좋아하는 노래), CSV 파일 내보내기.
- **테스트 101개** — 매칭·어댑터·세션·선택 모델. 네트워크 없이 밀리초 안에 돈다.

## 구조

```
packages/core/              매칭 엔진. dependencies: {} ← 플랫폼·인프라 무관의 물증
├─ domain/                  Track, 어댑터 인터페이스, 결과 타입
├─ matching/                전략 목록을 순서대로 시도(계단식). 지금은 ISRC 하나
└─ transfer/                배치 크기, 실패 이분법, CSV 직렬화

packages/adapters/spotify/  OAuth, 레이트리밋 대응, 응답 번역
packages/adapters/csv/      파일 내보내기 — 계정도 네트워크도 없는 타겟
apps/api/                   Hono 1개. 로컬은 Node, 배포는 Lambda 로 같은 app 을 쓴다
apps/web/                   React + Vite SPA
```

**핵심 설계는 "계단식 매칭의 순서가 코어 안에 있다"는 것.** 전략을 배열에 한 줄 추가하면
매칭 방법이 늘고, 호출자는 바뀌지 않는다. CSV 어댑터를 추가하면서 코어를 한 줄도 고치지
않은 커밋이 그 증거다(`feat: CSV 내보내기 타겟 추가`).

설계 근거는 [docs/](./docs) 에 있다 — [PRD](./docs/PRD.md) · [TRD](./docs/TRD.md) ·
[ERD](./docs/ERD.md) · [실행과 API 발급](./docs/SETUP.md).

## 실행

```bash
cp .env.example .env    # SPOTIFY_CLIENT_ID, SESSION_SECRET
pnpm install && pnpm dev
```

**`http://127.0.0.1:5174`** 로 연다 (`localhost` 아님 — Spotify 가 루프백 Redirect URI 로
`127.0.0.1` 만 받는다). 자세한 절차는 [docs/SETUP.md](./docs/SETUP.md).

## 플랫폼 제약 (제품 결정이 아니라 정책)

Spotify Web API 의 **Development Mode** 에 묶여 있다. Extended Quota Mode 는 법인 +
MAU 25만 이 조건이라 개인 프로젝트는 신청 자격이 없다.

| | 영향 |
|---|---|
| 테스트 사용자 **5명** | 배포해도 허용목록에 넣은 사람만 쓸 수 있다 |
| 앱 소유자 **Premium 필수** | 2026-02 변경 |
| 소유한 재생목록만 읽힘 | 저장(팔로우)만 한 남의 재생목록은 403 — UI 에서 잠금 표시 |
| 2026-02 API 전면 교체 | 구 엔드포인트는 모든 호출자에게 403. 전부 이전했고 경로를 테스트로 고정했다 |

## 왜 멈췄나

이 프로젝트의 중심은 **"ISRC만 썼을 때 → 계단식 폴백을 더했을 때"의 매칭률 개선**을
실측으로 보여주는 것이었다. 그런데 **Spotify → Spotify 이전은 같은 카탈로그라 ISRC 로
거의 다 찾힌다.** 계단식 fuzzy 가 풀 문제가 생기지 않는다.

다른 플랫폼(Apple Music / YouTube Music)을 타겟으로 붙여야 매칭 문제가 발생하는데,
Apple 은 Developer Program 연 $99 가 선행되고 YouTube Music 은 공식 API 가 없다.

즉 **멈춘 이유는 구현 난이도가 아니라, 측정할 대상이 생기지 않는 구조**다.

### 다시 연다면 — 가장 짧은 길

1. **CSV 를 소스로** 받는다. CSV 에는 ISRC 가 없는 행이 많아 **ISRC 매칭이 실제로 실패**한다.
   그 지점에서 계단식 fuzzy 가 필요해지고 개선 폭을 잴 수 있다. 로그인도 필요 없다.
2. **카탈로그 검색을 Client Credentials 로** 돌린다. 사용자 로그인 없이 앱 토큰만 쓰므로
   허용목록 5명 제한을 비껴간다 — 누구나 써볼 수 있는 데모가 된다.
   (⚠️ 2026-02 개발 모드 변경이 이 흐름에 영향을 주는지는 확인하지 않았다. 먼저 검증할 것.)
3. 그다음 `packages/core/matching/` 에 `normalize.ts` / `score.ts` 를 추가하고
   `DEFAULT_STRATEGIES` 에 한 줄 더한다.
