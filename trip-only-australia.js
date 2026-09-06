(() => {
  const KEEP_TRIP_ID = "australia-2026";
  const originalNormalize = normalize;

  normalize = function (data) {
    const normalized = originalNormalize(data);
    const trips = normalized.trips.filter((trip) => trip.id === KEEP_TRIP_ID);
    return {
      ...normalized,
      activeTripId: trips[0]?.id || KEEP_TRIP_ID,
      trips
    };
  };

  let persisted = false;
  let attempts = 0;
  const apply = () => {
    attempts += 1;
    if (!state?.trips?.length) {
      if (attempts < 100) setTimeout(apply, 100);
      return;
    }

    state = normalize(state);
    if (baseState?.trips?.length) baseState = normalize(baseState);
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    render();

    if (!persisted) {
      persisted = true;
      markDirty();
    }
  };

  apply();
})();
