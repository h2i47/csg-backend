require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db/database');
const contactRoute = require('./routes/contact');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = [
  'https://cscconsulting.site',
  'https://www.cscconsulting.site',
  'https://licitaciones.cscconsulting.site',
  'https://licitaciones-csg.netlify.app',
  'https://cscconsulting.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-admin-secret']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many requests. Please wait.' }
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));
app.use('/api/contact', limiter, contactRoute);
app.use('/api/leads', contactRoute);
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
}

start();
