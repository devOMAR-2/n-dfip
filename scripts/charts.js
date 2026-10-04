// Small inline-SVG chart toolkit for the dashboards.
// Mark specs: bars <= 24px thick, 4px rounded data end, square at the baseline, 2px
// surface gaps; 2px lines with >= 8px markers and a 2px surface ring; hairline solid
// grid. Every chart has a hover/focus tooltip and a table view. Colors are CSS
// variables (validated palette in shared.css), applied via style so var() resolves.

const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs = {}, style = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    Object.assign(node.style, style);
    return node;
  }
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------- Number formats ----------

  const fmt = {
    count: (n) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}K` : Math.round(n).toLocaleString("en-US")),
    pct: (n) => `${Math.round(n)}%`,
    hours: (n) => `${n.toFixed(1)} h`,
    days: (n) => `${n.toFixed(1)} d`,
    minutes: (n) => `${n.toFixed(1)} min`,
    decimal: (n) => n.toFixed(2),
  };

  // Round axis max to a clean number and split into ~4 ticks
  function niceTicks(max, integer = false) {
    if (max <= 0) return [0, 1];
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    if (integer) step = Math.max(1, Math.ceil(step));
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  }

  // ---------- Tooltip (one for the page) ----------

  const tip = el("div", "chart-tooltip");
  tip.setAttribute("role", "status");
  tip.hidden = true;
  document.body.append(tip);

  function showTip(title, rows, x, y) {
    tip.replaceChildren();
    if (title) tip.append(el("p", "chart-tooltip__title", title));
    for (const r of rows) {
      const row = el("div", "chart-tooltip__row");
      const key = el("span", "chart-tooltip__key");
      key.style.background = r.color;
      row.append(key, el("span", "chart-tooltip__value", r.value), el("span", "chart-tooltip__name", r.name));
      tip.append(row);
    }
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - w - 8);
    const top = y - h - 14 < 8 ? y + 18 : y - h - 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  const hideTip = () => (tip.hidden = true);

  // Anchor point for keyboard focus (no pointer)
  function anchorOf(node) {
    const r = node.getBoundingClientRect();
    return [r.left + r.width / 2, r.top];
  }

  // Measure label text in the page font so bar labels never overflow the card
  const measureCtx = document.createElement("canvas").getContext("2d");
  function textWidth(text, size) {
    measureCtx.font = `${size} ${getComputedStyle(document.body).fontFamily}`;
    return measureCtx.measureText(text).width;
  }

  // ---------- Re-render on resize ----------

  const renders = new Map();
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const fn = renders.get(e.target);
      const w = Math.round(e.contentRect.width);
      if (fn && fn.lastWidth !== w) {
        fn.lastWidth = w;
        requestAnimationFrame(fn);
      }
    }
  });
  function mount(host, render) {
    render.lastWidth = Math.round(host.clientWidth);
    renders.set(host, render);
    ro.observe(host);
    render();
  }

  // ---------- Table view ----------

  function tableView(headers, rows) {
    const details = el("details", "chart-table");
    details.append(el("summary", "", "Show table"));
    const table = el("table", "data-table");
    const thead = el("thead");
    const hr = el("tr");
    headers.forEach((h) => hr.append(el("th", "", h)));
    thead.append(hr);
    const tbody = el("tbody");
    for (const r of rows) {
      const tr = el("tr");
      r.forEach((c, i) => tr.append(el(i === 0 ? "th" : "td", "", c)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    details.append(wrap);
    return details;
  }

  // ---------- Card shell ----------

  function card(title, subtitle) {
    const fig = el("figure", "chart-card");
    const cap = el("figcaption", "chart-card__head");
    cap.append(el("h4", "chart-card__title", title));
    if (subtitle) cap.append(el("p", "chart-card__sub", subtitle));
    const legend = el("div", "chart-legend");
    legend.hidden = true;
    const plot = el("div", "chart-plot");
    fig.append(cap, legend, plot);
    return { fig, legend, plot };
  }

  function legendItems(host, items, kind = "rect") {
    host.hidden = false;
    host.replaceChildren(
      ...items.map((it) => {
        const item = el("span", "chart-legend__item");
        const key = el("span", kind === "line" ? "chart-legend__line" : "chart-legend__rect");
        key.style.background = it.color;
        item.append(key, el("span", "", it.label));
        return item;
      }),
    );
  }

  // Path for a column with a rounded top (data end), square at the baseline
  function columnPath(x, y, w, h, r = 4) {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }
  // Horizontal bar, rounded at the right (data end)
  function barPath(x, y, w, h, r = 4) {
    const rr = Math.min(r, h / 2, w);
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  }

  const AXIS_BAND = 28;
  const PLOT_H = 190;

  function yAxis(svg, ticks, left, top, plotW, plotH, format) {
    const max = ticks[ticks.length - 1];
    for (const t of ticks) {
      const y = top + plotH - (t / max) * plotH;
      svg.append(svgEl("line", { x1: left, x2: left + plotW, y1: y, y2: y, class: t === 0 ? "chart-axis" : "chart-gridline" }));
      const label = svgEl("text", { x: left - 8, y, class: "chart-tick", "text-anchor": "end", "dominant-baseline": "middle" });
      label.textContent = format(t);
      svg.append(label);
    }
  }

  function xLabels(svg, labels, centerOf, y, plotW) {
    const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 64))));
    labels.forEach((l, i) => {
      if (i % every && i !== labels.length - 1) return;
      if (i !== labels.length - 1 && labels.length - 1 - i < every && (labels.length - 1) % every) return;
      const t = svgEl("text", { x: centerOf(i), y, class: "chart-tick", "text-anchor": "middle" });
      t.textContent = l;
      svg.append(t);
    });
  }

  // Keyboard + pointer over an indexed x (columns, lines)
  function indexInteraction(svg, n, indexAt, onActive, label) {
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", `${label}. Use left and right arrow keys to read values.`);
    let active = -1;
    const set = (i, x, y) => {
      active = i;
      onActive(i, x, y);
    };
    svg.addEventListener("pointermove", (e) => set(indexAt(e), e.clientX, e.clientY));
    svg.addEventListener("pointerleave", () => {
      onActive(-1);
      hideTip();
    });
    svg.addEventListener("focus", () => set(active < 0 ? n - 1 : active));
    svg.addEventListener("blur", () => {
      onActive(-1);
      hideTip();
    });
    svg.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      set(Math.max(0, Math.min(n - 1, active + (e.key === "ArrowRight" ? 1 : -1))));
    });
  }

  // ---------- Columns (single series over time, or an ordered distribution) ----------
  // opts: { title, subtitle, labels, fullLabels?, values, colors? (per bar), color, name, format, labelAll }

  function columns(opts) {
    const { fig, plot } = card(opts.title, opts.subtitle);
    const color = opts.color ?? "var(--viz-1)";
    const format = opts.format ?? fmt.count;
    const render = () => {
      const W = Math.max(260, plot.clientWidth);
      const ticks = niceTicks(Math.max(...opts.values, 0), format === fmt.count);
      const max = ticks[ticks.length - 1];
      const left = 44;
      const top = 18;
      const plotW = W - left - 8;
      const n = opts.values.length;
      const band = plotW / n;
      const barW = Math.max(2, Math.min(24, band - 2, band * 0.62));
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${PLOT_H + AXIS_BAND + top}`, width: W, height: PLOT_H + AXIS_BAND + top, class: "chart-svg" });
      yAxis(svg, ticks, left, top, plotW, PLOT_H, opts.tickFormat ?? format);
      const cx = (i) => left + band * i + band / 2;
      const bars = opts.values.map((v, i) => {
        const h = (v / max) * PLOT_H;
        const p = svgEl("path", { d: columnPath(cx(i) - barW / 2, top + PLOT_H - h, barW, Math.max(h, 0.01)), class: "chart-mark" }, { fill: opts.colors?.[i] ?? color });
        svg.append(p);
        return p;
      });
      // Direct labels: every bar for short distributions, otherwise only the peak
      const peak = opts.values.indexOf(Math.max(...opts.values));
      opts.values.forEach((v, i) => {
        if (!(opts.labelAll || i === peak) || v === 0) return;
        const h = (v / max) * PLOT_H;
        const t = svgEl("text", { x: cx(i), y: top + PLOT_H - h - 6, class: "chart-value", "text-anchor": "middle" });
        t.textContent = format(v);
        svg.append(t);
      });
      xLabels(svg, opts.labels, cx, top + PLOT_H + 18, plotW);
      indexInteraction(
        svg,
        n,
        (e) => {
          const r = svg.getBoundingClientRect();
          return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) * (W / r.width) - left) / band)));
        },
        (i, x, y) => {
          bars.forEach((b, j) => b.classList.toggle("is-dim", i >= 0 && j !== i));
          if (i < 0) return;
          const [ax, ay] = x === undefined ? anchorOf(bars[i]) : [x, y];
          showTip(opts.fullLabels?.[i] ?? opts.labels[i], [{ color: opts.colors?.[i] ?? color, value: format(opts.values[i]), name: opts.name ?? opts.title }], ax, ay);
        },
        opts.title,
      );
      plot.replaceChildren(svg);
    };
    mount(plot, render);
    fig.append(tableView([opts.tableHead ?? "Period", opts.name ?? opts.title], opts.values.map((v, i) => [opts.fullLabels?.[i] ?? opts.labels[i], format(v)])));
    return fig;
  }

  // ---------- Lines (multi-series over time, one axis) ----------
  // opts: { title, subtitle, labels, fullLabels?, series: [{ name, color, values }], format }

  function lines(opts) {
    const { fig, legend, plot } = card(opts.title, opts.subtitle);
    const format = opts.format ?? fmt.count;
    if (opts.series.length > 1) legendItems(legend, opts.series.map((s) => ({ label: s.name, color: s.color })), "line");
    const render = () => {
      const W = Math.max(260, plot.clientWidth);
      const all = opts.series.flatMap((s) => s.values.filter((v) => v !== null));
      const ticks = niceTicks(Math.max(...all, 0), format === fmt.count);
      const max = ticks[ticks.length - 1];
      const left = 44;
      const top = 18;
      const right = 56; // room for end labels
      const plotW = W - left - right;
      const n = opts.labels.length;
      const x = (i) => left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
      const y = (v) => top + PLOT_H - (v / max) * PLOT_H;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${PLOT_H + AXIS_BAND + top}`, width: W, height: PLOT_H + AXIS_BAND + top, class: "chart-svg" });
      yAxis(svg, ticks, left, top, plotW, PLOT_H, opts.tickFormat ?? format);
      const cross = svgEl("line", { y1: top, y2: top + PLOT_H, class: "chart-crosshair", visibility: "hidden" });
      svg.append(cross);
      const ends = [];
      for (const s of opts.series) {
        const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)]));
        const d = pts.reduce((acc, p, i) => (p ? acc + `${acc && pts[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}` : acc), "");
        svg.append(svgEl("path", { d, class: "chart-line" }, { stroke: s.color }));
        const showMarkers = n <= 16;
        pts.forEach((p, i) => {
          if (!p || (!showMarkers && i !== n - 1)) return;
          svg.append(svgEl("circle", { cx: p[0], cy: p[1], r: 4, class: "chart-dot" }, { fill: s.color }));
        });
        const last = [...pts].reverse().find(Boolean);
        if (last) ends.push({ y: last[1], x: last[0], text: format(s.values[s.values.length - 1] ?? 0) });
      }
      // End labels only when they don't collide; otherwise the legend + tooltip carry them
      const collide = ends.length > 1 && Math.abs(ends[0].y - ends[1].y) < 14;
      if (!collide) {
        for (const e of ends) {
          const t = svgEl("text", { x: e.x + 8, y: e.y, class: "chart-value", "dominant-baseline": "middle" });
          t.textContent = e.text;
          svg.append(t);
        }
      }
      xLabels(svg, opts.labels, x, top + PLOT_H + 18, plotW);
      const hover = svgEl("g");
      svg.append(hover);
      indexInteraction(
        svg,
        n,
        (e) => {
          const r = svg.getBoundingClientRect();
          const px = (e.clientX - r.left) * (W / r.width);
          return Math.max(0, Math.min(n - 1, Math.round(((px - left) / plotW) * (n - 1))));
        },
        (i, cx, cy) => {
          hover.replaceChildren();
          if (i < 0) {
            cross.setAttribute("visibility", "hidden");
            return;
          }
          cross.setAttribute("x1", x(i));
          cross.setAttribute("x2", x(i));
          cross.setAttribute("visibility", "visible");
          for (const s of opts.series) {
            if (s.values[i] === null) continue;
            hover.append(svgEl("circle", { cx: x(i), cy: y(s.values[i]), r: 5, class: "chart-dot" }, { fill: s.color }));
          }
          const r = svg.getBoundingClientRect();
          const ax = cx ?? r.left + x(i) * (r.width / W);
          const ay = cy ?? r.top + top * (r.height / (PLOT_H + AXIS_BAND + top)) + 10;
          showTip(
            opts.fullLabels?.[i] ?? opts.labels[i],
            opts.series.map((s) => ({ color: s.color, value: s.values[i] === null ? "—" : format(s.values[i]), name: s.name })),
            ax,
            ay,
          );
        },
        opts.title,
      );
      plot.replaceChildren(svg);
    };
    mount(plot, render);
    fig.append(
      tableView(
        [opts.tableHead ?? "Period", ...opts.series.map((s) => s.name)],
        opts.labels.map((l, i) => [opts.fullLabels?.[i] ?? l, ...opts.series.map((s) => (s.values[i] === null ? "—" : format(s.values[i])))]),
      ),
    );
    return fig;
  }

  // ---------- Horizontal bars (nominal categories, single color) ----------
  // opts: { title, subtitle, items: [{ label, value, color? }], format, name }

  function bars(opts) {
    const { fig, plot } = card(opts.title, opts.subtitle);
    const format = opts.format ?? fmt.count;
    const color = opts.color ?? "var(--viz-1)";
    const render = () => {
      const W = Math.max(240, plot.clientWidth);
      const valueW = 56;
      const longest = Math.max(...opts.items.map((it) => textWidth(it.label, "12px")));
      // Labels beside the bars when they fit; otherwise each label sits above its bar
      const stackedLabels = longest + 16 > W * 0.45;
      const labelW = stackedLabels ? 0 : longest + 16;
      const row = stackedLabels ? 44 : 30;
      const barH = 16;
      const plotW = W - labelW - valueW;
      const max = opts.max ?? Math.max(...opts.items.map((i) => i.value), 1);
      const H = opts.items.length * row + 4;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
      if (!stackedLabels) svg.append(svgEl("line", { x1: labelW, x2: labelW, y1: 0, y2: H, class: "chart-axis" }));
      opts.items.forEach((it, i) => {
        const g = svgEl("g", { tabindex: 0, class: "chart-bar", role: "img", "aria-label": `${it.label}: ${format(it.value)}` });
        const y0 = i * row + (stackedLabels ? row - barH - 6 : (row - barH) / 2);
        const w = Math.max(0, (it.value / max) * plotW);
        // Hit area spans the whole row
        g.append(svgEl("rect", { x: 0, y: i * row, width: W, height: row, class: "chart-hit" }));
        const label = stackedLabels
          ? svgEl("text", { x: 0, y: i * row + 12, class: "chart-label", "dominant-baseline": "middle" })
          : svgEl("text", { x: labelW - 8, y: y0 + barH / 2, class: "chart-label", "text-anchor": "end", "dominant-baseline": "middle" });
        label.textContent = it.label;
        g.append(label);
        if (w > 0) g.append(svgEl("path", { d: barPath(labelW + 1, y0, w, barH), class: "chart-mark" }, { fill: it.color ?? color }));
        const v = svgEl("text", { x: labelW + w + 8, y: y0 + barH / 2, class: "chart-value", "dominant-baseline": "middle" });
        v.textContent = format(it.value);
        g.append(v);
        const show = (e) => {
          const [ax, ay] = e?.clientX ? [e.clientX, e.clientY] : anchorOf(g);
          showTip(it.label, [{ color: it.color ?? color, value: format(it.value), name: opts.name ?? opts.title }], ax, ay);
        };
        g.addEventListener("pointermove", show);
        g.addEventListener("pointerleave", hideTip);
        g.addEventListener("focus", () => show());
        g.addEventListener("blur", hideTip);
        svg.append(g);
      });
      plot.replaceChildren(svg);
    };
    mount(plot, render);
    fig.append(tableView([opts.tableHead ?? "Category", opts.name ?? opts.title], opts.items.map((it) => [it.label, format(it.value)])));
    return fig;
  }

  // ---------- 100% stacked bar (ordered part-to-whole, <= 6 segments) ----------
  // opts: { title, subtitle, segments: [{ label, value, color, ink }] }

  function stacked(opts) {
    const { fig, legend, plot } = card(opts.title, opts.subtitle);
    const total = opts.segments.reduce((a, s) => a + s.value, 0) || 1;
    legendItems(legend, opts.segments.map((s) => ({ label: `${s.label} · ${Math.round((s.value / total) * 100)}%`, color: s.color })));
    const render = () => {
      const W = Math.max(260, plot.clientWidth);
      const H = 40;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
      let x = 0;
      const gap = 2;
      const usable = W - gap * (opts.segments.length - 1);
      opts.segments.forEach((s, i) => {
        const w = (s.value / total) * usable;
        const g = svgEl("g", { tabindex: 0, class: "chart-bar", role: "img", "aria-label": `${s.label}: ${Math.round((s.value / total) * 100)}%` });
        const first = i === 0;
        const last = i === opts.segments.length - 1;
        const r = 4;
        const d = `M${x + (first ? r : 0)},8H${x + w - (last ? r : 0)}${last ? `Q${x + w},8 ${x + w},${8 + r}V${32 - r}Q${x + w},32 ${x + w - r},32` : `V32`}H${x + (first ? r : 0)}${first ? `Q${x},32 ${x},${32 - r}V${8 + r}Q${x},8 ${x + r},8` : `V8`}Z`;
        g.append(svgEl("path", { d, class: "chart-mark" }, { fill: s.color }));
        const pct = `${Math.round((s.value / total) * 100)}%`;
        if (w > 44) {
          const t = svgEl("text", { x: x + w / 2, y: 20, class: "chart-inlabel", "text-anchor": "middle", "dominant-baseline": "middle" }, { fill: s.ink ?? "#fff" });
          t.textContent = pct;
          g.append(t);
        }
        const show = (e) => {
          const [ax, ay] = e?.clientX ? [e.clientX, e.clientY] : anchorOf(g);
          showTip(s.label, [{ color: s.color, value: `${pct} (${fmt.count(s.value)})`, name: opts.name ?? opts.title }], ax, ay);
        };
        g.addEventListener("pointermove", show);
        g.addEventListener("pointerleave", hideTip);
        g.addEventListener("focus", () => show());
        g.addEventListener("blur", hideTip);
        svg.append(g);
        x += w + gap;
      });
      plot.replaceChildren(svg);
    };
    mount(plot, render);
    fig.append(tableView(["Band", "Patients", "Share"], opts.segments.map((s) => [s.label, fmt.count(s.value), `${Math.round((s.value / total) * 100)}%`])));
    return fig;
  }

  // ---------- Stat tile ----------
  // { label, value, delta: { pct, good: "up"|"down"|null, vs }, spark: number[], live }

  const ARROW_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>';
  const ARROW_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>';

  function stat({ label, value, delta, spark, note }) {
    const tile = el("div", "stat-tile");
    tile.append(el("p", "stat-tile__label", label), el("p", "stat-tile__value", value));
    if (delta && Number.isFinite(delta.pct)) {
      const up = delta.pct > 0;
      const flat = Math.abs(delta.pct) < 0.5;
      const tone = flat || !delta.good ? "neutral" : (up && delta.good === "up") || (!up && delta.good === "down") ? "good" : "bad";
      const d = el("p", `stat-tile__delta stat-tile__delta--${tone}`);
      const change = el("span", "stat-tile__change");
      if (!flat) change.insertAdjacentHTML("afterbegin", up ? ARROW_UP : ARROW_DOWN);
      change.append(flat ? "No change" : `${up ? "+" : "−"}${Math.abs(delta.pct).toFixed(0)}%`);
      const word = tone === "good" ? "better" : tone === "bad" ? "worse" : "";
      if (word) change.append(el("span", "sr-only", ` (${word})`));
      d.append(change, el("span", "stat-tile__vs", `vs ${delta.vs}`));
      tile.append(d);
    } else if (note) tile.append(el("p", "stat-tile__delta stat-tile__delta--neutral", note));
    if (spark?.length > 1) {
      const W = 120;
      const H = 28;
      const max = Math.max(...spark, 1);
      const min = Math.min(...spark, 0);
      const pts = spark.map((v, i) => [(W * i) / (spark.length - 1), H - 3 - ((v - min) / (max - min || 1)) * (H - 6)]);
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "stat-tile__spark", "aria-hidden": "true", preserveAspectRatio: "none" });
      svg.append(svgEl("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "spark-line" }));
      const last = pts[pts.length - 1];
      svg.append(svgEl("circle", { cx: last[0], cy: last[1], r: 3, class: "spark-dot" }));
      tile.append(svg);
    }
    return tile;
  }

  return { fmt, columns, lines, bars, stacked, stat };
})();
