import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Product, Shop } from '../types';

const emptyProduct = {
  title: '',
  description: '',
  price: '',
  stock: '',
  category: 'general',
  imageUrl: '',
};

export default function SellerDashboard() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [shopForm, setShopForm] = useState({ name: '', description: '' });
  const [productForm, setProductForm] = useState(emptyProduct);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.myShop(), api.myProducts()])
      .then(([shopRes, productRes]) => {
        setShop(shopRes.shop);
        setProducts(productRes.products);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const createShop = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { shop } = await api.createShop(shopForm);
      setShop(shop);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create shop');
    } finally {
      setBusy(false);
    }
  };

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { product } = await api.createProduct({
        ...productForm,
        price: Number(productForm.price),
        stock: Number(productForm.stock),
      });
      setProducts((current) => [product, ...current]);
      setProductForm(emptyProduct);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add product');
    } finally {
      setBusy(false);
    }
  };

  const restock = async (product: Product, delta: number) => {
    const stock = Math.max(0, product.stock + delta);
    const { product: updated } = await api.updateProduct(product.id, { stock });
    setProducts((current) => current.map((p) => (p.id === updated.id ? updated : p)));
  };

  const removeProduct = async (id: string) => {
    await api.deleteProduct(id);
    setProducts((current) => current.filter((p) => p.id !== id));
  };

  if (loading) return <p className="muted">Loading dashboard…</p>;

  // A seller must register a shop before anything can be listed.
  if (!shop) {
    return (
      <section className="narrow">
        <h1>Register your shop</h1>
        <p className="muted">One shop per seller. You can add products right after.</p>

        <form onSubmit={createShop} className="panel">
          <label>
            Shop name
            <input
              value={shopForm.name}
              onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })}
              required
              minLength={2}
              placeholder="Sharma General Store"
            />
          </label>

          <label>
            What do you sell?
            <textarea
              value={shopForm.description}
              onChange={(e) => setShopForm({ ...shopForm, description: e.target.value })}
              rows={3}
              placeholder="Groceries and household items, delivered same day."
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create shop'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="narrow">
      <header className="shop-head">
        <div>
          <h1>{shop.name}</h1>
          <p className="muted">{shop.description || 'No description yet.'}</p>
        </div>
        <span className="pill">{products.length} products</span>
      </header>

      <form onSubmit={createProduct} className="panel">
        <h2>Add a product</h2>

        <label>
          Title
          <input
            value={productForm.title}
            onChange={(e) => setProductForm({ ...productForm, title: e.target.value })}
            required
            minLength={2}
          />
        </label>

        <label>
          Description
          <textarea
            value={productForm.description}
            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
            rows={2}
          />
        </label>

        <div className="row">
          <label>
            Price (₹)
            <input
              type="number"
              min={0}
              step="0.01"
              value={productForm.price}
              onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
              required
            />
          </label>

          <label>
            Stock
            <input
              type="number"
              min={0}
              value={productForm.stock}
              onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
              required
            />
          </label>

          <label>
            Category
            <input
              value={productForm.category}
              onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
            />
          </label>
        </div>

        <label>
          Image URL (optional)
          <input
            type="url"
            value={productForm.imageUrl}
            onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
            placeholder="https://…"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add product'}
        </button>
      </form>

      <h2>Your listings</h2>
      {products.length === 0 ? (
        <p className="muted">Nothing listed yet.</p>
      ) : (
        <ul className="listings">
          {products.map((product) => (
            <li key={product.id}>
              <div>
                <strong>{product.title}</strong>
                <span className="muted small">
                  ₹{product.price.toFixed(2)} · {product.category}
                </span>
              </div>

              <div className="stock-control">
                <button className="link" onClick={() => void restock(product, -1)}>
                  −
                </button>
                <span className={product.stock === 0 ? 'stock out' : 'stock'}>
                  {product.stock} in stock
                </span>
                <button className="link" onClick={() => void restock(product, 1)}>
                  +
                </button>
              </div>

              <button className="link danger" onClick={() => void removeProduct(product.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
