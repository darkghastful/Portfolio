document.addEventListener("DOMContentLoaded", () => {
  const HIDE_DELAY = 300; 

  document.querySelectorAll("nav.bubbles").forEach(initNav);

  function initNav(nav) {
    const rootSection = nav.closest("section") || document;
    const links = Array.from(nav.querySelectorAll("[data-target]")).filter(a => a.dataset.target);
    if (!links.length) return;

    const panels = links
      .map(a => findPanel(rootSection, a.dataset.target))
      .filter(Boolean);

    let hideTimer = null;

    function cssEscape(id) {
      return (window.CSS && CSS.escape) ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9\-_]/g, "\\$&");
    }

    function findPanel(scope, id) {
      const sel = `#${cssEscape(id)}`;
      // If scoped to a section, do not leak to document-level
      if (nav.closest("section")) return scope.querySelector(sel);
      return document.querySelector(sel);
    }

    function hideAll({ instant = false } = {}) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      panels.forEach(p => {
        p.classList.remove("active", "show");
        if (instant) p.hidden = true;
      });
      if (!instant) {
        hideTimer = setTimeout(() => {
          panels.forEach(p => (p.hidden = true));
          hideTimer = null;
        }, HIDE_DELAY);
      }
      links.forEach(a => a.classList.remove("active"));
    }

    function showPanel(id) {
      const panel = findPanel(rootSection, id);
      const link  = links.find(a => a.dataset.target === id);
      if (!panel || !link) return;

      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } // don't re-hide what we're showing
      panel.hidden = false;
      void panel.offsetWidth; // restart CSS transition
      panel.classList.add("active", "show");
      link.classList.add("active");
    }

    // INIT: instant hide, then show the FIRST button's panel
    hideAll({ instant: true });
    showPanel(links[0].dataset.target);

    // Clicks: fade out then show target
    nav.addEventListener("click", (e) => {
      const a = e.target.closest("[data-target]");
      const link = e.target.closest('a');

      if (!link) return;
      if (link.hasAttribute('download')) {
        return; // no preventDefault, no panel toggling
      }

      if (!a || !nav.contains(a)) return;
      e.preventDefault();
      hideAll();
      setTimeout(() => showPanel(a.dataset.target), HIDE_DELAY);
    });

    // Keyboard (Enter/Space)
    nav.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const a = e.target.closest("[data-target]");
      if (!a || !nav.contains(a)) return;
      e.preventDefault();
      a.click();
    });

    // If this nav sits inside a section that starts hidden,
    // auto-show its first panel when the section becomes visible.
    const containerSection = nav.closest("section");
    if (containerSection) {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.attributeName === "hidden" && containerSection.hidden === false) {
            if (!panels.some(p => !p.hidden)) {
              showPanel(links[0].dataset.target);
            }
          }
        }
      });
      mo.observe(containerSection, { attributes: true, attributeFilter: ["hidden"] });
    }
  }
});

(function () {
  const ABSOLUTE_RE = /^(https?:)?\/|^data:|^#/i;

  function parseGhSpec(el) {
    // Priority: data-md shorthand; else separate attrs; else MD_DEFAULTS + data-file
    const spec = el.dataset.md;
    let owner, repo, ref, file;
    if (spec) {
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



(function initExactPDF() {
  const url = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
  const worker = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  function start() {
    // Render every .pdf-exact holder on the page
    document.querySelectorAll(".pdf-exact").forEach(async (holder) => {
      const pdfUrl = holder.dataset.pdf;
      if (!pdfUrl) return;

      const pdf = await pdfjsLib.getDocument(pdfUrl).promise;

      // Render all pages; set to 1 if you only want the first page
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);

        // Scale 1 == actual PDF CSS pixel size; upscale for HiDPI but keep CSS size exact
        const viewport = page.getViewport({ scale: 1 });
        const ratio = window.devicePixelRatio || 1;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        holder.appendChild(canvas);

        await page.render({
          canvasContext: ctx,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0], // HiDPI crispness without changing CSS size
        }).promise;
      }
    });
  }

  // Lazy-load pdf.js then start
  const s = document.createElement("script");
  s.src = url;
  s.onload = () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
    start();
  };
  document.head.appendChild(s);
})();
