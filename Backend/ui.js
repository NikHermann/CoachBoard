function applyAttributes(element, attributes = {}) {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (key === "className") {
      element.className = value;
      return;
    }

    if (key === "text") {
      element.textContent = value;
      return;
    }

    if (key === "html") {
      element.innerHTML = value;
      return;
    }

    if (key === "dataset" && typeof value === "object") {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        if (dataValue !== undefined && dataValue !== null) {
          element.dataset[dataKey] = String(dataValue);
        }
      });
      return;
    }

    element.setAttribute(key, value);
  });

  return element;
}

export function createElement(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName);
  applyAttributes(element, attributes);

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }

  return element;
}

export function createButton(label, variant = "secondary", onClick, extraClassName = "") {
  const button = createElement("button", {
    type: "button",
    className: `button button--${variant} ${extraClassName}`.trim(),
    text: label
  });

  if (typeof onClick === "function") {
    button.addEventListener("click", onClick);
  }

  return button;
}

export function createDeleteButton(label, onClick) {
  return createButton(label, "secondary", onClick);
}

export function createActionButton(label, onClick, variant = "ghost") {
  return createButton(label, variant, onClick);
}

export function createBadge(label, type = "primary") {
  return createElement("span", {
    className: `badge badge--${type}`,
    text: label
  });
}

export function createEmptyState(message) {
  return createElement("div", {
    className: "empty-state",
    text: message
  });
}

export function createMetaItem(label, value) {
  return createElement("div", { className: "entity-card__meta-item" }, [
    createElement("span", { className: "entity-card__meta-label", text: label }),
    createElement("span", { className: "entity-card__meta-value", text: value })
  ]);
}

export function createCard(title, subtitle = "", metaItems = [], description = "") {
  const card = createElement("article", { className: "entity-card" });

  const header = createElement("div", { className: "entity-card__header" }, [
    createElement("div", {}, [
      createElement("h3", { className: "entity-card__title", text: title }),
      subtitle ? createElement("p", { className: "entity-card__subtitle", text: subtitle }) : null
    ])
  ]);

  const meta = createElement("div", { className: "entity-card__meta" });
  metaItems.forEach((item) => meta.appendChild(item));

  card.appendChild(header);

  if (metaItems.length > 0) {
    card.appendChild(meta);
  }

  if (description) {
    card.appendChild(createElement("p", { className: "entity-card__description", text: description }));
  }

  return card;
}

export function createTagRow(tags = []) {
  const row = createElement("div", { className: "entity-card__tag-row" });
  tags.forEach((tag) => row.appendChild(tag));
  return row;
}

export function createActionRow(buttons = []) {
  const row = createElement("div", { className: "entity-card__actions" });
  buttons.forEach((button) => row.appendChild(button));
  return row;
}

export function clearElement(element) {
  element.innerHTML = "";
}