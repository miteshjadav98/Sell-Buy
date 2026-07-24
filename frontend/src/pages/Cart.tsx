import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../state/CartContext';

export default function Cart() {
  const { lines, total, setQuantity, remove, clear } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checkout = async () => {
    setError('');
    setBusy(true);
    try {
      await api.createOrder(lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));
      clear();
      // The order is accepted as `pending`; the orders page watches it settle.
      navigate('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="empty">
        <h1>Your cart is empty</h1>
        <p className="muted">Browse the shops and add something you like.</p>
        <Link to="/" className="btn">
          Start browsing
        </Link>
      </div>
    );
  }

  return (
    <section className="narrow">
      <h1>Your cart</h1>

      <ul className="lines">
        {lines.map((line) => (
          <li key={line.productId}>
            <div>
              <strong>{line.title}</strong>
              <span className="muted small">{line.shopName}</span>
            </div>

            <input
              type="number"
              min={1}
              max={line.stock}
              value={line.quantity}
              onChange={(e) => setQuantity(line.productId, Number(e.target.value))}
            />

            <span className="price">₹{(line.price * line.quantity).toFixed(2)}</span>

            <button className="link danger" onClick={() => remove(line.productId)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="total-row">
        <span>Total</span>
        <strong className="price">₹{total.toFixed(2)}</strong>
      </div>

      {error && <p className="error">{error}</p>}

      <button className="btn full" onClick={checkout} disabled={busy}>
        {busy ? 'Placing order…' : 'Place order'}
      </button>
      <p className="muted small center">
        Stock is confirmed asynchronously — your order appears as pending, then settles.
      </p>
    </section>
  );
}
