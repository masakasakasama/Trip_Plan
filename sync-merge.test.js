const assert = require("node:assert/strict");
const { mergeStates } = require("./sync-merge.js");

function state(overrides = {}) {
  return {
    trips: [{
      id: "trip-1",
      title: "Australia 2026",
      todos: [{ id: "todo-1", title: "ETA", done: false }],
      pois: [{ id: "poi-1", name: "Opera House", visited: false }],
      budgetItems: [{ id: "budget-1", title: "Hotel", amount: 100 }],
      days: [{ id: "day-1", items: [{ id: "item-1", title: "Airport", start: "08:00" }] }],
      ...overrides
    }]
  };
}

{
  const base = state();
  const local = state({
    todos: [
      { id: "todo-1", title: "ETA", done: false },
      { id: "todo-2", title: "Insurance", done: false }
    ]
  });
  const remote = state({ pois: [{ id: "poi-1", name: "Opera House", visited: true }] });
  const merged = mergeStates(base, local, remote).state.trips[0];
  assert.equal(merged.todos.length, 2);
  assert.equal(merged.pois[0].visited, true);
}

{
  const base = state();
  const local = state({
    todos: [
      { id: "todo-1", title: "ETA", done: false },
      { id: "todo-2", title: "Insurance", done: false }
    ]
  });
  const remote = state({
    budgetItems: [
      { id: "budget-1", title: "Hotel", amount: 100 },
      { id: "budget-2", title: "Dinner", amount: 50 }
    ]
  });
  const merged = mergeStates(base, local, remote).state.trips[0];
  assert.deepEqual(merged.todos.map((item) => item.id), ["todo-1", "todo-2"]);
  assert.deepEqual(merged.budgetItems.map((item) => item.id), ["budget-1", "budget-2"]);
}

{
  const base = state();
  const local = state({ todos: [{ id: "todo-1", title: "ETA application", done: false }] });
  const remote = state({ todos: [{ id: "todo-1", title: "ETA", done: true }] });
  const merged = mergeStates(base, local, remote).state.trips[0].todos[0];
  assert.equal(merged.title, "ETA application");
  assert.equal(merged.done, true);
}

{
  const base = state();
  const local = state({
    todos: [
      { id: "todo-1", title: "ETA", done: false },
      { id: "todo-2", title: "Added while saving", done: false }
    ]
  });
  const remote = state({ budgetItems: [{ id: "budget-1", title: "Hotel", amount: 125 }] });
  const merged = mergeStates(base, local, remote).state.trips[0];
  assert.equal(merged.todos[1].title, "Added while saving");
  assert.equal(merged.budgetItems[0].amount, 125);
}

{
  const base = state();
  const local = state({ days: [{ id: "day-1", items: [] }] });
  const remote = state({
    days: [{ id: "day-1", items: [{ id: "item-1", title: "Airport", start: "08:30" }] }]
  });
  const result = mergeStates(base, local, remote);
  assert.equal(result.state.trips[0].days[0].items[0].start, "08:30");
  assert.equal(result.conflicts[0].kind, "delete-vs-remote-change");
}

console.log("sync merge safety tests passed");
