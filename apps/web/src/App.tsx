import { BrowserRouter, Route, Routes } from 'react-router'
import { TransferProvider } from './lib/transfer-store'
import { SelectSourceScreen } from './features/source-platform/SelectSourceScreen'

export function App() {
  return (
    <BrowserRouter>
      <TransferProvider>
        <Routes>
          <Route path="/" element={<SelectSourceScreen />} />
        </Routes>
      </TransferProvider>
    </BrowserRouter>
  )
}
