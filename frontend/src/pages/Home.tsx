import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { api } from '../api';
import type { Product, Shop } from '../types';

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .listProducts(search.trim() || undefined)
        .then(({ products }) => setProducts(products))
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api
      .listShops()
      .then(({ shops }) => setShops(shops))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Buy from small shops near you</h1>
        <p className="muted">
          Every shop here is run by an independent seller. Find something, add it to your cart,
          and the order goes straight to them.
        </p>
        <input
          className="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {shops.length > 0 && (
        <section>
          <h2>Shops</h2>
          <div className="shop-strip">
            {shops.map((shop) => (
              <Link key={shop.id} to={`/shops/${shop.id}`} className="shop-chip">
                <strong>{shop.name}</strong>
                <span className="muted small">by {shop.sellerName}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>{search ? `Results for "${search}"` : 'Latest products'}</h2>

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading products…</p>}

        {!loading && products.length === 0 && (
          <p className="muted">
            Nothing here yet. If you are a seller, register a shop and add your first product.
          </p>
        )}

        <div className="grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </>
  );
}
