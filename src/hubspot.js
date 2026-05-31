const axios = require('axios');

const HS_BASE = 'https://api.hubapi.com';

async function createHubSpotContact(data) {
  if (!process.env.HUBSPOT_API_KEY) {
    console.warn('⚠️  HUBSPOT_API_KEY not set — skipping CRM sync');
    return null;
  }

  const properties = {
    firstname:   data.name.split(' ')[0] || data.name,
    lastname:    data.name.split(' ').slice(1).join(' ') || '',
    email:       data.email,
    phone:       data.phone || '',
    company:     data.company,
    country:     data.country,
    // Custom HubSpot properties (create these in HubSpot settings)
    csg_sector:  data.sector,
    csg_service: data.service,
    csg_lang:    data.lang,
    csg_message: data.message || '',
    lifecyclestage: 'lead',
    hs_lead_status: 'NEW'
  };

  try {
    // Try to create contact
    const res = await axios.post(
      `${HS_BASE}/crm/v3/objects/contacts`,
      { properties },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ HubSpot contact created: ${res.data.id}`);
    return res.data.id;
  } catch (err) {
    // If contact already exists (409), update it
    if (err.response?.status === 409) {
      try {
        const existing = await axios.get(
          `${HS_BASE}/crm/v3/objects/contacts/${data.email}?idProperty=email`,
          { headers: { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` } }
        );
        const id = existing.data.id;
        await axios.patch(
          `${HS_BASE}/crm/v3/objects/contacts/${id}`,
          { properties },
          { headers: {
              Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✅ HubSpot contact updated: ${id}`);
        return id;
      } catch (updateErr) {
        console.error('HubSpot update error:', updateErr.message);
        return null;
      }
    }
    console.error('HubSpot error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { createHubSpotContact };
