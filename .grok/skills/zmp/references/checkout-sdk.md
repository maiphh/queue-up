# Checkout SDK

Source: https://docs.zaloplatforms.com/docs/MA/checkoutSdk/intro

All Mini Apps with payment must integrate Checkout SDK. Platform shows payment methods and records transactions.

## Integration modes

### Full (default)

1. Register payment methods (incl. provider secrets) in Mini App Center
2. Client: `CheckoutSDK.createOrder(order)` — SDK opens checkout UI
3. Client: listen `PaymentDone` → `CheckoutSDK.checkTransaction({ data })`
4. Server: verify webhook callback; never trust UI alone

### Custom (platform-approved partners)

Partner already has a payment rail. Platform shows method picker / confirmation; partner executes payment and reports status via server APIs.

## Client flow (full)

```ts
import { events, EventName, CheckoutSDK } from "zmp-sdk/apis";

events.on(EventName.PaymentDone, async (data) => {
  const result = await CheckoutSDK.checkTransaction({ data });
  // result.resultCode: 1 success | 0 pending | -1 failed | -2 user quit
});

await CheckoutSDK.createOrder(orderFromYourBackend);
```

SDK below 2.45.0 without `PaymentDone`: handle per payment method (see docs).

## Server

- Configure **Callback URL**
- Process payment webhook; update order state idempotently
- Use server APIs for `getOrderStatus`, `updateOrderStatus`, refunds — with secrets on server only

## Doc links

| Topic | Path |
|-------|------|
| Methods | `/docs/MA/checkoutSdk/method` |
| Errors | `/docs/MA/checkoutSdk/errorcodes` |
| Full: settings | `/docs/MA/checkoutSdk/integration-process/overview/setting` |
| Full: create order | `/docs/MA/checkoutSdk/integration-process/overview/order` |
| Full: MA result | `/docs/MA/checkoutSdk/integration-process/overview/maResult` |
| Full: server result | `/docs/MA/checkoutSdk/integration-process/overview/serverResult` |
| APIs | `createOrder`, `purchase`, `selectPaymentMethod`, `checkTransaction`, `getOrderStatus`, `updateOrderStatus`, `createRefund`, `getRefundStatus` |
| Webhooks | `/docs/MA/checkoutSdk/webhooks/callback`, `notify` |
