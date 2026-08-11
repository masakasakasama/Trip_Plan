(() => {
  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function equal(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isEntityArray(value) {
    return Array.isArray(value) && value.every((item) => isObject(item) && typeof item.id === "string");
  }

  function idOrder(value) {
    return (value || []).map((item) => item.id);
  }

  function mergeEntityArray(base, local, remote, path, conflicts) {
    const baseMap = new Map((base || []).map((item) => [item.id, item]));
    const localMap = new Map((local || []).map((item) => [item.id, item]));
    const remoteMap = new Map((remote || []).map((item) => [item.id, item]));
    const baseOrder = idOrder(base);
    const localOrder = idOrder(local);
    const remoteOrder = idOrder(remote);
    let order;

    if (equal(localOrder, baseOrder)) order = [...remoteOrder];
    else if (equal(remoteOrder, baseOrder)) order = [...localOrder];
    else order = [...localOrder, ...remoteOrder.filter((id) => !localMap.has(id))];

    const allIds = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    allIds.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });

    return order.flatMap((id) => {
      const baseHas = baseMap.has(id);
      const localHas = localMap.has(id);
      const remoteHas = remoteMap.has(id);
      const itemPath = `${path}[${id}]`;

      if (!localHas && !remoteHas) return [];
      if (!baseHas) {
        if (localHas && remoteHas) return [mergeNode(undefined, localMap.get(id), remoteMap.get(id), itemPath, conflicts)];
        return [clone(localHas ? localMap.get(id) : remoteMap.get(id))];
      }
      if (!localHas) {
        if (equal(remoteMap.get(id), baseMap.get(id))) return [];
        conflicts.push({ path: itemPath, kind: "delete-vs-remote-change", kept: "remote" });
        return [clone(remoteMap.get(id))];
      }
      if (!remoteHas) {
        if (equal(localMap.get(id), baseMap.get(id))) return [];
        conflicts.push({ path: itemPath, kind: "local-change-vs-delete", kept: "local" });
        return [clone(localMap.get(id))];
      }
      return [mergeNode(baseMap.get(id), localMap.get(id), remoteMap.get(id), itemPath, conflicts)];
    });
  }

  function mergeArray(base, local, remote, path, conflicts) {
    if (isEntityArray(local) && isEntityArray(remote) && (!base || isEntityArray(base))) {
      return mergeEntityArray(base || [], local, remote, path, conflicts);
    }
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    const merged = [];
    [...remote, ...local].forEach((item) => {
      if (!merged.some((candidate) => equal(candidate, item))) merged.push(clone(item));
    });
    conflicts.push({ path, kind: "array-merge", kept: "union" });
    return merged;
  }

  function mergeNode(base, local, remote, path, conflicts) {
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);

    if (local === undefined) {
      if (remote === undefined || equal(remote, base)) return undefined;
      conflicts.push({ path, kind: "delete-vs-remote-change", kept: "remote" });
      return clone(remote);
    }
    if (remote === undefined) {
      if (equal(local, base)) return undefined;
      conflicts.push({ path, kind: "local-change-vs-delete", kept: "local" });
      return clone(local);
    }

    if (Array.isArray(local) && Array.isArray(remote)) {
      return mergeArray(Array.isArray(base) ? base : [], local, remote, path, conflicts);
    }

    if (isObject(local) && isObject(remote)) {
      const result = {};
      const keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
      keys.forEach((key) => {
        const value = mergeNode(base?.[key], local[key], remote[key], path ? `${path}.${key}` : key, conflicts);
        if (value !== undefined) result[key] = value;
      });
      return result;
    }

    if (path.endsWith("lastUpdated")) {
      return String(local) > String(remote) ? clone(local) : clone(remote);
    }
    conflicts.push({ path, kind: "same-field-change", kept: "local", local: clone(local), remote: clone(remote) });
    return clone(local);
  }

  function mergeStates(base, local, remote) {
    const conflicts = [];
    return {
      state: mergeNode(base || {}, local || {}, remote || {}, "", conflicts),
      conflicts
    };
  }

  const api = { clone, equal, mergeStates };
  if (typeof window !== "undefined") window.TripSyncMerge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
