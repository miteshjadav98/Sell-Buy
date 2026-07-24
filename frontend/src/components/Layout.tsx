import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Sell<span>·</span>Buy
        </Link>

        <nav className="nav">
          <NavLink to="/">Browse</NavLink>
          {user?.role === 'seller' && <NavLink to="/seller">My shop</NavLink>}
          {user && <NavLink to="/orders">Orders</NavLink>}
          {user && <NavLink to="/notifications">Alerts</NavLink>}
          {user?.role === 'customer' && (
            <NavLink to="/cart">Cart{count > 0 && <span className="badge">{count}</span>}</NavLink>
          )}
        </nav>

        <div className="account">
          {user ? (
            <>
              <span className="who">
                {user.name}
                <em>{user.role}</em>
              </span>
              <button className="link" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="link">
                Log in
              </Link>
              <Link to="/register" className="btn small">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="content">{children}</main>

      <footer className="footer">
        Event-driven marketplace · gateway → auth · catalog · orders · notifications
      </footer>
    </div>
  );
}
