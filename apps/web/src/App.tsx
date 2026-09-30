import { BrowserRouter, Route, Routes } from 'react-router'
import { TransferProvider } from './lib/transfer-store'
import { SelectSourceScreen } from './features/source-platform/SelectSourceScreen'
import { BrowseSourceScreen } from './features/source-browse/BrowseSourceScreen'

export function App() {
  return (
    <BrowserRouter>
      <TransferProvider>
        <Routes>
          <Route path="/" element={<SelectSourceScreen />} />
          <Route path="/source" element={<BrowseSourceScreen />} />
        </Routes>
      </TransferProvider>
    </BrowserRouter>
  )
}
