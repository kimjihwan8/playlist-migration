import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { TransferProvider } from './lib/transfer-store'
import { SelectSourceScreen } from './features/source-platform/SelectSourceScreen'
import { BrowseSourceScreen } from './features/source-browse/BrowseSourceScreen'
import { SelectTargetScreen } from './features/target-platform/SelectTargetScreen'
import { TransferScreen } from './features/transfer/TransferScreen'

/**
 * 화면을 useState 단계가 아니라 실제 URL로 나눈 이유:
 * OAuth 콜백이 브라우저를 어딘가로 되돌려보내야 하는데 그 도착지가 URL이어야 한다.
 *
 * /transfer 는 진행과 결과를 함께 맡는다 — 결과가 도착하는 대로 쌓이는 화면이라
 * 둘을 나눌 이유가 없고, P2에서 /transfer/:jobId 가 되면 새로고침에도 살아남는다.
 */
export function App() {
  return (
    <BrowserRouter>
      <TransferProvider>
        <Routes>
          <Route path="/" element={<SelectSourceScreen />} />
          <Route path="/source" element={<BrowseSourceScreen />} />
          <Route path="/target" element={<SelectTargetScreen />} />
          <Route path="/transfer" element={<TransferScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TransferProvider>
    </BrowserRouter>
  )
}
