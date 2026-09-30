import { BrowserRouter, Routes } from 'react-router'
import { TransferProvider } from './lib/transfer-store'

export function App() {
  return (
    <BrowserRouter>
      <TransferProvider>
        <Routes />
      </TransferProvider>
    </BrowserRouter>
  )
}
