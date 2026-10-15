# Live queue screen + "your turn" notifications

## Live updates

Existing: `BranchQueueRoom` Durable Object + `useQueueSocket` (HELLO as CUSTOMER).

| Option | Use |
|--------|-----|
| WebSocket via DO (current) | Primary when the Mini App is foreground |
| Polling `GET /api/tickets/:id` every 10–15 s | Fallback when WS fails to connect or closes repeatedly |
| Refetch on resume | Always |

```ts
import { events, EventName } from 'zmp-sdk';
events.on(EventName.AppResumed, () => { refetchTicket(); reconnectSocket(); });
events.on(EventName.AppPaused, () => closeSocket()); // saves DO connections
```

`AppPaused`/`AppResumed` exist ✅ (API map). WebView is suspended in background ⚠️ — never rely
on the socket to alert a backgrounded user; that is what OA/ZNS is for. Optionally
`keepScreen` while status is `CALLED`.

## Notification channels

| Channel | Requirements | Notes |
|---------|-------------|-------|
| **OA UID message** (tin UID) | User **followed the OA** + we have `idByOA` ✅ | `getUserInfo().userInfo.idByOA` only returned after follow ✅. Message types/policy per OA docs (`/docs/OA/tin-nhan/tong-quan`) |
| **ZNS** | Approved ZNS template + user **phone number** ✅ | Paid per message; current code charges 400 VND from merchant wallet |
| **Mini App OA notification** | `requestSendNotification()` consent ✅ | "OA Mini App" (shared) channel; send API details ⚠️ unverified (`/docs/MA/openApis/notification/apis/send`) |
| WebSocket / in-app | App in foreground | free |

### Messaging windows ⚠️ UNVERIFIED

Commonly cited OA rules: free-form "consultation" (tư vấn) messages only within a window after
the user's last interaction (often quoted as **48 h**; some sources say 7 days for some types),
otherwise "transaction" (giao dịch) templates are needed and may be charged. **Not verified** —
check `/docs/OA/tin-nhan/tong-quan` and the current Zalo OA pricing before implementing.
Design defensively: store `last_interaction_at` and choose the channel at send time.
A virtual queue is usually done within hours, so taking a ticket (= user interaction in the Mini App)
should keep us inside any window, but ⚠️ confirm a Mini App action counts as an OA interaction.

ZNS template approval rules (variables, no marketing content, Vietnamese) ⚠️ — create via
ZCA (zalo.cloud) ✅ link in docs; approval time unverified.

## Flow at ticket creation (BranchCheckInPage)

1. After ticket issued, show a card: "Nhận thông báo khi sắp đến lượt".
2. Primary (free): `followOA({ id: OA_ID })` → `getUserInfo()` → send `idByOA` to `POST /api/me/oa`.
   Alternative: `requestSendNotification()`.
3. Secondary (paid, merchant-funded): `getPhoneNumber()` with explanation → Worker decodes → store
   phone on ticket → ZNS eligible.
4. User can skip; ticket still works (live screen only). Don't block check-in on follow/phone — review
   rejects unclear/forced permission flows ✅.

## Dispatch (Worker)

Extend `ZnsDispatcherService` with a `NotificationRouter` implementing `ZnsSender`:

```
onTicketSeated/onCalled →
  if guest.zalo_oa_uid && withinWindow(guest)  → OA UID message (free)   [ledger: none]
  else if ticket has phone && wallet >= 400    → ZNS template             [ledger: ZNS_CALL_ALERT −400]
  else                                         → WS only, mark ticket.notify_status='UNREACHABLE'
```

- Keep the existing idempotency key (`znsApproachingIdempotencyKey`) for both channels.
- Two events: **approaching** (2 parties ahead — existing logic) and **called** (`CALLED` status → "Đến lượt bạn").
- Send from a Queue / `ctx.waitUntil`, not inline in the manager's request; retry with backoff.
- On OA "user unfollowed" webhook ⚠️ (OA webhook, separate from Mini App webhook) clear `zalo_oa_uid`.
- Show the manager (merchant-web) whether a guest is reachable, so staff can call aloud.
