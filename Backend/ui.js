// Standard-Button für destruktive Aktionen wie Löschen
export function createDeleteButton(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.marginRight = "8px";
  btn.addEventListener("click", onClick);
  return btn;
}

// Standard-Button für normale Aktionen
export function createActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.marginRight = "8px";
  btn.addEventListener("click", onClick);
  return btn;
}

// Einheitliches Kartenlayout für Users, Trainings und Exercises
export function createCard(title, lines = []) {
  const wrapper = document.createElement("div");
  wrapper.style.border = "1px solid #ccc";
  wrapper.style.padding = "10px";
  wrapper.style.marginBottom = "10px";
  wrapper.style.borderRadius = "8px";

  const h3 = document.createElement("h3");
  h3.textContent = title;
  wrapper.appendChild(h3);

  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    wrapper.appendChild(p);
  }

  return wrapper;
}