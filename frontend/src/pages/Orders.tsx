import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../state/AuthContext';
import type { Order } from '../types';

export default function Orders() {
  const { user } = useAuth();
  const isSeller = user?.role === 'seller';
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef<number>();

  const load = useCallback(async () => {
    try {
      const { orders } = isSeller ? await api.sellerOrders() : await api.myOrders();
      setOrders(orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [isSeller]);

  useEffect(() => {
    void load();
  }, [load]);

  // A pending order is still travelling through the saga, so poll until every
  // order has settled, then stop.
  useEffect(() => {
    const hasPending = orders.some((o) => o.status === 'pending');
    if (!hasPending) return;
    timer.current = window.setTimeout(() => void load(), 2000);
    return () => window.clearTimeout(timer.current);
  }, [orders, load]);

  if (loading) return <p className="muted">Loading orders…</p>;
  if (error) return <p className="error">{error}</p>;

  if (orders.length === 0) {
    return (
      <div className="empty">
        <h1>{isSeller ? 'No sales yet' : 'No orders yet'}</h1>
        <p className="muted">
          {isSeller
            ? 'Orders containing your products will show up here.'
            : 'Once you place an order it will appear here.'}
        </p>
      </div>
    );
  }

  return (
    <section className="narrow">
      <h1>{isSeller ? 'Orders for my shop' : 'My orders'}</h1>

      <ul className="orders">
        {orders.map((order) => (
          <li key={order.id}>
            <header>
              <div>
                <strong>#{order.id.slice(-6)}</strong>
                <span className="muted small">
                  {new Date(order.createdAt).toLocaleString()}
                  {isSeller && ` · ${order.customerEmail}`}
                </span>
              </div>
              <span className={`status ${order.status}`}>{order.status}</span>
            </header>

            <ul className="order-items">
              {order.items.map((item) => (
                <li key={item.productId}>
                  <span>
                    {item.title} × {item.quantity}
                  </span>
                  <span className="price">₹{(item.price * item.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>

            {order.statusReason && <p className="error small">{order.statusReason}</p>}

            <footer>
              <span className="muted small">
                {order.status === 'pending' ? 'Waiting for stock confirmation…' : 'Total'}
              </span>
              <strong className="price">₹{order.total.toFixed(2)}</strong>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  );
}
