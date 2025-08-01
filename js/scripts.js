// scripts.js
// Toggle visibility of bubble panels with fade animation, default to About panel open, and keep the bubble visible when opened
// Removed click handler for header h1 to keep it non-clickable

document.addEventListener("DOMContentLoaded", () => {
  const bubbles = document.querySelectorAll(".bubble");
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
    const bubble = document.querySelector(`.bubble[data-target="${id}"]`);
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
