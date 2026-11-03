# Aster Audio checkout

A small checkout site for the **asynchronous payment flow** video. The site shows the order ID as soon as it is created. The server then sends the payment request to Beeceptor and marks the order **Paid** only after a matching webhook arrives. API details remain visible in Beeceptor Request History rather than the customer-facing site.

## Run it

Requires Node.js 20 or newer. No packages need installing.

```powershell
cd Asteraudio
$env:BEECEPTOR_PAYMENTS_URL = 'https://payments-acme-service.proxy.beeceptor.com/payments'
npm start
```

Open <http://localhost:4173>. The server generates an order ID when **Place order** is clicked; the first order after starting the server is `ORD-1042`, followed by `ORD-1043`, and so on. The amount is `49.99 USD`. Without `BEECEPTOR_PAYMENTS_URL`, the app runs a local preview simulation. Set this variable to use the live Beeceptor endpoint.

## Configure Beeceptor

Create an HTTP Callout rule matching `POST /payments` and set its instant mock response to **202** with JSON:

```json
{"paymentId":"PAY-9001","status":"processing"}
```

Set the callout method to `POST` and its destination to your publicly reachable app URL plus `/webhooks/payments`. A local server at `localhost:4173` cannot receive Beeceptor's remote callout; use a public tunnel or deploy this server somewhere reachable. Set minimum trigger delay to 2 seconds and maximum trigger delay to 5 seconds.

The app has no customer login or real wallet account. To authenticate the incoming webhook, optionally set `WEBHOOK_SECRET` when starting the server and send the same value in the callout's `X-Demo-Secret` header. The server rejects calls with a missing or different value. This secret is only for the webhook; the current checkout and reset routes are demo routes without login.

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

The app verifies the event, order ID, payment ID, amount, and currency before marking the order Paid. The screen presents a $500.00 Acme Pay Wallet as an external payment provider; its balance is simulated and becomes $450.01 only after confirmation. Clicking **Place order** creates the order ID immediately, then scrolls from checkout to order status. It keeps data in memory, so restarting the server resets the recording setup. The **Shop again** button also clears the order and returns to checkout.

## Recording sequence

1. Open the checkout page and frame the product card.
2. Press **Place order**. The order ID appears immediately and the page moves to **Awaiting payment**.
3. Show the `202 Accepted` response in Beeceptor Request History, while the customer-facing site says **Payment processing**.
4. Show the callout and the site changing to **Payment successful** when it arrives.
5. Press **Shop again** before another take.

The customer and address are fictional. The wallet is a demo balance; this app does not move real money.

## Deploy on Render

Create a **Web Service** from this repository with the **Free** plan, Node runtime, build command `npm install`, and start command `npm start`. Set `BEECEPTOR_PAYMENTS_URL` to `https://payments-acme-service.proxy.beeceptor.com/payments`. After Render gives the service its public URL, change the Beeceptor callout target to `https://YOUR-SERVICE.onrender.com/webhooks/payments`. The hosted app receives the webhook directly; a local tunnel is not needed. Order data is stored in memory and resets when the service restarts or sleeps.
