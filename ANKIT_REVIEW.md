# HTTP Callout use-case review

**Approval gate:** Walk Ankit through all three services and get use-case approval before recording. The [video script](https://docs.google.com/document/d/1BVple4wZmPGfr6XcOhTm3U5L153WO_bO-8eq3-KgAKM/edit?tab=t.jjvlaojo1706) has not been edited for this architecture; review its destination URL, labels, and payloads before filming.

## The use case

Aster Audio accepts an order paid through Acme Pay Wallet. Its server calls a virtual payment API at Beeceptor. Beeceptor acknowledges the payment request immediately, then sends a `payment.completed` webhook after 2–5 seconds to **Aster Audio Backend**. The backend validates the event and confirms the order with Aster Audio. The checkout marks the order Paid only after accepting that confirmation. This is a simulated wallet flow; no money moves.

## Setup to show

- Hosted checkout: https://asteraudio.onrender.com/
- Confirmation service and activity dashboard: https://asteraudio-backend.onrender.com/
- Beeceptor console: https://app.beeceptor.com/console/payments-acme-service
- App environment variable: `BEECEPTOR_PAYMENTS_URL=https://payments-acme-service.proxy.beeceptor.com/payments`
- Rule: enabled HTTP Callout, matching `POST /payments` by exact path. Description in Beeceptor: **Acme Pay Wallet: immediate acknowledgment and delayed payment webhook**.
- Synchronous Response Configuration: **Return an immediate mock response (asynchronous)**; 0-second response delay; HTTP `202`; `Content-Type: application/json;charset=utf-8`; dynamic templating enabled; response body:

```json
{"paymentId":"PAY-{{body 'orderId'}}","status":"processing"}
```

- Asynchronous Request Configuration (HTTP Callout): `POST https://asteraudio-backend.onrender.com/webhooks/payments`; **Build a custom payload**; Authentication Method **None**; Minimum Trigger Delay **2 sec**; Maximum Trigger Delay **5 sec**; `Content-Type: application/json;charset=utf-8`; dynamic templating enabled; request body:

```json
{
  "event": "payment.completed",
  "data": {
    "paymentId": "PAY-{{oReqBody 'orderId'}}",
    "orderId": "{{oReqBody 'orderId'}}",
    "amount": "{{oReqBody 'amount'}}",
    "currency": "{{oReqBody 'currency'}}",
    "status": "succeeded"
  }
}
```

No order ID or payment ID is fixed in the rule. Beeceptor derives the payment ID from the incoming order ID in both the instant response and the callout. The amount and currency also come from the incoming request.

The backend calls `POST https://asteraudio.onrender.com/api/payment-confirmations` using a private shared confirmation token. Aster Audio checks the order ID, payment ID, amount, currency, and event before marking the order Paid. Do not show the private token in the recording.

## App walkthrough for approval

1. Open the backend dashboard first to wake its free Render instance, then open checkout. Leave the `ASTER10` coupon unapplied, so the total is **$49.99** and Acme Pay Wallet starts at **$500.00**.
2. Click **Place order**. The app creates an order number immediately. The **Order update** panel appears and says **Awaiting payment**. Note the generated order number; it can differ between runs.
3. Open the matching Beeceptor Request History entry. The app server sent `POST /payments` with `{"orderId":"<ORDER_ID>","amount":"49.99","currency":"USD"}`. Beeceptor returned HTTP `202` and `{"paymentId":"PAY-<ORDER_ID>","status":"processing"}`.
4. In that same history entry, show **Callout Request** to Aster Audio Backend. Its rendered body is `{"event":"payment.completed","data":{"paymentId":"PAY-<ORDER_ID>","orderId":"<ORDER_ID>","amount":"49.99","currency":"USD","status":"succeeded"}}`. The backend returns HTTP `200` and `{"confirmed":true,"orderId":"<ORDER_ID>","paymentId":"PAY-<ORDER_ID>"}` after Aster Audio accepts the confirmation.
5. Open the backend dashboard and show the same order number with **Confirmed** status.
6. Return to the checkout. The headline is **Payment successful**, the **Status** field is **Paid**, the **Payment confirmed** step is complete, and the wallet balance is **$450.01**.

The app displays customer-facing order status. HTTP codes and raw event bodies are shown in Beeceptor Request History. Use the actual order number from the selected request throughout the recording and script graphics. If a coupon is applied, the outbound request also contains `couponCode` and `discount`, and the amount changes to `44.99`; that is a different take from the script above.

## Approval question

Does this simulated wallet payment flow, with an immediate `202` response followed by a delayed webhook that updates the order, work as the use case for the tutorial? After approval, capture one clean transaction and substitute its generated order number for `<ORDER_ID>` everywhere in the script and on-screen graphics before recording.
