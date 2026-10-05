const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('./config/database.js');
const authRoutes = require('./routes/authRoutes.js');
const userRoutes = require('./routes/UserRoutes.js');
const productRoutes = require('./routes/productRoutes.js');
const categoryRoutes = require('./routes/categoryRoutes.js');
const brandRoutes = require('./routes/brandRoutes.js');
const cartRoutes = require('./routes/cartRoutes.js');
const orderRoutes = require('./routes/orderRoutes.js');
const reviewRoutes = require('./routes/reviewRoutes.js');
const newsletterRoutes = require('./routes/newsletterRoutes.js');
const { filters } = require('./controllers/productController.js');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const allowed = (process.env.CORS_ORIGINS || 'https://reactshopco.vercel.app,http://localhost:5173')
      .split(',').map((value) => value.trim());
    callback(null, !origin || allowed.includes(origin));
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use('/api', async (req, res, next) => {
  await connectDB();
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.get('/api/filters', filters);
app.use('/api', cartRoutes);
app.use('/api', orderRoutes);
app.use('/api', reviewRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid identifier' });
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'Record already exists' });
  const status = err.status || 500;
  if (status === 500) console.error('API failure:', err.message);
  res.status(status).json({ success: false, message: status === 500 ? 'An unexpected error occurred' : err.message });
});

if (!process.env.VERCEL) {
  app.listen(process.env.PORT || 3000, () =>
    console.log('SHOP.CO API listening on port ' + (process.env.PORT || 3000)),
  );
}

module.exports = app;
