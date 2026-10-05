// Queues on the home and clinic pages, shown per role (UAT-06/07/08).
// Needs encounters-ui.js. Shows a loading state first (UAT-19), then refreshes every 30 s
// so waiting times and locks stay current.

(async () => {
  if (typeof Access !== "undefined" && Access.denied) return;
  EncounterUI.renderLoading();
  await Db.delay(200);
  EncounterUI.renderQueues();
  setInterval(() => EncounterUI.renderQueues(), 30000);
  // Another tab changed the queue, the structure or an assignment
  window.addEventListener("storage", (e) => ["ndfip.screenings", "ndfip.org", "ndfip.staff", "ndfip.privacy"].includes(e.key) && EncounterUI.renderQueues());
  // The clinic page changed the working clinic
  document.addEventListener("clinic:change", () => EncounterUI.renderQueues());
})();
