import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { api } from '../api';
import type { Product, Shop } from '../types';

export default function ShopPage() {
  const { id } = useParams<{ id: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api
      .getShop(id)
      .then(({ shop, products }) => {
        setShop(shop);
        setProducts(products);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!shop) return <p className="muted">Loading shop…</p>;

  return (
    <>
      <section className="hero compact">
        <Link to="/" className="link small">
          ← All shops
        </Link>
        <h1>{shop.name}</h1>
        <p className="muted">{shop.description || `Run by ${shop.sellerName}`}</p>
      </section>

      {products.length === 0 ? (
        <p className="muted">This shop has not listed anything yet.</p>
      ) : (
        <div className="grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}
