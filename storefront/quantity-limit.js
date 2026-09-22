(function () {
  var API_BASE = "https://bc-qty-limit.vercel.app";
  var APP_CLIENT_ID = "96m7ivetlymx4erslj6fzcv7v634ryj";
  var BYPASS_FLAG = "__qtyLimitPassed";

  function getCustomerJwt() {
    return fetch("/customer/current.jwt?app_client_id=" + APP_CLIENT_ID, {
      credentials: "include",
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
    return fetch(API_BASE + "/api/check-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jwt: jwtToken,
        productId: productId,
        requestedQty: requestedQty,
      }),
    }).then(function (res) {
      return res.json();
    });
  }

  function showFormError(form, message) {
    var existing = form.querySelector(".qty-limit-error");
    if (existing) existing.remove();

    var el = document.createElement("div");
    el.className = "qty-limit-error";
    el.style.color = "#c0392b";
    el.style.marginTop = "8px";
    el.style.fontWeight = "bold";

    if (message === "Please log in to purchase this product.") {
      el.innerHTML =
        'Please <a href="/login.php">log in</a> to purchase this product.';
    } else {
      el.textContent = message;
    }

    form.appendChild(el);
  }

  function clearFormError(form) {
    var existing = form.querySelector(".qty-limit-error");
    if (existing) existing.remove();
  }

  // ---------------------------------------------------------------------
  // Product detail page - unchanged, already confirmed working
  // ---------------------------------------------------------------------
  function initProductPage() {
    document.addEventListener(
      "click",
      function (evt) {
        var btn =
          evt.target.closest &&
          evt.target.closest('form[data-cart-item-add] [type="submit"]');
        if (!btn) return;

        if (btn[BYPASS_FLAG]) {
          btn[BYPASS_FLAG] = false;
          return;
        }

        if (btn.disabled) return; // already checking, ignore extra clicks

        var form = btn.closest("form[data-cart-item-add]");
        if (!form) return;

        var productIdInput = form.querySelector('input[name="product_id"]');
        var qtyInput = form.querySelector(
          'input[name="qty[]"], input[name="qty"]',
        );
        if (!productIdInput) return;

        var productId = parseInt(productIdInput.value, 10);
        var requestedQty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        clearFormError(form);
        btn.disabled = true;

        getCustomerJwt().then(function (jwtToken) {
          checkLimit(jwtToken, productId, requestedQty).then(function (result) {
            if (result.allowed) {
              btn[BYPASS_FLAG] = true;
              btn.disabled = false;
              btn.click();
            } else {
              showFormError(
                form,
                result.message ||
                  "This quantity is not available for your account.",
              );
              btn.disabled = false;
            }
          }).catch(function () {
            btn.disabled = false;
          });
        });
      },
      true,
    );
  }

  // ---------------------------------------------------------------------
  // Cart page
  // ---------------------------------------------------------------------
  // The theme's +/-/manual-qty controls fire their own AJAX update
  // (POST /remote/v1/cart/update) directly from their click/change handler.
  // Reacting AFTER that request is too late - the quantity is already
  // changed by the time we find out. So instead we intercept the click on
  // the +/- buttons and the change on the manual qty input, IN THE CAPTURE
  // PHASE (runs before the theme's own handler), check the limit first, and
  // only let the theme's handler run at all if the check passes - exactly
  // the same pattern already working on the product page.

  var cartLineItems = {}; // lineItemId -> { productId, quantity }

  function refreshCartLineItems() {
    return fetch("/api/storefront/carts", { credentials: "include" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (carts) {
        var cart = Array.isArray(carts) ? carts[0] : null;
        cartLineItems = {};
        if (!cart) return cartLineItems;

        var lineItems = (cart.lineItems && cart.lineItems.physicalItems) || [];
        lineItems.forEach(function (item) {
          cartLineItems[item.id] = {
            productId: item.productId,
            quantity: item.quantity,
          };
        });
        return cartLineItems;
      })
      .catch(function () {
        return cartLineItems;
      });
  }

  function findRow(el) {
    return el.closest("tr, .cart-qty-main") || el.parentElement;
  }

  function showRowError(el, message) {
    var row = findRow(el);
    if (!row) return;
    var existing = row.querySelector(".qty-limit-error");
    if (existing) existing.remove();

    var errEl = document.createElement("div");
    errEl.className = "qty-limit-error";
    errEl.style.color = "#c0392b";
    errEl.style.marginTop = "6px";
    errEl.style.fontWeight = "bold";
    errEl.textContent = message || "This quantity is not available for your account.";
    row.appendChild(errEl);
  }

  function clearRowError(el) {
    var row = findRow(el);
    if (!row) return;
    var existing = row.querySelector(".qty-limit-error");
    if (existing) existing.remove();
  }

  function handleIncClick(evt, btn) {
    if (btn.disabled) return; // already checking, ignore extra clicks

    var itemId = btn.getAttribute("data-cart-itemid");
    var lineItem = cartLineItems[itemId];

    // If we don't have this item cached yet, refresh once, then let the
    // NEXT click be checked (fail open on the very first click only, so a
    // stale cache never permanently blocks a legitimate increase).
    if (!lineItem) {
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      btn.disabled = true;
      refreshCartLineItems().then(function () {
        btn.disabled = false;
      });
      return;
    }

    var newQty = lineItem.quantity + 1;

    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    clearRowError(btn);
    btn.disabled = true;

    getCustomerJwt().then(function (jwtToken) {
      checkLimit(jwtToken, lineItem.productId, newQty).then(function (result) {
        if (result.allowed) {
          btn[BYPASS_FLAG] = true;
          btn.click();
          // Optimistically bump the cache; refreshed for real on next full check.
          lineItem.quantity = newQty;
          btn.disabled = false;
        } else {
          showRowError(
            btn,
            result.message ||
              "This quantity is not available for your account.",
          );
          btn.disabled = false;
        }
      }).catch(function () {
        btn.disabled = false; // never leave it stuck disabled on a network error
      });
    });
  }

  function handleManualQtyChange(evt, input) {
    if (input.disabled) return;

    var itemId = input.getAttribute("data-cart-itemid");
    var lineItem = cartLineItems[itemId];
    var newQty = parseInt(input.value, 10);

    if (!lineItem || !Number.isFinite(newQty)) return; // fail open, nothing cached to compare against

    // Only need to block increases - a decrease can never violate the limit.
    if (newQty <= lineItem.quantity) return;

    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();

    var previousValue = String(lineItem.quantity);
    clearRowError(input);
    input.disabled = true;

    getCustomerJwt().then(function (jwtToken) {
      checkLimit(jwtToken, lineItem.productId, newQty).then(function (result) {
        if (result.allowed) {
          input[BYPASS_FLAG] = true;
          lineItem.quantity = newQty;
          input.disabled = false;
          // Re-fire the change event for real so the theme's own handler runs.
          var realEvent = new Event("change", { bubbles: true });
          input.dispatchEvent(realEvent);
        } else {
          input.value = previousValue; // revert the visible value
          showRowError(
            input,
            result.message ||
              "This quantity is not available for your account.",
          );
          input.disabled = false;
        }
      }).catch(function () {
        input.disabled = false;
      });
    });
  }

  function initCartPage() {
    var isCartPage = /\/cart\.php/.test(window.location.pathname);
    if (!isCartPage) return;

    refreshCartLineItems();

    document.addEventListener(
      "click",
      function (evt) {
        var incBtn =
          evt.target.closest &&
          evt.target.closest('[data-cart-update][data-action="inc"]');
        if (incBtn) {
          if (incBtn[BYPASS_FLAG]) {
            incBtn[BYPASS_FLAG] = false;
            return;
          }
          handleIncClick(evt, incBtn);
        }
        // Decrease is never blocked - only re-sync our cache afterward.
        var decBtn =
          evt.target.closest &&
          evt.target.closest('[data-cart-update][data-action="dec"]');
        if (decBtn) {
          setTimeout(refreshCartLineItems, 500);
        }
      },
      true,
    );

    document.addEventListener(
      "change",
      function (evt) {
        var input =
          evt.target.closest &&
          evt.target.closest('[data-action="manualQtyChange"]');
        if (!input) return;

        if (input[BYPASS_FLAG]) {
          input[BYPASS_FLAG] = false;
          return;
        }
        handleManualQtyChange(evt, input);
      },
      true,
    );

    // Item removal changes totals but can only ever help compliance, so we
    // just resync the cache afterward rather than blocking it.
    document.addEventListener("click", function (evt) {
      var removeBtn = evt.target.closest && evt.target.closest(".cart-remove");
      if (removeBtn) setTimeout(refreshCartLineItems, 500);
    });
  }

  function showCardError(anchor, message) {
    var container =
      (anchor.closest && anchor.closest(".cart-action-buttons")) ||
      anchor.parentElement;
    if (!container) return;

    var existing = container.querySelector(".qty-limit-error");
    if (existing) existing.remove();

    var el = document.createElement("div");
    el.className = "qty-limit-error";
    el.style.color = "#c0392b";
    el.style.fontSize = "11px";
    el.style.marginTop = "6px";
    el.style.fontWeight = "bold";

    if (message === "Please log in to purchase this product.") {
      el.innerHTML =
        'Please <a href="/login.php">log in</a> to purchase this product.';
    } else {
      el.textContent = message;
    }

    container.appendChild(el);
  }

  function clearCardError(anchor) {
    var container =
      (anchor.closest && anchor.closest(".cart-action-buttons")) ||
      anchor.parentElement;
    if (!container) return;
    var existing = container.querySelector(".qty-limit-error");
    if (existing) existing.remove();
  }

  function getProductIdFromAddToCartLink(anchor) {
    if (anchor.dataset && anchor.dataset.productId) {
      return parseInt(anchor.dataset.productId, 10);
    }
    try {
      var url = new URL(anchor.href, window.location.origin);
      var idParam = url.searchParams.get("product_id");
      return idParam ? parseInt(idParam, 10) : null;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // "Add to Cart" links on shop/category/related-product cards.
  // These are plain <a href="cart.php?action=add&product_id=..."> links,
  // not a form with a submit button, so they need their own handler - but
  // the same block-first-then-recheck pattern as the product page.
  // ---------------------------------------------------------------------
  function initProductCards() {
    document.addEventListener(
      "click",
      function (evt) {
        var anchor =
          evt.target.closest &&
          evt.target.closest(
            'a[data-button-type="add-cart"], a[href*="cart.php?action=add"]',
          );
        if (!anchor) return;

        if (anchor[BYPASS_FLAG]) {
          anchor[BYPASS_FLAG] = false;
          return;
        }

        if (anchor.getAttribute("aria-busy") === "true") return; // already checking

        var productId = getProductIdFromAddToCartLink(anchor);
        if (!productId) return; // can't identify the product, let it through as-is

        var requestedQty = anchor.dataset && anchor.dataset.quantity
          ? parseInt(anchor.dataset.quantity, 10) || 1
          : 1;

        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        clearCardError(anchor);
        anchor.setAttribute("aria-busy", "true");
        anchor.style.pointerEvents = "none";
        anchor.style.opacity = "0.6";

        getCustomerJwt().then(function (jwtToken) {
          checkLimit(jwtToken, productId, requestedQty).then(function (result) {
            anchor.removeAttribute("aria-busy");
            anchor.style.pointerEvents = "";
            anchor.style.opacity = "";

            if (result.allowed) {
              anchor[BYPASS_FLAG] = true;
              anchor.click();
            } else {
              showCardError(
                anchor,
                result.message ||
                  "This quantity is not available for your account.",
              );
            }
          }).catch(function () {
            anchor.removeAttribute("aria-busy");
            anchor.style.pointerEvents = "";
            anchor.style.opacity = "";
          });
        });
      },
      true,
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initProductCards();
    initCartPage();
  });
})();