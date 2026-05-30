(function () {
  if (window.top !== window || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function addPetalLayer() {
    if (document.querySelector(".mindup-petal-layer")) return;

    const layer = document.createElement("div");
    layer.className = "mindup-petal-layer";
    layer.setAttribute("aria-hidden", "true");

    const petalCount = window.matchMedia("(max-width: 640px)").matches ? 10 : 18;
    for (let index = 0; index < petalCount; index += 1) {
      const petal = document.createElement("span");
      petal.className = "mindup-petal";
      petal.style.setProperty("--petal-left", `${Math.random() * 100}%`);
      petal.style.setProperty("--petal-size", `${8 + Math.random() * 9}px`);
      petal.style.setProperty("--petal-delay", `${-Math.random() * 16}s`);
      petal.style.setProperty("--petal-duration", `${11 + Math.random() * 10}s`);
      petal.style.setProperty("--petal-drift", `${-55 + Math.random() * 110}px`);
      petal.style.setProperty("--petal-turn", `${210 + Math.random() * 390}deg`);
      petal.style.setProperty("--petal-opacity", `${0.28 + Math.random() * 0.34}`);
      layer.appendChild(petal);
    }

    document.body.appendChild(layer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addPetalLayer, { once: true });
  } else {
    addPetalLayer();
  }
})();
