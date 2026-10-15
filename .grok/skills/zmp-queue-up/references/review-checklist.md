# Privacy, data deletion, and review pre-submission

## Privacy

- Publish a Vietnamese privacy policy (+ terms) on our domain; link it in Mini App Center and in-app
  (profile/footer). ⚠️ Exact console field not verified.
- Declare data collected: Zalo user id, name/avatar (optional), phone (optional, for ZNS),
  OA UID, approximate location (not stored), ticket history. Retention: e.g. tickets 90 days.
- Vietnam Decree 13/2023/NĐ-CP on personal data applies ⚠️ (legal review, not verified here).

## Data deletion webhook ✅

Zalo POSTs to the Mini App **Webhook URL** with header `X-ZEvent-Signature`:

```json
{ "event": "user.revoke.consent", "appId": "…", "userId": "…", "timestamp": 1670553442564 }
```

Add `POST /api/webhooks/zalo-miniapp` in `routes/webhooks.ts`:
1. Verify signature (algorithm per `/docs/MA/openApis/open/webhook/verifysignature` ⚠️ read before coding).
2. Find `guest_users` by `zalo_user_id = userId`; null out name/avatar/phone/OA uid, set `deleted_at`;
   anonymize `tickets.customer_name`, phone columns. Keep aggregated counts.
3. Return 200 fast; idempotent.

⚠️ Whether `userId` equals the Graph `/me` `id` — confirm with one real event.

## Pre-submission checklist

Generic rules: `../../zmp/references/lifecycle.md` §4. LượtĐi-specific:

- [ ] KYB/verification done; category matches (dịch vụ / xếp hàng — pick closest) ⚠️ category name.
- [ ] Name "LượtĐi", logo, description consistent everywhere.
- [ ] Permissions requested in console with reasons + screenshots: user info, phone, location, QR scan, OA follow, notification.
- [ ] Each permission asked in context with explanation; app usable when denied.
- [ ] Login via Zalo only — no username/password for guests ✅ (password login can get search disabled).
- [ ] No redirects to external sites/apps; no forced share/follow.
- [ ] Works from a branch QR cold start and from Mini App search with no params (marketplace).
- [ ] No crashes on deny / offline / expired JWT; loading states; paused branch message.
- [ ] Bundle < 10 MB, files < 3 MB; images via CDN; first load tested on low-end Android.
- [ ] Privacy policy link reachable in-app; webhook URL configured and tested.
- [ ] CORS for `https://h5.zdn.vn` live on production Worker; production `VITE_API_BASE`.
- [ ] Testing version deployed with Vietnamese changelog and reviewer notes (demo branch QR link +
      how to get a ticket; seed a demo branch that is always open).
