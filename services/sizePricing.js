function sizePricing(product, size) {
  const override = (product?.sizePrices || []).find(row => row.size === size);
  if (!override) return { price: Number(product?.price || 0), oldPrice: Number(product?.oldPrice || 0) };
  const discount = Math.max(0, Math.min(100, Number.parseFloat(product.discount) || 0));
  return { price: Math.round(override.price * (1 - discount / 100) * 100) / 100, oldPrice: discount > 0 ? override.price : 0 };
}
module.exports = { sizePricing };
