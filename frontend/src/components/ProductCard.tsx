import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import type { Product } from '../types';

export default function ProductCard({ product }: { product: Product }) {
  const { user } = useAuth();
  const { add } = useCart();
  const navigate = useNavigate();
  const [added, setAdded] = useState(false);

  const soldOut = product.stock <= 0;

  const handleAdd = () => {
    // Sellers have no cart, and anonymous visitors need an account first.
    if (!user) return navigate('/login');
    if (user.role !== 'customer') return;
    add(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <article className="card">
      <div className="thumb">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} loading="lazy" />
        ) : (
          <span className="thumb-fallback">{product.title.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div className="card-body">
        <h3>{product.title}</h3>
        <p className="shop">{product.shopName}</p>
        {product.description && <p className="muted small clamp">{product.description}</p>}

        <div className="card-foot">
          <span className="price">₹{product.price.toFixed(2)}</span>
          <span className={soldOut ? 'stock out' : 'stock'}>
            {soldOut ? 'Sold out' : `${product.stock} left`}
          </span>
        </div>

        {user?.role !== 'seller' && (
          <button className="btn small full" onClick={handleAdd} disabled={soldOut}>
            {added ? 'Added ✓' : 'Add to cart'}
          </button>
        )}
      </div>
    </article>
  );
}
