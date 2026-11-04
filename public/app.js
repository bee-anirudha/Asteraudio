const payButton = document.getElementById('pay-button');
const resetButton = document.getElementById('reset-button');
const statusCard = document.querySelector('.status-card');
const journeyScene = document.getElementById('journey');
const main = document.querySelector('.main');
const couponForm = document.getElementById('coupon-form');
const couponInput = document.getElementById('coupon-code');
const couponFeedback = document.getElementById('coupon-feedback');
const accountWrap = document.getElementById('account-wrap');
const accountTrigger = document.getElementById('account-trigger');
const accountMenu = document.getElementById('account-menu');
let activeOrderId = null;
let currentOrder = null;
let appliedCoupon = null;
let signedIn = sessionStorage.getItem('aster-signed-out') !== 'true';

function text(id, value) { document.getElementById(id).textContent = value; }
function deliveryLabel(order) {
  if (!order?.estimatedDeliveryStart || !order?.estimatedDeliveryEnd) return '3–5 business days';
  const format = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return `${format(order.estimatedDeliveryStart)} – ${format(order.estimatedDeliveryEnd)}`;
}
function setMenuOpen(open) {
  accountMenu.hidden = !open;
  accountTrigger.setAttribute('aria-expanded', String(open));
}
function updateAccountUi() {
  document.querySelector('.shell').classList.toggle('signed-out', !signedIn);
  accountTrigger.classList.toggle('signed-out', !signedIn);
  text('account-trigger-label', signedIn ? 'Alex Morgan' : 'Sign in');
  document.getElementById('account-signed-in').hidden = !signedIn;
  document.getElementById('account-signed-out').hidden = signedIn;
  document.getElementById('account-order').disabled = !currentOrder?.orderId;
  text('shipping-name', signedIn ? 'Alex Morgan' : 'Sign in to view');
  text('pay-label', signedIn ? 'Place order' : 'Sign in to place order');
  document.querySelector('.button-right').hidden = !signedIn;
}
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
  updateAccountUi();
  if (order?.orderId) {
    appliedCoupon = order.couponCode || null;
    couponInput.value = appliedCoupon || '';
  }
  updatePricing();
  journeyScene.hidden = !order;
  main.classList.toggle('has-order', Boolean(order));
  statusCard.classList.remove('paid', 'error', 'processing');
  text('detail-order', order?.orderId || '—');
  text('detail-payment', order?.paymentId || '—');
  text('detail-status', order?.status === 'paid' ? 'Paid' : order?.status === 'error' ? 'Error' : 'Awaiting payment');
  text('delivery-date', deliveryLabel(order));
  text('status-delivery-date', deliveryLabel(order));
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

accountTrigger.addEventListener('click', () => setMenuOpen(accountMenu.hidden));
document.addEventListener('click', (event) => {
  if (!accountWrap.contains(event.target)) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !accountMenu.hidden) {
    setMenuOpen(false);
    accountTrigger.focus();
  }
});
document.getElementById('account-order').addEventListener('click', () => {
  setMenuOpen(false);
  if (!currentOrder?.orderId) return;
  if (window.matchMedia('(min-width: 800px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  else journeyScene.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('account-sign-out').addEventListener('click', () => {
  signedIn = false;
  sessionStorage.setItem('aster-signed-out', 'true');
  activeOrderId = null;
  render(null);
  setMenuOpen(false);
  accountTrigger.focus();
});
document.getElementById('account-sign-in').addEventListener('click', async () => {
  signedIn = true;
  sessionStorage.removeItem('aster-signed-out');
  setMenuOpen(false);
  accountTrigger.focus();
  const orders = await fetch('/api/orders').then(response => response.json()).catch(() => []);
  const latest = orders.at(-1) || null;
  activeOrderId = latest?.orderId || null;
  render(latest);
});

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
  if (!signedIn) {
    setMenuOpen(true);
    accountTrigger.focus();
    return;
  }
  activeOrderId = null;
  render({ status: 'processing', couponCode: appliedCoupon });
  const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  if (window.matchMedia('(min-width: 800px)').matches) window.scrollTo({ top: 0, behavior: scrollBehavior });
  else journeyScene.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
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
  if (signedIn && order.orderId === activeOrderId) render(order);
};
events.addEventListener('reset', () => render(null));

fetch('/api/orders').then(r => r.json()).then(orders => {
  if (!signedIn) return;
  const latest = orders.at(-1) || null;
  activeOrderId = latest?.orderId || null;
  render(latest);
});
updateAccountUi();
