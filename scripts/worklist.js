// Diabetic Foot clinic: screenings waiting for practitioner review (urgent first).
// Needs screening-store.js.

(() => {
  const list = document.getElementById("worklist");
  const empty = document.getElementById("worklist-empty");
  if (!list) return;

  const fmt = (iso) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const pending = ScreeningStore.pending();
  empty.hidden = pending.length > 0;
  list.replaceChildren(
    ...pending.map((record) => {
      const item = el("li", "worklist__item" + (record.urgent ? " worklist__item--urgent" : ""));
      const text = el("div", "worklist__text");
      text.append(
        el("span", "worklist__name", record.patientName),
        el("span", "worklist__meta", `${record.fileNumber} · sent ${fmt(record.submittedAt)} by ${record.submittedBy}`),
      );
      const badges = el("div", "worklist__badges");
      if (record.urgent) badges.append(el("span", "badge badge-danger", "Urgent"));
      badges.append(el("span", "badge badge-secondary", record.status === "in-review" ? "In review" : "Awaiting review"));
      for (const flag of record.flags.filter((f) => f.level !== "urgent")) badges.append(el("span", "badge badge-muted", flag.text.split(":")[0]));
      const open = el("a", "btn btn-primary btn-sm", record.status === "in-review" ? "Continue review" : "Review");
      open.href = `./review.html?id=${encodeURIComponent(record.id)}`;
      item.append(text, badges, open);
      return item;
    }),
  );
})();
