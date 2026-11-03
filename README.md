# Aster Audio checkout

A small checkout site for the **asynchronous payment flow** video. The site shows the order ID as soon as it is created. The server sends the payment request to Beeceptor. Beeceptor sends its delayed HTTP Callout to the separate [Aster Audio Backend](https://github.com/bee-anirudha/asteraudio-backend), which validates the event and confirms the order with this checkout service. The checkout marks the order **Paid** only after that confirmation. API details remain visible in Beeceptor Request History rather than the customer-facing site.

## Run it

Requires Node.js 20 or newer. No packages need installing.

```powershell
cd Asteraudio
$env:BEECEPTOR_PAYMENTS_URL = 'https://payments-acme-service.proxy.beeceptor.com/payments'
$env:CONFIRMATION_TOKEN = '<same-private-token-as-backend>'
npm start
```

Open <http://localhost:4173>. The server generates an order ID when **Place order** is clicked; the first order after starting the server is `ORD-1042`, followed by `ORD-1043`, and so on. The amount is `49.99 USD`. Without `BEECEPTOR_PAYMENTS_URL`, the app runs a local preview simulation. Set this variable to use the live Beeceptor endpoint.

## Configure Beeceptor

Create an HTTP Callout rule matching `POST /payments` and set its instant mock response to **202** with JSON:

```json
{"paymentId":"PAY-9001","status":"processing"}
```

Set the callout method to `POST` and its destination to the separate backend service URL plus `/webhooks/payments`. A local server cannot receive Beeceptor's remote callout without a public tunnel. Set minimum trigger delay to 2 seconds and maximum trigger delay to 5 seconds.

The app has no customer login or real wallet account. Set the same private `CONFIRMATION_TOKEN` on the checkout and backend services. The backend uses it when calling this app's `POST /api/payment-confirmations` route, which rejects requests without the matching token. The old `POST /webhooks/payments` route is temporarily retained during migration and will be removed after the backend is live.

Enable templating for the callout body. The current rule uses fixed `PAY-9001` in both the immediate response and the later webhook.

```json
{
  "event": "payment.completed",
  "data": {
    "paymentId": "PAY-9001",
    "orderId": "{{oReqBody 'orderId'}}",
    "amount": "{{oReqBody 'amount'}}",
    "currency": "{{oReqBody 'currency'}}",
    "status": "succeeded"
  }
}
```

The backend checks the event before forwarding it. This app verifies the event, order ID, payment ID, amount, and currency before marking the order Paid. The screen presents a $500.00 Acme Pay Wallet as an external payment provider; its balance is simulated and becomes $450.01 only after confirmation. Clicking **Place order** creates the order ID immediately, then scrolls from checkout to order status. It keeps data in memory, so restarting the server resets the recording setup. The **Shop again** button also clears the order and returns to checkout.

## Recording sequence

1. Open the checkout page and frame the product card.
2. Press **Place order**. The order ID appears immediately and the page moves to **Awaiting payment**.
3. Show the `202 Accepted` response in Beeceptor Request History, while the customer-facing **Order update** panel says **Awaiting payment**.
4. Show the callout to Aster Audio Backend, its confirmation to the checkout, and the site changing to **Payment successful**.
5. Press **Shop again** before another take.

The customer and address are fictional. The wallet is a demo balance; this app does not move real money.

## Deploy on Render

Create a **Web Service** from this repository with the **Free** plan, Node runtime, build command `npm install`, and start command `npm start`. Set `BEECEPTOR_PAYMENTS_URL` to `https://payments-acme-service.proxy.beeceptor.com/payments` and set `CONFIRMATION_TOKEN` to a private value shared with Aster Audio Backend. The backend calls `https://asteraudio.onrender.com/api/payment-confirmations`. Beeceptor calls the backend's public webhook URL, not this checkout service. Order data is stored in memory and resets when the service restarts or sleeps.
