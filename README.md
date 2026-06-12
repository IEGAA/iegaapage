# IEGAA

Sistema educativo para gestionar horarios, novedades, ausencias, información y usuarios.

## Backend

La aplicación ahora incluye un backend en Node.js y Express con autenticación por token, control de roles y persistencia en archivo JSON.

### Requisitos

- Node.js 20 o superior

### Instalación

```bash
npm install
```

### Ejecución

```bash
npm run dev
```

o

```bash
npm start
```

El servidor queda disponible en `http://localhost:3000` y también sirve los archivos estáticos del proyecto.

### Credencial inicial

- Usuario: `1034918343`
- Contraseña: `G1034918343`

### API principal

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/horarios/base`
- `GET /api/horarios/novedades`
- `POST /api/ausencias`
- `PATCH /api/ausencias/:id/approve`
- `PATCH /api/ausencias/:id/reject`
- `GET /api/informacion`
- `GET /api/usuarios`
- `POST /api/usuarios`
- `PUT /api/usuarios/:id`
- `DELETE /api/usuarios/:id`

## Datos del sistema

- 24 grupos
- 40 profesores
- Horario base inmutable para el front, con copia de novedades procesada en el backend
