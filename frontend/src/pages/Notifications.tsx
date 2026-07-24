import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Notification } from '../types';

export default function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .notifications()
      .then(({ notifications }) => {
        setItems(notifications);
        // Everything on screen counts as seen.
        if (notifications.some((n) => !n.read)) void api.markNotificationsRead();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <section className="narrow">
      <h1>Alerts</h1>
      <p className="muted small">
        Written by the notification service as it consumes events from the bus.
      </p>

      {items.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="alerts">
          {items.map((item) => (
            <li key={item.id} className={item.read ? '' : 'unread'}>
              <div>
                <strong>{item.title}</strong>
                <p className="muted small">{item.message}</p>
              </div>
              <time className="muted small">{new Date(item.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
