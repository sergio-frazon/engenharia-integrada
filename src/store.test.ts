import { test } from "node:test"
import assert from "node:assert/strict"
import { actual, cost, progress, initial, type Entry } from "./store.ts"

test("execution and its payable count as one incurred cost, including after payment", () => {
  const execution: Entry = {
    id: "execution",
    work: "w",
    kind: "Equipes",
    name: "Equipe",
    date: "2026-10-05",
    amount: 400,
  }
  const account: Entry = {
    ...execution,
    id: "account",
    kind: "Financeiro",
    direction: "Pagar",
    source: execution.id,
  }
  assert.equal(actual([execution, account]), 400)
  assert.equal(actual([execution, { ...account, paid: "2026-10-05" }]), 400)
  assert.equal(
    actual([
      execution,
      account,
      { ...account, id: "direct", source: undefined, amount: 100 },
    ]),
    500,
  )
})

test("material consumption does not charge stock acquisition a second time", () => {
  const incoming: Entry = {
    id: "entry",
    work: "w",
    kind: "Materiais",
    name: "Cimento",
    date: "2026-10-05",
    amount: 1000,
    movement: "Entrada",
  }
  assert.equal(
    actual([
      incoming,
      { ...incoming, id: "consumption", movement: "Consumo", amount: 600 },
    ]),
    1000,
  )
})

test("budget includes all unit cost components and does not count as execution", () => {
  const row: Entry = {
    id: "budget",
    work: "w",
    kind: "Orçamento",
    name: "Serviço",
    date: "2026-10-05",
    quantity: 10,
    price: 20,
    labor: 30,
    equipment: 5,
  }
  assert.equal(cost(row), 550)
  assert.equal(actual([row]), 0)
})

test("progress remains isolated by work and supports an empty new work", () => {
  assert.equal(progress(initial.entries, "aurora"), 80)
  assert.equal(progress(initial.entries, "vertice"), 0)
})
