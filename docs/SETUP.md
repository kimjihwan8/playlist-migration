# 로컬 실행과 API 발급

> 2026-10-01 확인. Spotify 쪽 정책이 2026년에 두 번 바뀌었으니 날짜를 같이 본다.

## 1. Spotify Web API

### 발급 절차

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) 에 본인 Spotify 계정으로 로그인
2. **Create app**
   - App name / description: 아무거나
   - **Redirect URI**: `http://127.0.0.1:5174/api/auth/callback`
   - Which API/SDKs: **Web API** 체크
3. 만들어진 앱 → **Settings** 에서 **Client ID** 복사
   - Client secret 은 **복사하지 않는다.** 이 프로젝트는 PKCE 라서 쓰지 않는다.
4. **Settings → User Management** 에서 테스트할 Spotify 계정을 등록
   - 이름 + 그 계정의 **이메일**을 정확히 적어야 한다

### 알아둬야 할 제약 (2026년 변경)

| | 내용 |
|---|---|
| **앱 소유자 Premium 필수** | 2026-02 부터 개발 모드 앱은 **소유자 계정이 Premium 이 아니면 동작하지 않는다** |
| **테스트 사용자 5명** | 25명에서 5명으로 줄었다. 허용목록에 없는 계정은 로그인 시 `403` |
| **Client ID 25개** | 2026-07 부터 계정당 25개까지. 단 **쿼터는 계정 단위로 합산**된다 |
| **Extended Quota 사실상 불가** | 법인 + 운영 중인 서비스 + **MAU 25만** 이 조건. 개인 포트폴리오는 대상이 아니다 |

> **포트폴리오에 직접 영향이 있다.** 배포해도 아무나 자기 Spotify 계정으로 로그인할 수 없다.
> 면접관에게 보여주려면 ① 그 사람 계정을 허용목록에 넣거나(5명 한도) ② 데모 영상을 같이 두거나
> ③ **로그인이 필요 없는 CSV 소스**를 살려야 한다.
> P4 로 미뤄둔 CSV 어댑터가 "누구나 써볼 수 있는 유일한 경로"라는 새 명분을 얻은 셈이다.

### Redirect URI 주의

- `localhost` 는 **더 이상 안 된다.** 루프백은 `127.0.0.1` 만 받는다.
- 브라우저 주소창도 `http://127.0.0.1:5174` 로 열어야 한다 — `localhost` 로 열면 쿠키 출처가 달라진다.
- Dashboard 에 등록한 값과 서버가 보내는 값이 **한 글자도 달라선 안 된다**(끝의 `/` 포함).

### 요청하는 권한

`playlist-read-private` · `playlist-modify-private` · `user-library-read` · `user-library-modify`

`playlist-modify-public` 은 **일부러 뺐다.** 만드는 재생목록을 전부 비공개로 고정했기 때문에
필요가 없고, 동의 화면에서 요구하는 권한이 한 줄 줄어든다.

## 2. Apple Music API (아직 구현 안 함)

Spotify 와 구조가 다르다. **토큰이 두 종류**다.

| | 무엇 | 어떻게 |
|---|---|---|
| Developer Token | 앱이 Apple 에게 자신을 증명 | `.p8` 개인키로 **직접 서명한 JWT** (ES256, 최대 6개월) |
| Music User Token | 사용자가 자기 라이브러리 접근을 허락 | MusicKit JS 로 사용자 동의 → 받아옴 |

1. **Apple Developer Program 가입 — 연 $99.** 이것 없이는 MusicKit 키를 만들 수 없다.
2. Certificates, Identifiers & Profiles → **Identifiers** 에서 MusicKit identifier 생성
3. **Keys** 에서 MusicKit 용 키 생성 → `.p8` 파일 다운로드 (**다시 받을 수 없다**)
4. JWT 를 직접 만든다: 헤더 `{alg: ES256, kid: <Key ID>}`, 페이로드 `{iss: <Team ID>, iat, exp}`
5. 웹에서 사용자 토큰을 받으려면 MusicKit JS 를 붙이고, **사용자에게 Apple Music 구독이 있어야 한다**

> 테스트 데이터로만 쓸 거면 $99 는 필요 없다. **라이브 어댑터를 만들 때만** 든다.
> Spotify 와 달리 "허용목록 5명" 같은 제약은 없지만, 매년 갱신하지 않으면 키가 죽는다.

## 3. 로컬 실행

```bash
cp .env.example .env          # SPOTIFY_CLIENT_ID 와 SESSION_SECRET 을 채운다
openssl rand -base64 32       # SESSION_SECRET 값으로 쓸 것

pnpm install
pnpm dev                      # web(5174) + api(8787) 동시 실행
```

브라우저에서 **`http://127.0.0.1:5174`** 로 연다(`localhost` 아님).

Vite dev 서버가 `/api/*` 를 `127.0.0.1:8787` 로 넘긴다 — 배포에서 CloudFront 가 하는 일과 같은 모양이라
쿠키가 first-party 로 붙고 CORS 설정이 필요 없다.

```bash
pnpm typecheck    # 전체 타입 검사
pnpm test         # 매칭 엔진·어댑터·API 테스트
```
