(function () {
  if (window.top !== window || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function addPetalLayer() {
    if (document.querySelector(".mindup-petal-layer")) return;

    const layer = document.createElement("div");
    layer.className = "mindup-petal-layer";
    layer.setAttribute("aria-hidden", "true");

    const isSmallScreen = window.matchMedia("(max-width: 640px)").matches;
    const petalCount = isSmallScreen ? 14 : 26;
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

    const leafCount = isSmallScreen ? 4 : 9;
    for (let index = 0; index < leafCount; index += 1) {
      const leaf = document.createElement("span");
      leaf.className = "mindup-leaf";
      leaf.style.setProperty("--leaf-left", `${Math.random() * 100}%`);
      leaf.style.setProperty("--leaf-size", `${9 + Math.random() * 9}px`);
      leaf.style.setProperty("--leaf-delay", `${-Math.random() * 20}s`);
      leaf.style.setProperty("--leaf-duration", `${15 + Math.random() * 10}s`);
      leaf.style.setProperty("--leaf-drift", `${-90 + Math.random() * 180}px`);
      leaf.style.setProperty("--leaf-turn", `${320 + Math.random() * 540}deg`);
      layer.appendChild(leaf);
    }

    const ribbonCount = isSmallScreen ? 1 : 3;
    for (let index = 0; index < ribbonCount; index += 1) {
      const ribbon = document.createElement("span");
      ribbon.className = "mindup-ribbon";
      ribbon.style.setProperty("--ribbon-top", `${12 + Math.random() * 66}%`);
      ribbon.style.setProperty("--ribbon-delay", `${-Math.random() * 24}s`);
      ribbon.style.setProperty("--ribbon-duration", `${18 + Math.random() * 10}s`);
      ribbon.style.setProperty("--ribbon-scale", `${0.72 + Math.random() * 0.55}`);
      layer.appendChild(ribbon);
    }

    document.body.appendChild(layer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addPetalLayer, { once: true });
  } else {
    addPetalLayer();
  }
})();
