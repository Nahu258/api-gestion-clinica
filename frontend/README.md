# Frontend — EmergenciaYA

Aplicación web mobile-first para encontrar centros de emergencia cercanos.

## Stack

- **React 18** + **Vite 5**
- CSS puro (sin librerías de UI) — mobile-first, 360px base
- React Router v6

## Arrancar en desarrollo

```bash
cd frontend
npm install
npm run dev
```

> La app corre en `http://localhost:5173` y hace proxy a `http://localhost:8000` (backend Django).

## Variables de entorno

Crear `frontend/.env.local` con:

```env
VITE_GOOGLE_CLIENT_ID=TU_GOOGLE_CLIENT_ID_ACA
```

## Flujos implementados (Épica 2)

### Login con Google
1. El SDK de Google Identity Services renderiza el botón
2. El usuario selecciona su cuenta → GIS llama a `onGoogleCredential(response)`
3. El `id_token` se envía a `POST /api/v1/auth/google/`
4. El backend lo verifica, devuelve JWT propios
5. Se guardan en `localStorage` y el usuario va al mapa

### Modo invitado
1. Usuario toca “Continuar sin cuenta”
2. Se llama a `POST /api/v1/auth/invitado/`
3. El backend crea un token UUID en Redis (TTL 2h)
4. Se guarda en `sessionStorage` como `X-Guest-Token`
5. El usuario va al mapa

### Skip de bienvenida
Si ya hay JWT en `localStorage` o guest token en `sessionStorage`, la ruta `/` redirige directo a `/mapa`.
