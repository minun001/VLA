const dialog = document.querySelector(".lightbox");
const dialogImage = dialog?.querySelector("img");
const dialogTitle = dialog?.querySelector("h3");
const closeButton = dialog?.querySelector(".close-button");
let lastFocusedButton = null;

document.documentElement.classList.add("js");

document.querySelectorAll(".image-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (!dialog || !dialogImage || !dialogTitle) return;

    const image = button.getAttribute("data-image");
    const title = button.getAttribute("data-title") || "시각화 이미지";
    if (!image) return;

    lastFocusedButton = button;
    dialogImage.src = image;
    dialogImage.alt = title;
    dialogTitle.textContent = title;
    document.body.style.overflow = "hidden";
    dialog.showModal();
  });
});

closeButton?.addEventListener("click", () => {
  dialog?.close();
});

dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) {
    dialog.close();
  }
});

dialog?.addEventListener("close", () => {
  document.body.style.overflow = "";
  lastFocusedButton?.focus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dialog?.open) {
    dialog.close();
  }
});

const stages = [...document.querySelectorAll(".stage")];
const navLinks = [...document.querySelectorAll(".nav a")];

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
        });
      }
    });
  },
  { threshold: 0.32 }
);

stages.forEach((stage) => observer.observe(stage));
