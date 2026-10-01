import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { TopBar } from '../../components/TopBar'
import { Footer } from '../../components/Footer'
import { Stepper } from '../../components/Stepper'
import { PlatformCard } from '../../components/PlatformCard'
import { PLATFORMS, type PlatformId } from '../../lib/platforms'
import { connectPlatform } from '../../lib/api-client'
import { useTransfer } from '../../lib/transfer-store'

/**
 * 연결 실패 사유를 사용자 말로 옮긴다.
 * 개발 모드의 허용목록은 사용자가 고칠 수 없는 종류의 벽이라, "안 됐다"가 아니라
 * **왜 안 됐고 누가 풀 수 있는지**까지 적어야 한다.
 */
const CONNECT_ERRORS: Record<string, string | undefined> = {
  not_allowlisted:
    '이 Spotify 계정은 아직 테스트 사용자로 등록되지 않았어요. 개발자가 허용목록에 추가해야 연결할 수 있어요.',
  access_denied: '권한 요청을 취소했어요. 다시 시도하려면 아래에서 Spotify를 눌러주세요.',
  session_expired: '연결 요청이 만료됐어요. 다시 시도해 주세요.',
  state_mismatch: '보안 검증에 실패했어요. 처음부터 다시 시도해 주세요.',
  no_code: 'Spotify에서 승인 정보를 받지 못했어요. 다시 시도해 주세요.',
}

export function SelectSourceScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { set, reset } = useTransfer()
  const failure = CONNECT_ERRORS[params.get('error') ?? '']
  const [connecting, setConnecting] = useState<PlatformId | null>(null)

  const pick = async (id: PlatformId) => {
    reset()
    setConnecting(id)
    try {
      // 실연동에서는 여기서 브라우저가 Spotify 승인 화면으로 떠나고,
      // 콜백이 세션을 심은 뒤 /source 로 되돌려보낸다.
      const account = await connectPlatform(id, 'source')
      set({ sourcePlatform: id, sourceAccount: account })
      navigate('/source')
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="screen-shell">
      <TopBar />

      <main className="page-main">
        <div className="intro">
          <div className="eyebrow">PLAYLIST MIGRATOR</div>
          <h1>
            플레이리스트를
            <br />
            <em>어디서</em> 가져올까요?
          </h1>
          <p>가져올 서비스를 고르면 로그인 화면으로 이동해요.</p>
        </div>

        <div className="card" style={{ marginTop: 44, padding: 20 }}>
          <Stepper current="소스" />

          {failure && (
            <p className="connect-error" role="alert">
              <AlertTriangle size={14} />
              <span>{failure}</span>
            </p>
          )}

          <div className="platform-list">
            {PLATFORMS.filter((p) => p.roles.includes('source')).map((platform) => (
              <PlatformCard
                key={platform.id}
                platform={platform}
                state={connecting === platform.id ? 'connecting' : 'idle'}
                onClick={() => pick(platform.id)}
              />
            ))}
          </div>
        </div>

        <p className="scope-note">
          <ShieldCheck size={12} /> 재생목록을 읽고 비공개로 만드는 권한만 요청해요 — 공개
          재생목록 수정 권한은 받지 않아요. 토큰은 서버 세션에만 보관하고 작업이 끝나면 지워져요.
        </p>
      </main>

      <Footer />
    </div>
  )
}
