const themeButton = () => document.querySelector("#theme");

function apply(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const button = themeButton();
  button.setAttribute("aria-pressed", dark ? "true" : "false");
  button.setAttribute("aria-label", dark ? "Тёмная тема" : "Светлая тема");
}

export async function loadTheme() {
  let theme = "light";
  try {
    const saved = await Neutralino.storage.getData("theme");
    if (saved === "dark" || saved === "light") theme = saved;
  } catch {
    theme = "light";
  }
  apply(theme);
}

export function bindTheme() {
  themeButton().addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    if (!window.NL_PORT) return;
    await Neutralino.storage.setData("theme", next);
  });
}
