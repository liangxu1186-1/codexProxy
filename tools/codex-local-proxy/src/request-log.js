function cloneEntry(entry) {
  return {
    ...entry
  };
}

export function createRequestLog(options = {}) {
  const maxEntries = Number(options.maxEntries || 10);
  const entries = [];

  return {
    add(entry) {
      entries.unshift(cloneEntry(entry));

      if (entries.length > maxEntries) {
        entries.length = maxEntries;
      }
    },
    list(limit = maxEntries) {
      return entries.slice(0, Number(limit || maxEntries)).map(cloneEntry);
    }
  };
}
