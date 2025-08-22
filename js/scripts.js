// scripts.js
// Toggle visibility of bubble panels with fade animation, default to About panel open, and keep the bubble visible when opened
// Removed click handler for header h1 to keep it non-clickable

document.addEventListener("DOMContentLoaded", () => {
  const bubbles = document.querySelectorAll(".prim-bubble");
  // Only generic bubble panels
  const panels = document.querySelectorAll(".bubble-panel");

  function hideAll() {
    panels.forEach(panel => {
      panel.classList.remove("show");
      panel.classList.remove("active");
      setTimeout(() => {
        panel.hidden = true;
      }, 300); // Delay hiding to allow animation
    });
    bubbles.forEach(b => b.classList.remove("active"));
  }

  function showPanel(id) {
    const panel = document.getElementById(id);
    const bubble = document.querySelector(`.prim-bubble[data-target="${id}"]`);
    if (panel && bubble) {
      panel.hidden = false;
      // Force reflow to restart animation
      void panel.offsetWidth;
      panel.classList.add("active", "show");
      bubble.classList.add("active");
    }
  }

  // Initialize: hide all then show About by default
  hideAll();
  showPanel("about");

  bubbles.forEach(bubble => {
    bubble.addEventListener("click", e => {
      e.preventDefault();
      const targetId = bubble.dataset.target;
      hideAll();
      setTimeout(() => showPanel(targetId), 300); // Delay to allow previous panel to fade out
    });

    bubble.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        bubble.click();
      }
    });
  });
});


document.addEventListener("DOMContentLoaded", () => {
  const projectPanel = document.getElementById("projects");
  if (!projectPanel) return;

  const subBubbles = [...projectPanel.querySelectorAll(".sub-bubble")];
  const subPanels  = [...projectPanel.querySelectorAll(".subpanel")];

  const getTargetId = (el) =>
    el?.dataset?.subtarget ||
    el?.getAttribute("aria-controls") ||
    (el?.getAttribute("href") || "").replace(/^#/, "") ||
    null;

  function hideAllSub() {
    subPanels.forEach(p => { p.classList.remove("show"); p.hidden = true; });
    subBubbles.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
  }

  function showSub(targetId, srcBtn) {
    if (!targetId) return;
    const panel = projectPanel.querySelector(`#${CSS.escape(targetId)}`);
    if (!panel) return;
    panel.hidden = false;          // critical: override the hidden attribute
    void panel.offsetWidth;        // restart transition
    panel.classList.add("show");
    if (srcBtn) {
      srcBtn.classList.add("active");
      srcBtn.setAttribute("aria-selected", "true");
      srcBtn.focus({ preventScroll: true });
    }
  }

  hideAllSub();
  const firstBtn = subBubbles[0];
  if (firstBtn) showSub(getTargetId(firstBtn), firstBtn);

  subBubbles.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const id = getTargetId(btn);
      if (!id || btn.getAttribute("aria-selected") === "true") return;
      hideAllSub(); showSub(id, btn);
    });
    btn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); }
    });
  });
});


// === Generic GitHub RAW Markdown autoloader ===
// Usage: <article class="md-include" data-md="owner/repo@ref:path.md"></article>
//        OR data-owner, data-repo, data-branch, data-file attributes.
// It renders once when the element (or its parent subpanel) becomes visible.

(function () {
  const ABSOLUTE_RE = /^(https?:)?\/|^data:|^#/i;

  function parseGhSpec(el) {
    // Priority: data-md shorthand; else separate attrs; else MD_DEFAULTS + data-file
    const spec = el.dataset.md;
    let owner, repo, ref, file;
    if (spec) {
      // owner/repo@ref:path
      const at = spec.indexOf("@");
      const colon = spec.indexOf(":");
      const slash = spec.indexOf("/");
      if (at > -1 && colon > -1) {
        const repoPart = spec.slice(0, at);          // owner/repo
        const refPart  = spec.slice(at + 1, colon);  // ref
        const filePart = spec.slice(colon + 1);      // path
        [owner, repo] = repoPart.split("/");
        ref  = refPart;
        file = filePart;
      } else {
        // owner/repo:path  (assume main)
        const c = spec.indexOf(":");
        const repoPart = spec.slice(0, c);
        const filePart = spec.slice(c + 1);
        [owner, repo] = repoPart.split("/");
        ref  = "main";
        file = filePart;
      }
    } else {
      owner = el.dataset.owner || (window.MD_DEFAULTS && MD_DEFAULTS.owner);
      repo  = el.dataset.repo  || (window.MD_DEFAULTS && MD_DEFAULTS.repo);
      ref   = el.dataset.branch|| (window.MD_DEFAULTS && MD_DEFAULTS.branch) || "main";
      file  = el.dataset.file;
    }
    if (!owner || !repo || !ref || !file) return null;
    const RAW_BASE  = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
    const BLOB_BASE = `https://github.com/${owner}/${repo}/blob/${ref}/`;
    return { RAW_BASE, BLOB_BASE, RAW_URL: RAW_BASE + file };
  }

  async function renderMarkdown(el) {
    if (!window.marked || !window.DOMPurify) {
      el.textContent = "Markdown libraries not loaded.";
      return;
    }
    const cfg = parseGhSpec(el);
    if (!cfg) { el.textContent = "Invalid data-md configuration."; return; }

    try {
      const res = await fetch(cfg.RAW_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const md = await res.text();

      marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
      const unsafeHtml = marked.parse(md);

      // Sanitize then insert
      el.innerHTML = DOMPurify.sanitize(unsafeHtml);
      el.removeAttribute("aria-busy");
      el.dataset.loaded = "1";

      // Fix relative images/links AFTER sanitize, to correct their URLs
      el.querySelectorAll("img[src]").forEach(img => {
        const src = img.getAttribute("src");
        if (!ABSOLUTE_RE.test(src)) img.src = new URL(src, cfg.RAW_BASE).href;
      });
      el.querySelectorAll("a[href]").forEach(a => {
        const href = a.getAttribute("href");
        if (!ABSOLUTE_RE.test(href)) a.href = new URL(href, cfg.BLOB_BASE).href;
        a.target = "_blank"; a.rel = "noopener noreferrer";
      });
    } catch (err) {
      console.error(err);
      el.textContent = "Failed to load Markdown.";
      el.removeAttribute("aria-busy");
    }
  }

  function whenVisible(el, cb) {
    // Prefer IntersectionObserver; fallback to MutationObserver on closest subpanel
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            obs.disconnect();
            cb();
            break;
          }
        }
      }, { rootMargin: "0px", threshold: 0.05 });
      io.observe(el);
      return;
    }
    // Fallback: watch nearest .subpanel/.bubble-panel for hidden/show changes
    const panel = el.closest(".subpanel, .bubble-panel") || document.body;
    const tryLoad = () => {
      const rect = el.getBoundingClientRect();
      const visible = (panel.hidden === false || panel.classList?.contains("show") || rect.width > 0);
      if (visible) { mo.disconnect(); cb(); }
    };
    const mo = new MutationObserver(tryLoad);
    mo.observe(panel, { attributes: true, attributeFilter: ["hidden", "class", "style"] });
    // Kick once in case it's already visible
    setTimeout(tryLoad, 0);
  }

  function initMdIncludes() {
    document.querySelectorAll(".md-include").forEach(el => {
      if (el.dataset.loaded === "1") return;
      whenVisible(el, () => renderMarkdown(el));
    });
  }

  document.addEventListener("DOMContentLoaded", initMdIncludes);
})();
