const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { createHubSpotContact } = require('./hubspot');
const { sendNotification } = require('./email');

// Input validation
function validate(body) {
  const errors = [];
  if (!body.name?.trim())    errors.push('name required');
  if (!body.company?.trim()) errors.push('company required');
  if (!body.country?.trim()) errors.push('country required');
  if (!body.sector?.trim())  errors.push('sector required');
  if (!body.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
                             errors.push('valid email required');
  if (!body.service?.trim()) errors.push('service required');
  return errors;
}

// POST /api/contact
router.post('/', async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }

  const data = {
    name:    req.body.name.trim(),
    company: req.body.company.trim(),
    country: req.body.country.trim(),
    sector:  req.body.sector.trim(),
    email:   req.body.email.trim().toLowerCase(),
    phone:   req.body.phone?.trim() || null,
    service: req.body.service.trim(),
    message: req.body.message?.trim() || null,
    lang:    req.body.lang?.trim() || 'en',
    ip:      req.ip
  };

  try {
    // 1. Save to PostgreSQL
    const result = await pool.query(
      `INSERT INTO leads (name, company, country, sector, email, phone, service, message, lang, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [data.name, data.company, data.country, data.sector,
       data.email, data.phone, data.service, data.message, data.lang, data.ip]
    );
    const leadId = result.rows[0].id;
    console.log(`✅ Lead #${leadId} saved to DB`);

    // 2. HubSpot CRM (async, don't block response)
    createHubSpotContact(data).then(hsId => {
      if (hsId) {
        pool.query('UPDATE leads SET hubspot_id=$1 WHERE id=$2', [hsId, leadId]);
      }
    }).catch(console.error);

    // 3. Email notification (async, don't block response)
    sendNotification(data).catch(console.error);

    return res.status(200).json({
      ok: true,
      message: 'Lead received. We\'ll be in touch within 24 hours.'
    });

  } catch (err) {
    console.error('Contact route error:', err);
    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
});

// GET /api/leads — internal dashboard (protect with secret header)
router.get('/leads', async (req, res) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id,name,company,country,sector,email,phone,service,lang,created_at FROM leads ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ ok: true, leads: rows });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
