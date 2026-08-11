/**
 * loc.js — Website Localization Runtime (Module 4)
 * Lightweight JS runtime that applies published translations to any webpage.
 *
 * Usage:
 *   <script src="http://localhost:8000/runtime/loc.js" data-project="PROJECT_ID" async></script>
 *
 * Features:
 *  - Detects browser language via navigator.language
 *  - Fetches approved translations from the API
 *  - Caches translations in localStorage with version checking
 *  - Replaces text nodes only (preserves HTML structure, CSS, events)
 *  - Falls back to original text if translation is missing
 *  - Automatically refreshes cache when a new version is published
 */

(function () {
  "use strict";

  // ─── Language normalizer ────────────────────────────────────────────────────
  // Maps browser language codes (e.g. "es-MX", "es-419") to canonical names
  // that match the project's target_language field stored in the DB.
  var LANG_MAP = {
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
    it: "Italian",
    nl: "Dutch",
    ru: "Russian",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    ar: "Arabic",
    hi: "Hindi",
    tr: "Turkish",
    pl: "Polish",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    no: "Norwegian",
    cs: "Czech",
    ro: "Romanian",
    hu: "Hungarian",
    uk: "Ukrainian",
    vi: "Vietnamese",
    th: "Thai",
    id: "Indonesian",
    ms: "Malay",
    el: "Greek",
    he: "Hebrew",
    fa: "Persian",
    bn: "Bengali",
  };

  function getBrowserLang() {
    var raw = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    var code = raw.split("-")[0];
    return LANG_MAP[code] || null;
  }

  // ─── Script self-reference ──────────────────────────────────────────────────
  function getCurrentScript() {
    return (
      document.currentScript ||
      (function () {
        var scripts = document.getElementsByTagName("script");
        return scripts[scripts.length - 1];
      })()
    );
  }

  var scriptEl = getCurrentScript();
  var projectId = scriptEl ? scriptEl.getAttribute("data-project") : null;
  
  // Dynamically resolve backend API URL from the script's src
  var apiBase = "http://localhost:8000/api";
  if (scriptEl) {
    var src = scriptEl.getAttribute("src");
    if (src && (src.indexOf("http://") === 0 || src.indexOf("https://") === 0)) {
      var parts = src.split("/");
      if (parts.length >= 3) {
        apiBase = parts[0] + "//" + parts[2] + "/api";
      }
    }
  }
  var cacheKey = "loc_cache_" + projectId;

  if (!projectId) {
    console.warn("[loc.js] No data-project attribute found on script tag.");
    return;
  }

  // ─── localStorage cache helpers ─────────────────────────────────────────────
  function loadCache() {
    try {
      var raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCache(payload) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (e) {
      // Ignore storage errors (private mode, quota exceeded)
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem(cacheKey);
    } catch (e) {}
  }

  // ─── DOM replacement ─────────────────────────────────────────────────────────
  /**
   * Replace only the direct text nodes of an element, preserving child elements.
   * If translated text is blank/null, keep original — never blank out content.
   */
  function replaceTextNodes(el, translated) {
    if (!translated || translated.trim() === "") return; // safety: never blank

    // For simple elements with only text content, set textContent directly
    if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
      el.childNodes[0].nodeValue = translated;
      return;
    }

    // For elements with mixed content (text + child elements),
    // replace only the first meaningful text node
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== "") {
        node.nodeValue = translated;
        return;
      }
    }
  }

  /**
   * Find an element by CSS selector string.
   * Supports: tag, tag#id, tag.class, tag:nth-of-type(n), meta[name=description], title
   */
  function findElement(selector) {
    try {
      // Special cases
      if (selector === "title") return document.querySelector("title");
      if (selector === "meta[name=description]")
        return document.querySelector('meta[name="description"]');

      // img[alt='...'] — attribute selector
      if (selector.startsWith("img[alt=")) return document.querySelector(selector);

      // Standard CSS selector (id, class, nth-of-type)
      return document.querySelector(selector);
    } catch (e) {
      // Invalid selector — fallback to null
      return null;
    }
  }

  /**
   * Fallback: find an element in the DOM by matching its exact text content.
   */
  function findElementByText(originalText) {
    if (!originalText || originalText.trim() === "") return null;

    var tags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "a", "span", "li", "label"];
    var bestMatch = null;
    var cleanOriginal = originalText.trim();

    for (var i = 0; i < tags.length; i++) {
      var elems = document.getElementsByTagName(tags[i]);
      for (var j = 0; j < elems.length; j++) {
        var el = elems[j];
        if (el.textContent.trim() === cleanOriginal) {
          // Check if it has a direct text node child that matches
          for (var k = 0; k < el.childNodes.length; k++) {
            var node = el.childNodes[k];
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === cleanOriginal) {
              return el;
            }
          }
          bestMatch = el;
        }
      }
    }
    return bestMatch;
  }

  /**
   * Apply all translations to the DOM.
   */
  function applyTranslations(translations) {
    var applied = 0;
    var skipped = 0;

    translations.forEach(function (t) {
      if (!t.selector || !t.translated) {
        skipped++;
        return;
      }

      var el = findElement(t.selector);
      if (!el) {
        // Fallback: search for any element containing the exact original text
        el = findElementByText(t.original);
      }

      if (!el) {
        skipped++;
        return;
      }

      // Special: meta description sets content attribute
      if (el.tagName === "META") {
        el.setAttribute("content", t.translated);
        applied++;
        return;
      }

      // Special: <title> tag
      if (el.tagName === "TITLE") {
        document.title = t.translated;
        applied++;
        return;
      }

      replaceTextNodes(el, t.translated);
      applied++;
    });

    console.info(
      "[loc.js] Applied " + applied + " translations. Skipped " + skipped + " (selector not found)."
    );
  }


  // ─── Main fetch + apply logic ────────────────────────────────────────────────
  function fetchAndApply() {
    var url = apiBase + "/projects/" + projectId + "/runtime";
    var cached = loadCache();

    // First: check version from server without downloading full payload
    // We do a lightweight runtime fetch and compare version numbers
    fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.translations) {
          console.warn("[loc.js] No translation payload received.");
          return;
        }

        // Version check — if server version is newer than cached, update cache
        if (cached && cached.version === payload.version && cached.projectId === projectId) {
          console.info(
            "[loc.js] Cache hit (v" + cached.version + "). Using cached translations."
          );
          applyTranslations(cached.translations);
        } else {
          if (cached) {
            console.info(
              "[loc.js] New version detected (v" +
                cached.version +
                " → v" +
                payload.version +
                "). Refreshing cache."
            );
          }
          saveCache({
            projectId: projectId,
            version: payload.version,
            translations: payload.translations,
          });
          applyTranslations(payload.translations);
        }
      })
      .catch(function (err) {
        // If network fails and we have a cached payload, use it
        if (cached && cached.translations) {
          console.warn(
            "[loc.js] Network error, using cached translations (v" + cached.version + ")."
          );
          applyTranslations(cached.translations);
        } else {
          console.warn("[loc.js] Network error and no cache available. Page unchanged.");
        }
      });
  }

  // ─── Language gate ───────────────────────────────────────────────────────────
  // Only proceed if the browser language matches the project's target language.
  // We fetch the runtime payload first to get target_language, then check.
  function init() {
    var browserLang = getBrowserLang();
    if (!browserLang) {
      console.info("[loc.js] Browser language not recognized. Page unchanged.");
      return;
    }

    // Fetch runtime to check language match
    var url = apiBase + "/projects/" + projectId + "/runtime";
    fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload) return;
        if (!payload.translations || payload.translations.length === 0) {
          console.info("[loc.js] No published translations found. Page unchanged.");
          return;
        }

        var targetLang = (payload.target_language || "").toLowerCase();
        var browserLangLower = browserLang.toLowerCase();

        if (targetLang !== browserLangLower) {
          console.info(
            "[loc.js] Browser language (" +
              browserLang +
              ") does not match project language (" +
              payload.target_language +
              "). Page unchanged."
          );
          return;
        }

        // Check localStorage cache and version
        var cached = loadCache();
        if (cached && cached.version === payload.version && cached.projectId === projectId) {
          console.info("[loc.js] Cache hit (v" + cached.version + "). Applying cached translations.");
          applyTranslations(cached.translations);
        } else {
          if (cached) {
            console.info("[loc.js] Version update: v" + cached.version + " → v" + payload.version + ". Refreshing.");
          }
          saveCache({ projectId: projectId, version: payload.version, translations: payload.translations });
          applyTranslations(payload.translations);
        }
      })
      .catch(function (err) {
        // Fallback to cache on network failure
        var cached = loadCache();
        if (cached && cached.translations) {
          console.warn("[loc.js] Offline fallback: applying cached translations (v" + cached.version + ").");
          applyTranslations(cached.translations);
        }
      });
  }

  // ─── Entry point ─────────────────────────────────────────────────────────────
  // Run after DOM is fully loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
