# cortes-api

API Node/Express de la aplicación de cortes de carril. Escucha en `127.0.0.1:4100`, con nginx delante en `/api/`.

## Puesta en marcha
```bash
cd /opt/cortes/backend
npm ci --omit=dev
cp .env.example .env        # rellenar: PGPASSWORD, JWT_SECRETO (propio), ADMIN_*
node bootstrapAdmin.js      # admin inicial (--password para restablecer su contraseña)
pm2 start server.js --name cortes-api
pm2 save
```
Antes hay que haber ejecutado los scripts `sql/001…005` (ver [../CLAUDE.md](../CLAUDE.md)).

## Autenticación
- `Authorization: Bearer <token>`. El JWT lleva `{ id, email, rol }` y está firmado con `JWT_SECRETO` (HS256). Ese secreto es **distinto del de BIDELAN**.
- En cada petición se comprueba en la BD que el usuario sigue aprobado y se toma su rol actual. Una baja o un cambio de rol tienen efecto inmediato.
- `/api/auth` (POST): 20 intentos cada 15 minutos por IP (`trust proxy` activo).

## Rutas

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | público | `{nombre, email, password}`. La cuenta queda pendiente de aprobación |
| POST | `/api/auth/login` | público | `{email, password}` → `{token, usuario}` |
| GET | `/api/auth/yo` | usuario | Usuario de la sesión |
| GET | `/api/cortes` | usuario | GeoJSON EPSG:4326. Filtros: `carretera=AP8,AP1`, `sentido=1`, `estado=previsto,activo`, `desde`, `hasta` (solape de periodos), `activos=1`, `bbox=minLon,minLat,maxLon,maxLat` |
| GET | `/api/cortes/catalogos` | usuario | Carreteras, carriles, rango de PK por eje y estados |
| GET | `/api/cortes/:id` | usuario | Un corte (Feature) |
| GET | `/api/cortes/:id/auditoria` | editor | Historial del corte |
| POST | `/api/cortes` | editor | Alta |
| PUT | `/api/cortes/:id` | editor | Edición (corte completo) |
| POST | `/api/cortes/:id/finalizar` | editor | Pasa a `finalizado`, con `fecha_fin` = ahora si ya había empezado |
| DELETE | `/api/cortes/:id` | admin | Baja definitiva (queda en la auditoría) |
| GET | `/api/admin/usuarios` | admin | Lista (primero los pendientes) |
| PUT | `/api/admin/usuarios/:id/aprobar` | admin | Aprobar alta |
| PUT | `/api/admin/usuarios/:id/rol` | admin | `{rol: usuario\|editor\|admin}` |
| DELETE | `/api/admin/usuarios/:id` | admin | Rechazar alta o dar de baja |
| GET | `/api/admin/auditoria` | admin | `?corte_id=&limite=` |
| GET | `/api/salud` | público | Comprobación de BD |

### Cuerpo de un corte
```json
{
  "carretera": "AP-636", "sentido": 1, "carriles": ["DER"],
  "pk_inicio": "2+000", "pk_fin": 2.5,
  "fecha_inicio": "2026-10-07T08:00:00+02:00", "fecha_fin": "2026-10-07T14:00:00+02:00",
  "tipo": "Obra", "motivo": "Bacheo", "estado": "previsto", "observaciones": null,
  "desplazamiento_m": null
}
```
- La carretera se acepta como `AP-636` o `AP636`. Los PK, como número en km, `"2,5"` o `"2+500"`.
- Si `desplazamiento_m` es `null`, se calcula a partir de los carriles.
- La geometría la genera la BD. Si el PK está fuera de rango o hay un hueco en la calibración, la respuesta es 400 con el mensaje del trigger.

## Errores
Formato `{ "error": "mensaje" }`. Los de validación añaden además `errores: []`. Códigos: 400 datos, 401 sesión, 403 rol o cuenta pendiente, 404, 409 duplicado, 429 límite de intentos.
