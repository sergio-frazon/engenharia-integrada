export type Work = {
  id: string
  name: string
  client: string
  address: string
  manager: string
  start: string
  end: string
  budget: number
  status: string
}
export type Entry = {
  id: string
  work: string
  kind: string
  name: string
  date: string
  end?: string
  owner?: string
  category?: string
  quantity?: number
  price?: number
  labor?: number
  equipment?: number
  unit?: string
  progress?: number
  dependency?: string
  notes?: string
  amount?: number
  direction?: string
  paid?: string
  source?: string
  file?: string
  filename?: string
  version?: number
  movement?: string
  installments?: number
  photos?: string[]
  filePath?: string
  photoPaths?: string[]
}
export type Data = { works: Work[]; entries: Entry[]; profile: string }
export const id = () => crypto.randomUUID()
export const today = () => new Date().toLocaleDateString("en-CA")
export const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
export const date = (s?: string) => (s ? s.split("-").reverse().join("/") : "—")
export const cost = (e: Entry) =>
  e.kind === "Orçamento"
    ? (e.quantity || 0) * ((e.price || 0) + (e.labor || 0) + (e.equipment || 0))
    : e.amount || 0
export const initial: Data = {
  profile: "João Martins",
  works: [
    {
      id: "aurora",
      name: "Residencial Aurora",
      client: "Incorporadora Horizonte",
      address: "Rua das Flores, 120, Belo Horizonte, MG",
      manager: "Mariana Costa",
      start: "2026-02-01",
      end: "2026-12-18",
      budget: 4850000,
      status: "Em andamento",
    },
    {
      id: "vertice",
      name: "Edifício Vértice",
      client: "Grupo Vértice",
      address: "Av. Paulista, 800, São Paulo, SP",
      manager: "Carlos Mendes",
      start: "2026-03-01",
      end: "2027-02-28",
      budget: 8320000,
      status: "Em andamento",
    },
  ],
  entries: [
    {
      id: "task1",
      work: "aurora",
      kind: "Cronograma",
      name: "Fundação",
      date: "2026-02-01",
      end: "2026-03-15",
      owner: "Mariana Costa",
      progress: 100,
    },
    {
      id: "task2",
      work: "aurora",
      kind: "Cronograma",
      name: "Estrutura",
      date: "2026-03-16",
      end: "2026-10-20",
      owner: "Carlos Mendes",
      progress: 60,
      dependency: "task1",
    },
    {
      id: "b1",
      work: "aurora",
      kind: "Orçamento",
      name: "Estrutura de concreto",
      category: "Estrutura",
      date: "2026-10-01",
      quantity: 2840,
      unit: "m²",
      price: 240,
      labor: 180,
      equipment: 42,
    },
    {
      id: "e1",
      work: "aurora",
      kind: "Equipes",
      name: "Equipe de alvenaria",
      date: "2026-10-05",
      quantity: 96,
      price: 60,
      amount: 5760,
      owner: "Mariana Costa",
      notes: "12 profissionais",
    },
    {
      id: "f1",
      work: "aurora",
      kind: "Financeiro",
      name: "Equipe de alvenaria",
      date: "2026-10-10",
      amount: 5760,
      direction: "Pagar",
      category: "Mão de obra",
      source: "e1",
    },
    {
      id: "f2",
      work: "aurora",
      kind: "Financeiro",
      name: "Medição do cliente",
      date: "2026-10-15",
      amount: 120000,
      direction: "Receber",
      category: "Medições",
    },
    {
      id: "d1",
      work: "aurora",
      kind: "Diário de obra",
      name: "Execução de alvenaria no pavimento 7",
      date: "2026-10-05",
      owner: "Mariana Costa",
      notes: "Tempo parcialmente nublado. Serviços sem interrupções.",
    },
  ],
}
export function load(): Data {
  try {
    const raw = localStorage.getItem("engenharia-integrada-v1")
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.works) && Array.isArray(d.entries) && d.works.length)
        return d
    }
  } catch {
    /* Fall back to coherent sample data. */
  }
  return initial
}
export function progress(entries: Entry[], work: string) {
  const tasks = entries.filter(
    (e) => e.work === work && e.kind === "Cronograma",
  )
  return tasks.length
    ? Math.round(
        tasks.reduce((s, e) => s + (e.progress || 0), 0) / tasks.length,
      )
    : 0
}
// Execution and its payable share a source ID; only execution contributes to incurred costs.
export function actual(entries: Entry[]) {
  return entries.reduce(
    (s, e) =>
      s +
      (["Equipes", "Equipamentos"].includes(e.kind) ||
      (e.kind === "Materiais" && e.movement === "Entrada") ||
      (e.kind === "Financeiro" && e.direction === "Pagar" && !e.source)
        ? cost(e)
        : 0),
    0,
  )
}
