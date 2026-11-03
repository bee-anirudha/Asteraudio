const payButton = document.getElementById('pay-button');
const resetButton = document.getElementById('reset-button');
const statusCard = document.querySelector('.status-card');
const journeyScene = document.getElementById('journey');
const couponForm = document.getElementById('coupon-form');
const couponInput = document.getElementById('coupon-code');
const couponFeedback = document.getElementById('coupon-feedback');
let activeOrderId = null;
let currentOrder = null;
let appliedCoupon = null;

function text(id, value) { document.getElementById(id).textContent = value; }
function updatePricing() {
  const discounted = appliedCoupon === 'ASTER10';
  document.getElementById('discount-row').hidden = !discounted;
  text('order-total', discounted ? '$44.99' : '$49.99');
  text('button-total', discounted ? '$44.99' : '$49.99');
  couponInput.disabled = discounted || Boolean(currentOrder?.orderId);
  document.getElementById('coupon-button').textContent = discounted ? 'Remove' : 'Apply';
  document.getElementById('coupon-button').disabled = Boolean(currentOrder?.orderId);
  couponFeedback.classList.remove('error');
  couponFeedback.textContent = discounted ? '10% discount applied.' : '';
}
function step(name, state) {
  const element = document.getElementById(`step-${name}`);
  element.className = `timeline-item ${state}`;
  text(`state-${name}`, state === 'complete' ? 'Complete' : state === 'active' ? 'In progress' : 'Waiting');
  element.querySelector('.timeline-dot').textContent = state === 'complete' ? '✓' : { request: '1', response: '2', webhook: '3' }[name];
}

function render(order) {
  currentOrder = order;
  if (order?.orderId) {
    appliedCoupon = order.couponCode || null;
    couponInput.value = appliedCoupon || '';
  }
  updatePricing();
  journeyScene.hidden = !order;
  statusCard.classList.remove('paid', 'error', 'processing');
  text('detail-order', order?.orderId || '—');
  text('detail-payment', order?.paymentId || '—');
  text('detail-status', order?.status === 'paid' ? 'Paid' : order?.status === 'error' ? 'Error' : 'Awaiting payment');
  text('wallet-balance', `$${order?.walletBalance || '500.00'}`);
  text('order-reference', order?.orderId || '');
  if (!order) {
    text('status-overline', 'PAYMENT IN PROGRESS');
    text('status-title', 'Awaiting payment');
    text('status-description', 'Your wallet payment is being confirmed. You can leave this page open.');
    text('status-icon', '⋯');
    step('request', ''); step('response', ''); step('webhook', '');
    payButton.disabled = false;
    return;
  }
  step('request', 'complete');
  if (order.status === 'error') {
    statusCard.classList.add('error');
    text('status-overline', 'PAYMENT NOT COMPLETED');
    text('status-title', 'Payment unsuccessful');
    text('status-description', order.error || 'Please try placing your order again.');
    text('status-icon', '!');
    step('response', ''); step('webhook', '');
    payButton.disabled = false;
    return;
  }
  if (order.paymentId) step('response', 'complete');
  else step('response', 'active');
  if (order.status === 'paid') {
    statusCard.classList.add('paid');
    text('status-overline', 'ORDER CONFIRMED');
    text('status-title', 'Payment successful');
    text('status-description', `Thanks, Alex. Order ${order.orderId} is confirmed.`);
    text('status-icon', '✓');
    step('webhook', 'complete');
    payButton.disabled = true;
  } else {
    statusCard.classList.add('processing');
    text('status-overline', order.orderId ? 'PAYMENT IN PROGRESS' : 'PLACING YOUR ORDER');
    text('status-title', order.orderId ? 'Awaiting payment' : 'Placing your order…');
    text('status-description', order.orderId ? 'Your wallet payment is being confirmed. You can leave this page open.' : 'We’re receiving your order.');
    text('status-icon', order.orderId ? '⋯' : '↗');
    step('webhook', order.paymentId ? 'active' : '');
    payButton.disabled = true;
  }
}

couponForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (appliedCoupon) {
    appliedCoupon = null;
    couponInput.value = '';
    updatePricing();
    couponInput.focus();
    return;
  }
  if (couponInput.value.trim().toUpperCase() !== 'ASTER10') {
    couponFeedback.textContent = 'That code isn’t valid. Try ASTER10.';
    couponFeedback.classList.add('error');
    return;
  }
  appliedCoupon = 'ASTER10';
  couponInput.value = appliedCoupon;
  updatePricing();
});

payButton.addEventListener('click', async () => {
  activeOrderId = null;
  render({ status: 'processing', couponCode: appliedCoupon });
  journeyScene.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  try {
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ couponCode: appliedCoupon }) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || `Checkout failed (${response.status}).`), { orderId: body.orderId });
    activeOrderId = body.orderId;
    render({ ...(currentOrder || {}), orderId: body.orderId, status: currentOrder?.status === 'paid' ? 'paid' : 'processing' });
    fetch('/api/orders').then(result => result.json()).then(orders => {
      const latest = orders.find(order => order.orderId === activeOrderId);
      if (latest && currentOrder?.status !== 'paid') render(latest);
    }).catch(() => {});
  } catch (error) {
    activeOrderId = error.orderId || null;
    render({ orderId: activeOrderId, status: 'error', error: error.message });
  }
});

resetButton.addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  activeOrderId = null;
  appliedCoupon = null;
  couponInput.value = '';
  render(null);
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

const events = new EventSource('/api/events');
events.onmessage = (event) => {
  const order = JSON.parse(event.data);
  if (order.orderId === activeOrderId) render(order);
};
events.addEventListener('reset', () => render(null));

fetch('/api/orders').then(r => r.json()).then(orders => {
  const latest = orders.at(-1) || null;
  activeOrderId = latest?.orderId || null;
  render(latest);
});
