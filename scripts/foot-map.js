// Interactive foot diagrams on the screening form.
// - Section C: tap a sensation marker to cycle Detected → Absent → Not assessed.
// - Section J: pick an ulcer, tap a zone to fill its foot, zone and aspect.
// The diagrams only drive the normal form fields (and redraw from them), so the
// chips/selects stay the source of truth and keyboard users can use those directly.

(() => {
  const form = document.getElementById("screening-form");
  if (!form) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const inputs = (name) => [...form.querySelectorAll(`[name="${name}"]`)];
  const radioValue = (name) => inputs(name).find((i) => i.checked)?.value ?? "";

  // Check a radio and let the rest of the form (status, validation) react
  function setRadio(name, value) {
    const input = inputs(name).find((i) => i.value === value);
    if (!input || input.checked) return;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelect(name, value) {
    const select = form.elements[name];
    if (!select || select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------- C: sensation markers ----------

  const SENS_CYCLE = ["detected", "absent", "not-assessed"];
  const SENS_TEXT = { detected: "+", absent: "−", "not-assessed": "?" };
  const SENS_LABEL = { detected: "detected", absent: "absent", "not-assessed": "not assessed", "": "not recorded" };
  const markers = [...form.querySelectorAll(".sens-marker")];

  function renderMarkers() {
    for (const marker of markers) {
      const value = radioValue(marker.dataset.target);
      const side = marker.dataset.target.split(".")[1] === "left" ? "Left" : "Right";
      marker.dataset.state = value;
      marker.querySelector("text").textContent = SENS_TEXT[value] ?? "";
      marker.setAttribute("aria-label", `${side} foot, ${marker.dataset.site}: ${SENS_LABEL[value]}. Activate to change.`);
    }
  }

  function cycleMarker(marker) {
    if (form.dataset.readonly) return;
    const current = radioValue(marker.dataset.target);
    const next = SENS_CYCLE[(SENS_CYCLE.indexOf(current) + 1) % SENS_CYCLE.length];
    setRadio(marker.dataset.target, next);
  }

  for (const marker of markers) {
    marker.addEventListener("click", () => cycleMarker(marker));
    marker.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      cycleMarker(marker);
    });
  }

  // ---------- J: ulcer placement ----------

  const ulcerMap = form.querySelector("[data-ulcer-map]");
  const ulcerCount = () => {
    const count = radioValue("j.count");
    return count === "3+" ? 3 : Number(count || 0);
  };
  const placing = () => Number(radioValue("_place")) || 1;
  const placed = (n) => radioValue(`j.${n}.foot`) && form.elements[`j.${n}.zone`].value;

  function syncPicker() {
    const shown = ulcerCount();
    ulcerMap.querySelectorAll("[data-ulcer-pick]").forEach((pick) => {
      pick.hidden = Number(pick.dataset.ulcerPick) > shown;
    });
    if (placing() > shown && shown > 0) setPlacing(1);
  }

  function setPlacing(n) {
    const input = inputs("_place").find((i) => Number(i.value) === n);
    if (input) input.checked = true;
  }

  function zoneCenter(svg, zone) {
    const shape = svg.querySelector(`[data-zone="${zone}"]`);
    if (!shape) return null;
    const box = shape.getBBox();
    if (!box.width) return null; // not laid out yet (section closed)
    const x = box.x + box.width / 2;
    return { x: svg.hasAttribute("data-mirrored") ? 100 - x : x, y: box.y + box.height / 2 };
  }

  function renderPins() {
    ulcerMap.querySelectorAll("[data-pins]").forEach((layer) => layer.replaceChildren());
    const used = new Map(); // nudge pins that share a zone
    for (let n = 1; n <= ulcerCount(); n++) {
      const foot = radioValue(`j.${n}.foot`);
      const zone = form.elements[`j.${n}.zone`].value;
      if (!foot || !zone) continue;
      // Dorsal pins go on the dorsal view; plantar, medial, lateral and apex on the sole
      const view = radioValue(`j.${n}.aspect`) === "dorsal" && zone !== "heel" ? "dorsal" : "plantar";
      const svg = ulcerMap.querySelector(`svg[data-side="${foot}"][data-view="${view}"]`);
      const center = zoneCenter(svg, zone);
      if (!center) continue;
      const key = `${foot}-${view}-${zone}`;
      const offset = (used.get(key) || 0) * 9;
      used.set(key, (used.get(key) || 0) + 1);

      const pin = document.createElementNS(SVG_NS, "g");
      pin.setAttribute("class", "ulcer-pin" + (n === placing() ? " ulcer-pin--active" : ""));
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", center.x + offset);
      circle.setAttribute("cy", center.y);
      circle.setAttribute("r", 6.5);
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", center.x + offset);
      text.setAttribute("y", center.y);
      text.textContent = n;
      pin.append(circle, text);
      svg.querySelector("[data-pins]").append(pin);
    }
  }

  ulcerMap.addEventListener("click", (event) => {
    if (form.dataset.readonly) return;
    const zone = event.target.closest(".foot-zone");
    if (!zone) return;
    const svg = zone.closest("svg");
    const n = placing();
    setRadio(`j.${n}.foot`, svg.dataset.side);
    setSelect(`j.${n}.zone`, zone.dataset.zone);
    const aspect = radioValue(`j.${n}.aspect`);
    // The view decides dorsal vs plantar; keep medial/lateral/apex if already chosen on the sole
    if (svg.dataset.view === "dorsal") setRadio(`j.${n}.aspect`, "dorsal");
    else if (!aspect || aspect === "dorsal") setRadio(`j.${n}.aspect`, "plantar");

    // Move on to the next ulcer that still needs a location
    for (let next = 1; next <= ulcerCount(); next++) {
      if (!placed(next)) {
        setPlacing(next);
        break;
      }
    }
    render();
  });

  // ---------- Redraw from the form ----------

  function render() {
    renderMarkers();
    if (ulcerMap) {
      syncPicker();
      renderPins();
    }
  }

  form.addEventListener("change", render);
  form.addEventListener("input", render);
  // <details> content has no layout while closed, so draw pins once J opens
  form.querySelectorAll(".form-section").forEach((s) => s.addEventListener("toggle", render));
  render();
})();
