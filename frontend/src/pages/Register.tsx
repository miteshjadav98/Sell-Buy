import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import type { UserRole } from '../types';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>('customer');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: e.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await register({ ...form, role });
      navigate(user.role === 'seller' ? '/seller' : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>Create your account</h1>
      <p className="muted">One account type decides what you can do.</p>

      <div className="role-picker">
        <button
          type="button"
          className={role === 'customer' ? 'role active' : 'role'}
          onClick={() => setRole('customer')}
        >
          <strong>I want to buy</strong>
          <span>Browse shops and place orders</span>
        </button>
        <button
          type="button"
          className={role === 'seller' ? 'role active' : 'role'}
          onClick={() => setRole('seller')}
        >
          <strong>I want to sell</strong>
          <span>Register a shop and list products</span>
        </button>
      </div>

      <form onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={update('name')} required minLength={2} />
        </label>

        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            required
            minLength={6}
            placeholder="At least 6 characters"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Creating…' : `Sign up as ${role}`}
        </button>
      </form>

      <p className="muted small">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
