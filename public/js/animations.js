(function () {
  function makePetals() {
    const field = document.querySelector(".petal-field");
    const petals = ["🌸", "💗", "💕", "🌷"];

    for (let index = 0; index < 18; index += 1) {
      const petal = document.createElement("span");
      petal.textContent = petals[index % petals.length];
      petal.style.left = `${Math.random() * 100}vw`;
      petal.style.animationDuration = `${8 + Math.random() * 9}s`;
      petal.style.animationDelay = `${Math.random() * 7}s`;
      petal.style.fontSize = `${13 + Math.random() * 12}px`;
      field.appendChild(petal);
    }
  }

  function confettiBurst() {
    for (let index = 0; index < 28; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti";
      piece.textContent = index % 2 ? "💗" : "🌸";
      piece.style.setProperty("--x", `${Math.random() * 420 - 210}px`);
      piece.style.setProperty("--y", `${Math.random() * 360 - 180}px`);
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 950);
    }
  }

  window.RomanceAnimations = { makePetals, confettiBurst };
})();
