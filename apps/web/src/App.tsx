import { BrowserRouter, Route, Routes } from 'react-router'
import { TransferProvider } from './lib/transfer-store'
import { SelectSourceScreen } from './features/source-platform/SelectSourceScreen'
import { BrowseSourceScreen } from './features/source-browse/BrowseSourceScreen'
import { SelectTargetScreen } from './features/target-platform/SelectTargetScreen'

export function App() {
  return (
    <BrowserRouter>
      <TransferProvider>
        <Routes>
          <Route path="/" element={<SelectSourceScreen />} />
          <Route path="/source" element={<BrowseSourceScreen />} />
          <Route path="/target" element={<SelectTargetScreen />} />
        </Routes>
      </TransferProvider>
    </BrowserRouter>
  )
}
