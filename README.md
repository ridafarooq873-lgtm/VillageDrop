# Village Drop

Village-level delivery logistics platform. Customers place pickup & delivery or
rider-assisted purchase orders, riders claim and fulfil them, and admins oversee
the pipeline. Order progress and notifications are pushed to clients in real time
over Socket.IO.

- **Backend** — Node.js, Express, Mongoose, Socket.IO, JWT auth (`backend/`)
- **Frontend** — React 19, Vite, React Router 7, Axios, Socket.IO client (`frontend/`)

---

## Prerequisites

- Node.js 18+ (tested on Node 24)
- npm

No external database is required for development: the backend boots an embedded,
persistent MongoDB (`mongodb-memory-server`) into `backend/.mongo-data`.

---

## Setup

Install dependencies for both apps:

```powershell
npm install --prefix backend
npm install --prefix frontend
```

### Environment variables

`backend/.env` (gitignored — never commit it):

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP/socket port | `5000` |
| `NODE_ENV` | `development` enables request logging | `development` |
| `JWT_SECRET` | Signing key for access tokens | — (required) |
| `JWT_EXPIRE` | Access token lifetime | `1d` |
| `JWT_REFRESH_SECRET` | Signing key for refresh tokens | falls back to `JWT_SECRET` |
| `JWT_REFRESH_EXPIRE` | Refresh token lifetime | `7d` |
| `USE_MEMORY_DB` | `true`/`false` to force/disable the embedded DB | auto in dev |
| `MONGO_URI` | External MongoDB URI (production) | — |
| `MONGO_DB_PATH` | Override the embedded DB data directory | `backend/.mongo-data` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Reserved | — |

> The JWT expiry/refresh variables have code-level fallbacks, so the server still
> issues tokens if they are absent (this was previously a startup-breaking bug).

`frontend/.env`:

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | REST base URL | `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | Socket.IO origin | `http://localhost:5000` |

---

## Running

Start the backend (embedded MongoDB comes up automatically):

```powershell
npm run dev --prefix backend   # nodemon, auto-reload
# or
npm start --prefix backend
```

Start the frontend:

```powershell
npm run dev --prefix frontend  # http://localhost:5173
```

Production build / lint for the frontend:

```powershell
npm run build --prefix frontend
npm run lint  --prefix frontend
```

---

## Architecture

```
backend/
  server.js                     # express + http + socket bootstrap
  config/db.js                  # mongoose connection, embedded mongod fallback
  config/socket.js              # Socket.IO init + getIO()
  middleware/auth.js            # protect: verify Bearer JWT -> req.user
  middleware/rbac.js            # authorize(...roles)
  models/                       # User, Order, OrderItem, Rider, Notification, ...
  routes/
    authRoutes.js               # register / login / refresh / logout / me
    customerRoutes.js           # customer dashboard, orders, notifications, reviews
    riderRoutes.js              # rider order queue, accept, status updates
    adminRoutes.js              # admin order oversight
  services/orderStatusService.js# status transitions, events, notifications
  sockets/orderTracking.js      # socket auth, rooms, location relay

frontend/src/
  api/axios.js                  # axios instance + token interceptor
  api/customerApi.js            # customer REST helpers
  context/AuthContext.jsx       # session, login/register/logout
  context/SocketContext.jsx     # socket connection + live notifications
  components/                   # Navbar (notification bell), ProtectedRoute, ...
  pages/                        # Landing, Login, Register, Dashboard, Orders
```

---

## Authentication & roles

Roles: `customer`, `rider`, `admin` (default `customer`).

- `POST /api/auth/register` → `{ accessToken, refreshToken, user }`
- `POST /api/auth/login`
- `POST /api/auth/refresh-token` → rotates the refresh token
- `POST /api/auth/logout` → clears the stored refresh token
- `GET/PUT /api/auth/me`

Every protected route runs `protect` (verifies the JWT and reloads the user from
the DB, so role changes take effect immediately) followed by `authorize(role)`:

| Router | Guard |
|---|---|
| `/api/customer/*` | `authorize('customer')` |
| `/api/rider/*` | `authorize('rider')` |
| `/api/admin/*` | `authorize('admin')` |

---

## Order lifecycle

Statuses: `pending → confirmed → assigned/purchasing → picked_up → in_transit → delivered`,
plus `cancelled` from early states.

Transitions are enforced in `orderStatusService.js` (`STATUS_TRANSITIONS`); an
invalid transition returns `400`. Delivering an order through the rider endpoint
requires the customer's 4-digit `deliveryPin`.

