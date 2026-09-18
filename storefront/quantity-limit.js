(function () {
  var API_BASE = 'https://bc-qty-limit.vercel.app';
  var APP_CLIENT_ID = '96m7ivetlymx4erslj6fzcv7v634ryj';
  var BYPASS_FLAG = '__qtyLimitPassed';

  function getCustomerJwt() {
    return fetch('/customer/current.jwt?app_client_id=' + APP_CLIENT_ID, {
      credentials: 'include',
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.text();
      })
      .catch(function () {
        return null;
      });
  }

  function checkLimit(jwtToken, productId, requestedQty) {
    return fetch(API_BASE + '/api/check-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt: jwtToken,
        productId: productId,
        requestedQty: requestedQty,
      }),
    }).then(function (res) {
      return res.json();
    });
  }

  function showError(form, message) {
    var existing = form.querySelector('.qty-limit-error');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'qty-limit-error';
    el.style.color = '#c0392b';
    el.style.marginTop = '8px';
    el.style.fontWeight = 'bold';
    el.textContent = message;
    form.appendChild(el);
  }

  function clearError(form) {
    var existing = form.querySelector('.qty-limit-error');
    if (existing) existing.remove();
  }

  function initProductPage() {
    // Capture phase on document = this runs BEFORE the theme's own click
    // handler on the button, no matter how or when the theme binds it.
    document.addEventListener(
      'click',
      function (evt) {
        var btn =
          evt.target.closest &&
          evt.target.closest(
            'form[data-cart-item-add] [type="submit"]'
          );
        if (!btn) return;

        // This is our own re-triggered click after a passed check - let it through.
        if (btn[BYPASS_FLAG]) {
          btn[BYPASS_FLAG] = false;
          return;
        }

        var form = btn.closest('form[data-cart-item-add]');
        if (!form) return;

        var productIdInput = form.querySelector('input[name="product_id"]');
        var qtyInput = form.querySelector('input[name="qty[]"], input[name="qty"]');
        if (!productIdInput) return;

        var productId = parseInt(productIdInput.value, 10);
        var requestedQty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

        // Block immediately, before ANY other handler (theme's AJAX call
        // or native form submission) can run.
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        clearError(form);

        getCustomerJwt().then(function (jwtToken) {
          checkLimit(jwtToken, productId, requestedQty).then(function (result) {
            if (result.allowed) {
              // Re-click for real, so the theme's normal add-to-cart runs.
              btn[BYPASS_FLAG] = true;
              btn.click();
            } else {
              showError(
                form,
                result.message || 'This quantity is not available for your account.'
              );
            }
          });
        });
      },
      true
    );
  }

  function initCartPage() {
    var isCartPage = /\/cart\.php/.test(window.location.pathname);
    if (!isCartPage) return;

    fetch('/api/storefront/carts', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (carts) {
        var cart = Array.isArray(carts) ? carts[0] : null;
        if (!cart) return;

        var lineItems = (cart.lineItems && cart.lineItems.physicalItems) || [];
        if (!lineItems.length) return;

        getCustomerJwt().then(function (jwtToken) {
          var checks = lineItems.map(function (item) {
            return checkLimit(jwtToken, item.productId, item.quantity).then(function (result) {
              return { item: item, result: result };
            });
          });

          Promise.all(checks).then(function (results) {
            var violations = results.filter(function (r) {
              return !r.result.allowed;
            });

            if (violations.length === 0) return;

            var checkoutBtn = document.querySelector(
              '[data-cart-checkout], .cart-actions [href*="checkout"]'
            );
            if (checkoutBtn) {
              checkoutBtn.setAttribute('disabled', 'true');
              checkoutBtn.style.pointerEvents = 'none';
              checkoutBtn.style.opacity = '0.5';
            }

            var banner = document.createElement('div');
            banner.style.background = '#fdecea';
            banner.style.color = '#c0392b';
            banner.style.padding = '12px';
            banner.style.marginBottom = '16px';
            banner.style.fontWeight = 'bold';
            banner.textContent = violations
              .map(function (v) {
                return v.result.message;
              })
              .join(' ');

            var cartContainer = document.querySelector('.cart, #cart, main') || document.body;
            cartContainer.insertBefore(banner, cartContainer.firstChild);
          });
        });
      })
      .catch(function () {
        /* fail silently on the cart page - the backend order webhook is the safety net */
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initProductPage();
    initCartPage();
  });
})();
