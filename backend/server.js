// UPW.CO Backend — Razorpay Order Creation
// Deploy FREE on Render.com or Railway.app
//
// Setup:
//   1. npm install express razorpay cors dotenv
//   2. Create .env file with your keys (see below)
//   3. Deploy to Render: connect GitHub repo → set env vars → deploy
//
// .env file contents:
//   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxx
//   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxx
//   ALLOWED_ORIGIN=https://upwco.netlify.app

const express   = require('express');
const Razorpay  = require('razorpay');
const cors      = require('cors');
const crypto    = require('crypto');
require('dotenv').config();

const app = express();

// ── CORS — only allow your Netlify domain ────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://upwco.netlify.app',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// ── Razorpay instance ─────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'UPW.CO backend running ✓' }));

// ── Create Razorpay Order ─────────────────────────────────────────────────────
// POST /create-order
// Body: { amount: 1299, currency: 'INR', receipt: 'upwco_1234567890' }
app.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;
    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const order = await razorpay.orders.create({
      amount:   Math.round(amount) * 100, // Razorpay expects paise
      currency,
      receipt:  receipt || 'upwco_' + Date.now(),
    });
    res.json({ id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Verify Payment Signature (optional extra security) ───────────────────────
// POST /verify-payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
app.post('/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body      = razorpay_order_id + '|' + razorpay_payment_id;
    const expected  = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
    if (expected === razorpay_signature) {
      res.json({ verified: true });
    } else {
      res.status(400).json({ verified: false, error: 'Signature mismatch' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delhivery Tracking Proxy ──────────────────────────────────────────────────
// GET /track/:awb
// Proxies Delhivery API to avoid exposing token on frontend
app.get('/track/:awb', async (req, res) => {
  try {
    const { awb } = req.params;
    const response = await fetch(
      `https://track.delhivery.com/api/v1/packages/json/?waybill=${awb}`,
      {
        headers: {
          'Authorization': `Token ${process.env.DELHIVERY_TOKEN}`,
          'Content-Type': 'application/json',
        }
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UPW.CO backend running on port ${PORT}`));
