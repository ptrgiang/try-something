/*
 * ship-analytics.js: PostHog the Ship Standard way (rules V1, V2, V3, V5), for any stack, one script tag.
 *
 *   <script>
 *     window.SHIP_ANALYTICS = {
 *       productId: "my-product",          // Ship product id (required)
 *       productVersion: "0.4.0",          // package.json version (recommended)
 *       posthogKey: "phc_...",            // PostHog project API key (public; required)
 *       apiHost: "/ingest",               // same-origin reverse proxy (recommended) or https://us.i.posthog.com
 *       uiHost: "https://us.posthog.com",
 *       mode: "standard",                 // "privacy": nothing stored in the browser, no UTM persistence
 *       consent: "none",                  // "required": nothing loads until ship.grantConsent()
 *       spa: true,                        // capture $pageview on pushState/popstate navigation
 *       posthogOptions: {}                // extra posthog-js init options; person_profiles and respect_dnt can't be overridden
 *     };
 *   </script>
 *   <script src="/ship-analytics.js" defer></script>
 *
 * Then: ship.capture("checkout_started"), ship.checkoutMetadata({ pricing_stage: "early_bird" }) for the
 * Polar checkout request, ship.grantConsent() / ship.revokeConsent() from the product's consent banner.
 * Do Not Track and Global Privacy Control turn everything off. No PII is ever added here.
 */
(function () {
  "use strict";
  var w = window;
  var cfg = w.SHIP_ANALYTICS || {};
  var UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var STORE_KEY = "ship_attribution";
  var CONSENT_KEY = "ship_analytics_consent";
  var privacy = cfg.mode === "privacy";
  var memory = {};
  var posthog = null;
  var queue = [];
  var loading = false;

  function optedOut() {
    var n = w.navigator || {};
    return n.doNotTrack === "1" || w.doNotTrack === "1" || n.globalPrivacyControl === true;
  }

  function readStore(key) {
    if (privacy) return memory[key];
    try {
      var v = w.localStorage.getItem(key);
      return v ? JSON.parse(v) : undefined;
    } catch (e) {
      return memory[key];
    }
  }

  function writeStore(key, value) {
    memory[key] = value;
    if (privacy) return;
    try {
      if (value === undefined) w.localStorage.removeItem(key);
      else w.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage blocked: keep it in memory */
    }
  }

  /** UTMs on this URL, or null. Values are trimmed to 200 characters. */
  function utmFrom(search) {
    var params = new URLSearchParams(search || "");
    var out = {};
    var any = false;
    for (var i = 0; i < UTM.length; i++) {
      var v = params.get(UTM[i]);
      if (v) {
        out[UTM[i]] = v.slice(0, 200);
        any = true;
      }
    }
    return any ? out : null;
  }

  /** First touch is written once; last touch is replaced whenever a URL carries UTMs. */
  function recordTouch() {
    var a = readStore(STORE_KEY) || {};
    var touch = utmFrom(w.location && w.location.search);
    if (touch) {
      if (!a.first) a.first = touch;
      a.last = touch;
      writeStore(STORE_KEY, a);
    }
    return a;
  }

  function superProperties(a) {
    var p = { product_id: cfg.productId };
    if (cfg.productVersion) p.product_version = cfg.productVersion;
    for (var i = 0; i < UTM.length; i++) {
      var k = UTM[i];
      if (a.last && a.last[k]) p[k] = a.last[k];
      if (a.first && a.first[k]) p["ft_" + k] = a.first[k];
    }
    return p;
  }

  function consentGiven() {
    if (cfg.consent !== "required") return true;
    return readStore(CONSENT_KEY) === "granted";
  }

  function flush() {
    while (posthog && queue.length) {
      var item = queue.shift();
      posthog.capture(item[0], item[1]);
    }
  }

  function load() {
    if (loading || posthog || !cfg.posthogKey || !cfg.productId || optedOut() || !consentGiven()) return;
    loading = true;
    var apiHost = (cfg.apiHost || "https://us.i.posthog.com").replace(/\/+$/, "");
    var src = cfg.scriptSrc || (apiHost.indexOf("http") === 0 ? apiHost.replace(".i.posthog.com", "-assets.i.posthog.com") : apiHost) + "/static/array.js";
    var s = w.document.createElement("script");
    s.async = true;
    s.src = src;
    s.onload = function () {
      var ph = w.posthog;
      if (!ph || typeof ph.init !== "function") return;
      var options = {
        api_host: apiHost,
        ui_host: cfg.uiHost || "https://us.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false, // captured below, so SPA navigation is handled the same way everywhere
        capture_pageleave: true,
        autocapture: cfg.autocapture === true,
        disable_session_recording: cfg.sessionRecording !== true,
        persistence: privacy ? "memory" : "localStorage+cookie",
        respect_dnt: true,
      };
      // Product-specific posthog-js options (bootstrap, before_send, ...). The PII and DNT defaults above stay.
      var extra = cfg.posthogOptions || {};
      for (var o in extra) if (o !== "person_profiles" && o !== "respect_dnt") options[o] = extra[o];
      ph.init(cfg.posthogKey, options);
      ph.register(superProperties(recordTouch()));
      posthog = ph;
      flush();
    };
    w.document.head.appendChild(s);
  }

  function capture(event, properties) {
    if (optedOut()) return;
    queue.push([event, properties || {}]);
    if (queue.length > 100) queue.shift();
    flush();
    load();
  }

  var lastPath = null;
  function pageview() {
    var path = w.location ? w.location.pathname + w.location.search : "";
    if (path === lastPath) return;
    lastPath = path;
    var a = recordTouch();
    if (posthog) posthog.register(superProperties(a));
    capture("$pageview");
  }

  if (cfg.spa) {
    var h = w.history;
    if (h && h.pushState) {
      ["pushState", "replaceState"].forEach(function (name) {
        var original = h[name];
        h[name] = function () {
          var r = original.apply(this, arguments);
          setTimeout(pageview, 0);
          return r;
        };
      });
      w.addEventListener("popstate", function () {
        setTimeout(pageview, 0);
      });
    }
  }

  w.ship = {
    capture: capture,
    pageview: pageview,
    /** Attribution for the Polar checkout `metadata` (rule R2). Only non-empty strings are included. */
    checkoutMetadata: function (extra) {
      var a = recordTouch();
      var m = { product_id: cfg.productId };
      var id = posthog && posthog.get_distinct_id ? posthog.get_distinct_id() : null;
      if (id) m.posthog_distinct_id = String(id);
      var props = superProperties(a);
      for (var k in props) if (k.indexOf("utm_") === 0 || k.indexOf("ft_utm_") === 0) m[k] = props[k];
      if (extra) for (var e in extra) if (typeof extra[e] === "string" && extra[e]) m[e] = extra[e];
      return m;
    },
    grantConsent: function () {
      writeStore(CONSENT_KEY, "granted");
      load();
    },
    revokeConsent: function () {
      writeStore(CONSENT_KEY, "denied");
      if (posthog && posthog.opt_out_capturing) posthog.opt_out_capturing();
      writeStore(STORE_KEY, undefined);
    },
    _utmFrom: utmFrom,
  };

  recordTouch();
  pageview();
})();
