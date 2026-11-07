import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import AuthCallback from './pages/AuthCallback';
import Excel from './pages/Excel';
import Home from './pages/Home';
import Login from './pages/Login';
import PublicHome from './pages/PublicHome';
import Receipts from './pages/Receipts';
import Releases from './pages/Releases';
import Reports from './pages/Reports';
import ReceiptDetails from './pages/ReceiptDetails';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route path="/releases" element={<Releases />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="receipts/:receiptId" element={<ReceiptDetails />} />
            <Route path="reports" element={<Reports />} />
            <Route path="excel" element={<Excel />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
