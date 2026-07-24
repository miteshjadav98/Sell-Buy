import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import Layout from './components/Layout';
import Cart from './pages/Cart';
import Home from './pages/Home';
import Login from './pages/Login';
import Notifications from './pages/Notifications';
import Orders from './pages/Orders';
import Register from './pages/Register';
import SellerDashboard from './pages/SellerDashboard';
import ShopPage from './pages/ShopPage';
import { useAuth } from './state/AuthContext';
import type { UserRole } from './types';

function Protected({ children, role }: { children: ReactElement; role?: UserRole }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shops/:id" element={<ShopPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/cart"
          element={
            <Protected role="customer">
              <Cart />
            </Protected>
          }
        />
        <Route
          path="/orders"
          element={
            <Protected>
              <Orders />
            </Protected>
          }
        />
        <Route
          path="/notifications"
          element={
            <Protected>
              <Notifications />
            </Protected>
          }
        />
        <Route
          path="/seller"
          element={
            <Protected role="seller">
              <SellerDashboard />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
