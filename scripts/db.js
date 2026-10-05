// Demo "back end": every saved collection goes through here. Load first, before auth.js:
//   <script src="./scripts/db.js"></script>
//
// - One localStorage write per save, so a save either completes or doesn't happen (EC-03).
// - Settings › System can make saves fail on purpose, to test the error handling (EC-15).
//   A failed save throws Db.SaveError, leaves the stored data unchanged, and is recorded in
//   the support error log ("ndfip.errors").
// FRONT-END ONLY: a real server repeats every check and owns the data.

const Db = (() => {
  const ERRORS_KEY = "ndfip.errors";
  const SIM_KEY = "ndfip.sim";

  class SaveError extends Error {
    constructor(message, cause) {
      super(message);
      this.name = "SaveError";
      this.cause = cause;
    }
  }

  function read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  const sim = () => read(SIM_KEY, {}) ?? {};

  function logError(where, error) {
    try {
      const all = read(ERRORS_KEY, []);
      all.push({ at: new Date().toISOString(), where, message: String(error?.message ?? error), page: location.pathname.split("/").pop(), user: sessionUserId() });
      localStorage.setItem(ERRORS_KEY, JSON.stringify(all.slice(-500)));
    } catch {}
  }

  function sessionUserId() {
    try {
      return localStorage.getItem("ndfip.session") || sessionStorage.getItem("ndfip.session") || null;
    } catch {
      return null;
    }
  }

  // Writes one collection. Throws SaveError when the write can't happen.
  function write(key, value, { where = key } = {}) {
    if (sim().failSaves && !key.startsWith("ndfip.sim") && key !== ERRORS_KEY && key !== "ndfip.audit") {
      const err = new SaveError("The server didn't accept the change (simulated error). Nothing was saved. Try again.");
      logError(where, err);
      throw err;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      const err = new SaveError("The change couldn't be saved: browser storage is full or unavailable. Nothing was saved.", e);
      logError(where, err);
      throw err;
    }
  }

  // Read, change and write one collection in a single step
  function update(key, fallback, mutate, opts) {
    const value = read(key, fallback);
    const result = mutate(value);
    write(key, result === undefined ? value : result, opts);
    return result === undefined ? value : result;
  }

  // Simulated latency, so loading states are visible (UAT-19)
  const delay = (ms) => new Promise((r) => setTimeout(r, sim().slow ? Math.max(ms, 1200) : ms));

  return {
    SaveError,
    read,
    write,
    update,
    delay,
    logError,
    errors: () => read(ERRORS_KEY, []),
    get sim() {
      return sim();
    },
    setSim(next) {
      try {
        localStorage.setItem(SIM_KEY, JSON.stringify({ ...sim(), ...next }));
      } catch {}
    },
  };
})();
