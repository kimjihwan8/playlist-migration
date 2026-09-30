# TRD — 플레이리스트 이전 서비스 (가칭: Playlist Migrator)

> Technical Requirements Document · v0.1 · 2026-07
> 짝 문서: [PRD.md](./PRD.md)

---

## 1. 아키텍처 개요

### 1.1 어댑터 패턴 (전 Phase 공통 원칙)
플랫폼-무관 **코어**(매칭 엔진 + 오케스트레이션) + 플랫폼별 **어댑터**(플러그인).

```
            [코어 — 플랫폼 무관]
      매칭 엔진(ISRC→계단식) + 오케스트레이션(큐·상태·진행률)
                     │
   ┌─────────────────┼─────────────────┬──────────────┐
[Spotify어댑터]  [CSV어댑터]     [YouTube어댑터]  [Apple어댑터]
```

**축 분리 (중요):**
- **소스별로 다른 것** = 읽기 / 정규화
- **타겟별로 다른 것** = ISRC 매칭이냐 fuzzy냐 / 쓰기 방식

```typescript
interface PlatformAdapter {
  // 소스 역할
  getPlaylistTracks(id: string): Promise<Track[]>   // → 공통 Track으로 정규화
  // 타겟 역할
  searchByISRC(isrc: string): Promise<TargetTrack[]>
  // searchByMetadata(track): Promise<Candidate[]>   // P3 (fuzzy)
  createPlaylist(name: string): Promise<string>      // P2
  addTracks(playlistId: string, ids: string[]): Promise<void>  // P2
}
```
> **설계 포인트(포폴 어필):** 새 플랫폼 추가 = 어댑터 1개 작성, **코어 수정 0**.

### 1.2 P1 아키텍처 (OAuth-first, 동기)
```
[Next.js 프론트]  로그인 버튼·소스 플리 선택·결과표
      │
[Next.js API routes]  (Vercel 서버리스 함수)
   ├ /api/auth/*      OAuth(PKCE) 콜백·토큰 교환 (client_secret 서버 보관)
   ├ /api/playlists   소스 플리 읽기 (access token)
   ├ /api/match       ISRC 검색 매칭 (q=isrc:<code>)
   └ /api/transfer    타겟 플리 생성 + 곡 쓰기(100곡/요청 배치)
      │
[Spotify Web API]  read + search + write
```
- 전용 DB·큐 **없음**. 토큰은 httpOnly 쿠키/서버세션. 작은 플리(29초 내)만 동기 처리.
- 배포: **Vercel**. AWS는 P2 비동기 파이프라인에서만 진입.

### 1.3 P2a 아키텍처 (큐 없음, 진짜 이전 성립)
```
[React 프론트]  OAuth 로그인·플리 선택·실시간 진행률(폴링)
      │  "시작" → 접수 함수가 async로 워커 1번 호출 후 즉시 응답
[Lambda 워커 1개]  곡 루프: 타겟 검색·매칭·쓰기, 곡별 상태 DB 기록
      │
[DynamoDB]  Job 상태·체크포인트 (TTL 자동삭제)
      ↑
[프론트 폴링]  job_id로 3초 폴링 → SUCCESS/total 진행률
```
> **⚠️ 큐 없음 ≠ 동기.** API Gateway 29초 타임아웃 때문에 비동기(async 호출 + DB 폴링)는 P2a부터 필수. 큐만 아직 안 쓸 뿐.

### 1.4 P2b 아키텍처 (문제 발견 → SQS 도입)
P2a에서 부딪히는 3문제 → 큐 도입 명분:
1. **Lambda 15분 하드리밋** → 대형 플리는 한 실행에 못 끝냄.
2. **크래시 자동복구 없음** → 단일 워커가 죽으면 수동 재트리거·DB 스윕 필요.
3. **공유 레이트리밋 429** → 동시 사용자가 같은 앱 한도(client_id 단위)를 폭파.
```
[React 프론트]  OAuth·플리 선택·진행률(폴링)
      │
[Lambda A: 접수]  DB에서 곡 읽어 큐에 일감 투입 후 즉시 응답
      │
[메시지 큐(SQS)]  가시성 타임아웃 자동 재배달 · 중앙 동시성 제어 · 접수/처리 분리
      │
[Lambda B: 워커]  (동시성 1→2 튜닝) 타겟 검색·매칭·쓰기, 곡별 상태 DB 기록
      │
[DynamoDB]  Job 상태·체크포인트 (TTL 자동삭제)
   └ (선택) [DLQ]  재시도 소진한 인프라 실패 격리·관측
```

