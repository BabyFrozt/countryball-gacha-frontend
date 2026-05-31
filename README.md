# CountryBall Gacha Backend API

Express API for wallet registration, token balance sync, gacha pulls, collection state, recent pulls, and leaderboard data.

## Base URL

Local development:

```txt
http://localhost:3456
```

Frontend Vite dev proxy maps `/api` to this backend.

## Rules

- Users must hold the configured token to pull.
- Gacha pull cooldown is enforced server-side every 3 hours.
- The pull endpoint uses an atomic database update so double-clicks or parallel requests cannot bypass the cooldown.
- Collection entries are unique per wallet and countryball. Duplicate pulls are logged, but do not create duplicate collection rows.

## Token

```txt
CBgXb5i9pNi1YJmY1bFkhaHa448fafAm747PnNCcpump
```

## Endpoints

### `POST /api/wallet/connect`

Creates a user row if the wallet has not been seen before.

Request:

```json
{
  "wallet": "wallet_public_key"
}
```

Success:

```json
{
  "success": true,
  "user": {}
}
```

Errors:

- `400` when `wallet` is missing.

### `POST /api/wallet/balance`

Syncs the wallet token balance stored by the backend. This value is used by the backend to decide whether the wallet can pull.

Request:

```json
{
  "wallet": "wallet_public_key",
  "balance": 123.45,
  "tokenBalance": 123.45
}
```

Notes:

- `tokenBalance` is preferred.
- `balance` is kept for compatibility.
- Holding multiplier metadata is also updated here.

Errors:

- `400` when `wallet` is missing.
- `404` when the user does not exist.

### `GET /api/user/:wallet`

Returns the user profile, collection, cooldown state, progress, and multiplier data.

Success includes:

```json
{
  "cooldownRemaining": 0,
  "cooldownTotal": 10800000,
  "hasTokens": true,
  "tokenMint": "CBgXb5i9pNi1YJmY1bFkhaHa448fafAm747PnNCcpump",
  "nations": [],
  "nationProgress": 0,
  "totalNations": 48,
  "multiplier": {
    "current": 1,
    "highMark": 0,
    "daysHeld": 0,
    "discount": 0,
    "totalEarned": 0,
    "claimable": 0,
    "rewardPool": 0
  }
}
```

### `POST /api/gacha/pull`

Attempts a gacha pull for a wallet.

Request:

```json
{
  "wallet": "wallet_public_key"
}
```

Success:

```json
{
  "success": true,
  "result": {
    "id": "brazil",
    "name": "Brazil",
    "flag": "BR",
    "confederation": "CONMEBOL",
    "isNew": true
  },
  "nextPullAt": 1760000000000
}
```

Errors:

- `400` when `wallet` is missing.
- `403` with `NO_TOKENS` when the stored token balance is `0`.
- `404` when the user does not exist.
- `429` with `COOLDOWN` when the wallet already pulled within the last 3 hours.

Cooldown error example:

```json
{
  "error": "COOLDOWN",
  "message": "Wait 120 minutes",
  "cooldownRemaining": 7200000
}
```

### `GET /api/leaderboard`

Returns the top collectors. Results are sorted by unique collection count, then total pulls.

Success:

```json
{
  "leaders": [
    {
      "wallet": "wallet_public_key",
      "total_pulls": 10,
      "unique_count": 8,
      "balance": 123.45,
      "multiplier": 1
    }
  ]
}
```

### `GET /api/recent-pulls`

Returns the 30 most recent gacha pulls.

Success:

```json
{
  "pulls": [
    {
      "id": 1,
      "wallet": "wallet_public_key",
      "nation_id": "brazil",
      "nation": {
        "id": "brazil",
        "name": "Brazil",
        "flag": "BR",
        "confederation": "CONMEBOL"
      },
      "pulled_at": 1760000000
    }
  ]
}
```

### `GET /api/nations`

Returns the full countryball pool and token mint.

Success:

```json
{
  "nations": [],
  "tokenMint": "CBgXb5i9pNi1YJmY1bFkhaHa448fafAm747PnNCcpump"
}
```

## Development

Install dependencies:

```bash
npm install
```

Run backend:

```bash
npm run dev
```

Run production-style backend:

```bash
npm start
```

Required environment:

```txt
DATABASE_URL=postgresql://...
```
