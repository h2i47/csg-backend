require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db/database');
const contactRoute = require('./routes/contact');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── SECURITY ───────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());

// CORS — only allow your Netlify domain (and localhost for dev)
const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:5500'
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-admin-secret']
}));

// Rate limiting — 10 form submissions per IP per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many requests. Please wait a few minutes.' }
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// ─── ROUTES ─────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));

app.use('/api/contact', limiter, contactRoute);

// GET /api/leads uses same router, no rate limit needed
app.use('/api/leads', contactRoute);

// 404
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// ─── START ──────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`🚀 CSG Backend running on port ${PORT}`);
      console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
      console.log(`   CORS allowed: ${allowedOrigins.join(', ')}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
}

start();