## 2. 데이터 모델

### 2.1 공통 도메인 (전 Phase)
```typescript
type Track = {                 // 소스에서 정규화된 곡
  title: string;               // 필수
  artists: string[];           // 필수
  album?: string;
  durationMs?: number;
  isrc?: string;               // 선택(nullable) — 없으면 ISRC 매칭 스킵
}

type MatchResult = {
  status: 'MATCHED' | 'FAILED';           // P1은 이 둘만 (P3에서 AMBIGUOUS 추가)
  method: 'ISRC' | 'FUZZY_AUTO' | 'FUZZY_MANUAL' | null;
  targetTrackId?: string;
  confidence?: number;                    // ISRC면 1.0
  failureReason?: 'NO_SOURCE_ISRC' | 'NOT_FOUND_IN_TARGET';
}
```

### 2.2 P2 영속 스키마 (DB)
```
Transfer_Job (일회성 작업 세션, 무회원)
  id(PK/UUID) | source_platform | source_access_token | source_refresh_token
  | target_platform | target_access_token | target_refresh_token | expires_at
  ※ 토큰은 암호화 저장. expires_at 기준 TTL 자동삭제.

Song (마스터, ISRC는 nullable)
  id(PK/UUID) | isrc(index, nullable) | title | artist | album | duration_ms

Job_Track (작업-곡 매핑 + 매칭결과 + 상태)   // ON DELETE CASCADE from Transfer_Job
  id(PK) | job_id(FK) | song_id(FK)
  | match_status | target_track_id | match_method | match_confidence
  | transfer_status(PENDING/SUCCESS/FAILED) | error_message
```
> `match_method` 집계 = "ISRC로 X%, fuzzy로 Y%, 실패 Z%" 통계(블로그 정량지표)

## 3. 매칭 엔진 명세

### 3.1 P1 — ISRC-only
```
for each sourceTrack:
  if (!isrc) → FAILED, reason=NO_SOURCE_ISRC
  results = target.searchByISRC(isrc)
  if results.length===0 → FAILED, reason=NOT_FOUND_IN_TARGET
  else if results.length===1 → MATCHED, method=ISRC, confidence=1.0
  else → popularity 최고 선택, MATCHED (note=MULTIPLE)
```
- Spotify: `GET /v1/search?q=isrc:<code>&type=track&limit=5` (Client Credentials, 무로그인)
- 곡당 1요청(ISRC 배치검색 없음) → 대량 시 스로틀링 필요(P2 오케스트레이션 근거).

### 3.2 P3 — 계단식 fuzzy (설계, P1엔 미구현)
- **게이트웨이:** ISRC 우선 → 실패분만 타겟별 fuzzy로 폴백.
- **전처리:** NFKC·소문자·노이즈 괄호 제거·feat 분리. 단 `(Live)/(Remastered)` 등 versionTag는 별도 보관.
- **신호·가중치:** title_sim(0.45, 토큰셋) · artist_sim(0.35) · duration_score(0.15, Δ초 구간별·없으면 0.5 중립·YouTube는 완화) · album_bonus(+0.05) · version_penalty(불일치 ×0.5).
- **하드 플로어:** title_sim/artist_sim 둘 중 하나라도 <0.6 → 후보 실격 (오매칭 방지).
- **판정:** confidence ≥0.85 AUTO / 0.60–0.85 AMBIGUOUS(리뷰 UI) / <0.60 FAILED. `top1-top2<0.05`면 AMBIGUOUS로 강등(원곡 vs 리마스터).
- **튜닝:** 가중치·임계값은 실데이터로 조정 = 개선 서사의 실체.

## 4. 외부 연동 (API)

| 플랫폼 | 읽기/검색 | 쓰기 | 인증 | ISRC |
|--------|----------|------|------|------|
| **Spotify** | Search API (`isrc:` 필터) | Create Playlist / Add Tracks (100곡/요청) | Client Credentials(검색) · OAuth PKCE(쓰기, scope: `playlist-modify-*`) | ✅ |
| **CSV** | 파일 파싱 | 파일 생성 | — | 파일에 따라 |
| YouTube (P4) | Data API(영상, ISRC 검색 ❌) | playlistItems.insert(50 units, 채널 필요) | Google OAuth | ❌ |
| Apple (P4) | Apple Music API | 〃 | Dev토큰+User토큰($99/년) | ✅ |

## 5. 오케스트레이션 (P2)

