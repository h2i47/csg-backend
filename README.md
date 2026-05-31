# CSG Consulting — Backend

Node.js + Express + PostgreSQL + HubSpot CRM

## Stack
- **Runtime**: Node.js 18+
- **Framework**: Express
- **Database**: PostgreSQL (Railway)
- **CRM**: HubSpot (Private App Token)
- **Email**: Nodemailer (Gmail SMTP o propio)
- **Deploy**: Railway (desde GitHub)

---

## Deploy en Railway

### 1. Sube este repo a GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/TU_USUARIO/csg-backend.git
git push -u origin main
```

### 2. En Railway
- New Project → Deploy from GitHub repo → selecciona `csg-backend`
- Add Plugin → PostgreSQL → Railway añade `DATABASE_URL` automáticamente

### 3. Variables de entorno en Railway
Ve a tu servicio → Variables → añade:

```
NODE_ENV=production
ALLOWED_ORIGIN=https://www.csgconsulting.ma
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=tu_app_password_de_gmail
EMAIL_TO=contact@csgconsulting.ma
EMAIL_FROM=CSG Consulting <noreply@csgconsulting.ma>
HUBSPOT_API_KEY=tu_private_app_token
ADMIN_SECRET=crea_una_clave_secreta_larga
```

> `DATABASE_URL` la pone Railway automáticamente al añadir PostgreSQL.

### 4. Tu URL de Railway
Será algo como: `https://csg-backend-production.up.railway.app`

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/contact` | Recibe formulario |
| GET | `/api/leads` | Lista leads (requiere header `x-admin-secret`) |

### POST /api/contact — Body esperado
```json
{
  "name":    "John Smith",
  "company": "Acme GmbH",
  "country": "DE",
  "sector":  "energy",
  "email":   "john@acme.com",
  "phone":   "+49 123 456",
  "service": "tender",
  "message": "Interested in solar tenders",
  "lang":    "en"
}
```

---

## HubSpot — Crear Private App Token
1. HubSpot → Settings → Integrations → Private Apps
2. Create app → Scopes: `crm.objects.contacts.write`, `crm.objects.contacts.read`
3. Copia el token → variable `HUBSPOT_API_KEY`

## Gmail — App Password
1. Google Account → Security → 2-Step Verification → App passwords
2. Crea una para "Mail" → copia la contraseña de 16 caracteres
3. Pega en `SMTP_PASS`

---

## Conectar con el frontend (Netlify)

En el `index.html`, el formulario envía a:
```javascript
const API_URL = 'https://TU-PROYECTO.up.railway.app/api/contact';
```

Actualiza esa URL en el HTML antes de subir a Netlify.