Key endpoints:

- `POST /api/customer/orders` — create an order (returns the order incl. `deliveryPin`)
- `GET  /api/customer/orders/:id` — order detail
- `PUT  /api/customer/orders/:id/cancel`
- `GET  /api/rider/orders` — available + assigned orders
- `PUT  /api/rider/orders/:id/accept` — claim a pending order (`pending → confirmed`)
- `PUT  /api/rider/orders/:id/status` — advance status; body `{ status, note?, location?, pin? }`
- `PUT  /api/admin/orders/:id/status` — admin override

---

## Real-time flow (Socket.IO)

The client connects to the `/tracking` namespace with the JWT:

```js
io(`${VITE_SOCKET_URL}/tracking`, { auth: { token } })
```

Handlers are registered on both the default namespace and `/tracking`
(`sockets/orderTracking.js`) so either connection style works. Emissions from the
service target **both** namespaces, so a client receives each event once.

**Client → server**

| Event | Payload | Purpose |
|---|---|---|
| `joinOrderRoom` | `orderId` | subscribe to a specific order |
| `leaveOrderRoom` | `orderId` | unsubscribe |
| `updateLocation` | `{ orderId, lat, lng }` | rider location ping |

**Server → client**

| Event | Room | Payload |
|---|---|---|
| `orderStatusUpdated` | `order_{id}` | `{ orderId, previousStatus, newStatus, updatedOrder, timestamp }` |
| `orderAccepted` | `order_{id}` | emitted on `confirmed` |
| `orderPicked` | `order_{id}` | emitted on `picked_up` |
| `orderDelivered` | `order_{id}` | emitted on `delivered` |
| `newNotification` | `user_{id}` | `{ id, userId, orderId, title, message, type, read, createdAt }` |
| `notificationUpdate` | `order_{id}` | same payload as `newNotification` |
| `riderLocationUpdate` | `order_{id}` | `{ orderId, lat, lng, timestamp }` |

Authenticated sockets auto-join `user_{id}`; the frontend `SocketContext` joins
`order_{id}` on the order detail page and normalizes payloads (accepting both
`id`/`_id` and `read`/`isRead`). The navbar bell shows unread counts and marks
notifications read via `PUT /api/customer/notifications/:id/read`.

---

## Testing

An end-to-end test drives the full lifecycle against a spawned backend and
asserts the socket events the UI depends on:

1. Register a customer and a rider, verify login.
2. Create an order; verify an invalid item category returns `400` and leaves no
   orphaned order.
3. Connect a customer socket to `/tracking`, join the order room.
4. Rider accepts → `orderStatusUpdated` + `orderAccepted` + `newNotification`.
5. Ride `picked_up → in_transit → delivered` → matching events; verify a wrong
   delivery PIN and an invalid transition are both rejected with `400`.
6. Assert notification payload shape and user/order scoping.

Manual checks used during development:

- `npm run build --prefix frontend` and `npm run lint --prefix frontend`
- `node --check` on every modified backend file

---

## Troubleshooting

**Embedded MongoDB fails to start / `JSON.parse` crash**
Only one `mongod` may hold the WiredTiger lock on a data directory. Stop any
other running backend, or point the instance (and tests) at a distinct path via
`MONGO_DB_PATH`. `mongodb-memory-server` can crash if a second `mongod` on the
same path emits an error line, so exclusive access matters.

**`"expiresIn" should be a number of seconds...`**
`JWT_EXPIRE` / `JWT_REFRESH_EXPIRE` were missing. Set them in `backend/.env` (or
rely on the built-in fallbacks).

**CORS / connection refused from the frontend**
Ensure the backend is on port `5000` and that `VITE_API_URL` / `VITE_SOCKET_URL`
match. Backend CORS is pinned to `http://localhost:5173`.

---

## Known issues / follow-ups

- **Registration privilege escalation** — `POST /api/auth/register` accepts a
  `role` in the body, so anyone can self-register as `admin`. Restrict this to a
  safe allowlist or an admin-only endpoint.
- **No role-based frontend routing** — `ProtectedRoute` checks authentication
  only; riders/admins are sent to the customer dashboard and have no dedicated
  pages yet.
- **Refresh tokens unused by the frontend** — the axios interceptor clears the
  token on `401` instead of performing a silent refresh.
- **Rider approval not enforced** — `Rider.isApproved` exists but is not checked
  at login or before accepting orders.