- **배치:** Spotify 쓰기 100곡/요청.
- **큐(SQS, P2b):** ①크래시 시 자동 재전달(미ack 메시지 visibility timeout 후 재처리) ②레이트리밋 동시성 제어(동시 워커 수 캡) ③접수/처리 분리(빠른 응답).
- **가시성 타임아웃:** 워커가 메시지를 꺼내면 N초간 invisible → 그 안에 ack면 완료·삭제, 없으면(=워커 크래시) 다시 보여 재배달. **중복 방지 + 크래시 자동복구를 동시에 제공.**
- **체크포인트:** 곡별 `transfer_status`를 DB에 기록 → 중단 후 재개·부분실패 리포트·진행률 계산.
- **레이트리밋:** Spotify는 **앱(client_id) 단위 30초 롤링** → 동시 사용자가 한도 공유. 그래서 워커 병렬 수를 한도 아래로 제어(P2b). 워커는 1개로 시작→속도개선 위해 2개로 튜닝(429 근접 시 조정).
- **실패 이분법(중요):**
  - **일시적**(네트워크·429·500·크래시) → 재시도(지수 백오프). P2b는 큐가, P2a는 잡 재개가 담당.
  - **영구/비즈니스**(곡 못찾음·ISRC없음·잘못된 데이터) → **즉시 FAILED·재시도 X**, DB에 사유 기록, UI 표시. 워커가 에러 종류로 구분(404→영구, 429/timeout→일시적).
- **멱등성:** 워커는 쓰기 전 DB point-read로 상태 SUCCESS면 스킵(중복 방지, 곡당 1쿼리=무시할 비용). write-then-record 사이 크래시 취약구간은 **check-before-write**(타겟 플리에 이미 있나 조회)로 보강.
- **잡 재개:** 전체 유실 시 DB에서 SUCCESS/FAILED 아닌 것만 조회 → 큐 재투입. 부분 크래시는 큐(가시성)가 자동 처리하므로 스윕 불필요.
- **DLQ(선택):** 재시도 소진한 인프라 독성 메시지 격리·관측용. 비즈니스 실패는 DB FAILED로 이미 추적되므로 **DLQ 없이도 실패 관리·재개 가능**. DLQ는 재시도 큐가 아님(자동 재투입 아님).
- **IAM:** AWS면 실행롤 필수(회피 불가). 최소권한(워커는 자기 테이블·큐만) 설계는 보안 어필.
- **진행률:** 프론트가 job_id로 3초 폴링 → `SUCCESS / total` 비율 응답. (필요시 SSE/WebSocket로 확장)

## 6. 보안 & 프라이버시

- 서드파티 토큰은 **암호화 저장** (또는 Secrets Manager/KMS).
- `Transfer_Job` **TTL 자동삭제** + `Job_Track` CASCADE → 개인정보·용량·리스크 최소.
- API 제공 데이터의 영구 저장·재판매 금지 준수.

## 7. 기술 스택 (제안)

- **프론트:** React + TypeScript + Vite + Tailwind, TanStack Query(폴링·캐싱), Papa Parse(CSV), 가상 스크롤(react-window), Pretendard. 테스트: Vitest + RTL.
- **백엔드(확정):** **AWS** — Lambda(P1 검색 프록시 1개 / P2 워커·접수), DynamoDB(P2a, TTL 내장), SQS(P2b). 대안 Vercel+Upstash 검토 후 목표(실사용·인프라 학습·프로덕트 엔지니어) 기준 AWS 선택.
- **정당화(포폴):** 각 선택은 "문제 → 선택 → 대안·트레이드오프"로 README에 기술. AWS 근거·큐 지연 도입·워커 병렬화·실패 이분법·멱등성 서사는 §5 참조.

## 8. 테스트 전략

- **매칭 엔진:** 정답지(예: TuneMyMusic 이전 결과를 CSV로) 기반 테스트셋으로 매칭률 측정. 오매칭/미스 케이스 수집 → 튜닝 루프.
- **단위:** 파서·정규화·스코어링 함수.
- **통합:** Spotify 검색 프록시(모킹/실호출).

## 9. Phase 대응 (PRD §5와 연결)

- **P1 (OAuth-first, 동기):** §1.2, §2.1, §3.1, §4(Spotify read+search+write) — OAuth·Next.js API routes·Vercel, 전용 DB·큐 없음.
- **P2 (동기→비동기 진화):** §1.3(async 워커+DB) → §1.4(SQS 도입)·§2.2·§5·§6 — AWS 진입, 진행률·크래시복구·동시성.
- **P3:** §3.2 — fuzzy·리뷰 UI.
- **P4+:** §1.1 어댑터 추가(YouTube/Apple), CSV 소스(보조).
