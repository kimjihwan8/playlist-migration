import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { TopBar } from '../../components/TopBar'
import { Footer } from '../../components/Footer'
import { Stepper } from '../../components/Stepper'
import { PlatformCard } from '../../components/PlatformCard'
import { PLATFORMS, type PlatformId } from '../../lib/platforms'
import { connectPlatform } from '../../lib/api-client'
import { useTransfer } from '../../lib/transfer-store'

export function SelectSourceScreen() {
  const navigate = useNavigate()
  const { set, reset } = useTransfer()
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
