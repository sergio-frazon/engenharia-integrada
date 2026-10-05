import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react"
import {
  actual,
  cost,
  date,
  id,
  load,
  money,
  progress,
  today,
  type Data,
  type Entry,
  type Work,
} from "./store"
import { cloudError, downloadPrivate } from "./cloud"

const pages = [
  "Visão geral",
  "Obras",
  "Planejamento",
  "Acompanhamento",
  "Financeiro",
  "Relatórios",
]
const symbols = [
  "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "M4 21V3h12v18 M16 9h4v12 M8 7h4 M8 11h4 M8 15h4 M2 21h20",
  "M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18 M7 14h4 M7 17h8",
  "M2 12h5l3-8 4 16 3-8h5",
  "M3 5h17v16H3z M3 9h17 M15 13h7v5h-7z",
  "M4 3h16v18H4z M8 17v-5 M12 17V7 M16 17v-8",
].map((path, i) => (
  <svg
    key={i}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
))
const planning = ["Projetos", "Orçamento", "Cronograma"]
const tracking = [
  "Diário de obra",
  "Equipes",
  "Materiais",
  "Equipamentos",
  "Custos",
]
const finance = [
  "Contas a pagar",
  "Contas a receber",
  "Fluxo de caixa",
  "Boletos",
]
function Button({
  children,
  onClick,
  secondary = false,
  type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  secondary?: boolean
  type?: "submit" | "button"
}) {
  return (
    <button
      type={type}
      className={`btn btn-${secondary ? "secondary" : "primary"}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
function Modal({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const old = document.activeElement as HTMLElement
    ref.current?.querySelector<HTMLElement>("input,button")?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href]",
          ) || [],
        )
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault()
          items.at(-1)?.focus()
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault()
          items[0]?.focus()
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => {
      document.removeEventListener("keydown", handler)
      old?.focus()
    }
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
function download(name: string, body: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"),
      )
      .join("\r\n")
  )
}
function Field({
  label,
  name,
  value,
  type = "text",
  required = true,
  min,
  max,
  step,
}: {
  label: string
  name: string
  value?: string | number
  type?: string
  required?: boolean
  min?: number
  max?: number
  step?: string
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
      />
    </label>
  )
}
function Select({
  label,
  name,
  values,
  value,
}: {
  label: string
  name: string
  values: string[]
  value?: string
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  )
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

export default function IntegratedApp({ initialData, onCommit, onReload, onSignOut, accountEmail }: {
  initialData?: Data;
  onCommit?: (next: Data) => Promise<Data>;
  onReload?: () => void;
  onSignOut?: () => void;
  accountEmail?: string;
} = {}) {
  const [data, setData] = useState<Data>(() => initialData || load())
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [page, setPage] = useState(pages[0])
  const [selected, setSelected] = useState(data.works[0].id)
  const [from, setFrom] = useState("2026-10-01")
  const [to, setTo] = useState("2026-10-31")
  const [tab, setTab] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("Todos")
  const [menu, setMenu] = useState(false)
  const [gantt, setGantt] = useState(false)
  const [editor, setEditor] = useState<{
    kind: string
    entry?: Entry
    work?: Work
  } | null>(null)
  const [panel, setPanel] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [report, setReport] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null)
  const [payment, setPayment] = useState<Entry | null>(null)
  const [paymentDate, setPaymentDate] = useState(today())
  const work = data.works.find((w) => w.id === selected) || data.works[0]
  const own = data.entries.filter((e) => e.work === work.id)
  const inPeriod = (e: Entry) => e.date >= from && e.date <= to
  const period = own.filter(inPeriod)
  const currentTab =
    tab ||
    (page === "Planejamento"
      ? planning[0]
      : page === "Acompanhamento"
        ? tracking[0]
        : finance[0])
  const kind = page === "Financeiro" ? "Financeiro" : currentTab
  const tasks = own.filter((e) => e.kind === "Cronograma")
  const budget = own
    .filter((e) => e.kind === "Orçamento")
    .reduce((s, e) => s + cost(e), 0)
  const accounts = own.filter((e) => e.kind === "Financeiro")
  const due = (direction: string) =>
    accounts
      .filter((e) => e.direction === direction && !e.paid && inPeriod(e))
      .reduce((s, e) => s + cost(e), 0)
  const status = (e: Entry) =>
    e.paid
      ? e.direction === "Receber"
        ? "Recebido"
        : "Pago"
      : e.date < today()
        ? "Atrasado"
        : "A vencer"
  const toast = (s: string) => setMessage(s)
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(""), 4500)
    return () => clearTimeout(timer)
  }, [message])
  useEffect(() => {
    if (onCommit) return
    try {
      localStorage.setItem("engenharia-integrada-v1", JSON.stringify(data))
    } catch {
      setMessage(
        "Não foi possível salvar no navegador. Exporte um backup; o armazenamento pode estar cheio.",
      )
    }
  }, [data, onCommit])
  async function commit(next: Data): Promise<boolean> {
    if (savingRef.current) return false
    savingRef.current = true; setSaving(true); setError("")
    try {
      if (onCommit) setData(await onCommit(next))
      else { localStorage.setItem("engenharia-integrada-v1", JSON.stringify(next)); setData(next) }
      return true
    } catch (e) { const reason = cloudError(e); setError(reason); toast(reason); return false }
    finally { savingRef.current = false; setSaving(false) }
  }
  const navigate = (p: string, t = "") => {
    setPage(p)
    setTab(t)
    setQuery("")
    setFilter("Todos")
    setMenu(false)
  }
  const edit = (k: string, entry?: Entry, w?: Work) => {
    setError("")
    setEditor({ kind: k, entry, work: w })
  }
  const stock = (name: string, excluding?: string) =>
    own
      .filter(
        (e) =>
          e.kind === "Materiais" &&
          e.name.toLowerCase() === name.toLowerCase() &&
          e.id !== excluding,
      )
      .reduce(
        (s, e) => s + (e.movement === "Entrada" ? 1 : -1) * (e.quantity || 0),
        0,
      )
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = event.currentTarget
    const values = new FormData(form)
    const s = (key: string) => String(values.get(key) || "").trim()
    const n = (key: string) => Number(s(key))
    const k = editor.kind
    const fail = (text: string) => setError(text)
    if (!s("name")) return fail("Informe um nome ou descrição.")
    if (
      (k === "Obra" || k === "Cronograma") &&
      s("end") < s(k === "Obra" ? "start" : "date")
    )
      return fail("O término deve ser igual ou posterior ao início.")
    if (k === "Obra") {
      if (
        data.works.some(
          (w) =>
            w.id !== editor.work?.id &&
            w.name.toLowerCase() === s("name").toLowerCase(),
        )
      )
        return fail("Já existe uma obra com esse nome.")
      const w: Work = {
        id: editor.work?.id || id(),
        name: s("name"),
        client: s("client"),
        address: s("address"),
        manager: s("manager"),
        start: s("start"),
        end: s("end"),
        budget: n("budget"),
        status: s("status"),
      }
      if (!await commit({
        ...data,
        works: editor.work
          ? data.works.map((x) => (x.id === w.id ? w : x))
          : [...data.works, w],
      })) return
      setSelected(w.id)
    } else {
      if (
        k === "Materiais" &&
        s("movement") === "Consumo" &&
        n("quantity") > stock(s("name"), editor.entry?.id)
      )
        return fail(
          "Consumo maior que o estoque disponível. Confira o nome do material e registre a entrada.",
        )
      if (k === "Materiais" && editor.entry?.movement === "Entrada") {
        const oldBalance =
          stock(editor.entry.name, editor.entry.id) +
          (s("name").toLowerCase() === editor.entry.name.toLowerCase()
            ? n("quantity")
            : 0)
        if (oldBalance < 0)
          return fail(
            "Esta alteração deixaria o estoque negativo. Ajuste os consumos primeiro.",
          )
      }
      const predecessor = own.find((e) => e.id === s("dependency"))
      if (k === "Cronograma" && predecessor?.end && s("date") < predecessor.end)
        return fail("A atividade deve iniciar após o término da dependência.")
      if (
        k === "Cronograma" &&
        editor.entry &&
        own.some((e) => e.dependency === editor.entry?.id && e.date < s("end"))
      )
        return fail(
          "O novo término ultrapassa o início de uma atividade dependente. Ajuste essa atividade primeiro.",
        )
      if (k === "Cronograma" && editor.entry) {
        let pointer = s("dependency")
        const visited = new Set([editor.entry.id])
        while (pointer) {
          if (visited.has(pointer))
            return fail("A dependência criaria um ciclo.")
          visited.add(pointer)
          pointer = own.find((e) => e.id === pointer)?.dependency || ""
        }
      }
      const e: Entry = {
        ...editor.entry,
        id: editor.entry?.id || id(),
        work: work.id,
        kind: k,
        name: s("name"),
        date: s("date") || today(),
        owner: s("owner"),
        category: s("category"),
        notes: s("notes"),
      }
      if (k === "Cronograma")
        Object.assign(e, {
          end: s("end"),
          progress: n("progress"),
          dependency: s("dependency"),
        })
      if (["Orçamento", "Equipes", "Materiais", "Equipamentos"].includes(k))
        Object.assign(e, {
          quantity: n("quantity"),
          price: n("price"),
          unit: s("unit"),
          labor: n("labor"),
          equipment: n("equipment"),
          movement: s("movement"),
          amount: n("quantity") * n("price"),
        })
      if (k === "Financeiro")
        Object.assign(e, {
          amount: n("amount"),
          direction: s("direction"),
          installments: n("installments") || 1,
        })
      try {
        const readFile = (file: File) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(String(r.result))
            r.onerror = reject
            r.readAsDataURL(file)
          })
        const file = values.get("file") as File
        if (file?.size) {
          if (file.size > 2 * 1024 * 1024)
            return fail("Use arquivos de até 2 MB.")
          e.file = await readFile(file)
          e.filename = file.name
        }
        const photos = values
          .getAll("photos")
          .filter((f): f is File => f instanceof File && f.size > 0)
        if (photos.reduce((sum, f) => sum + f.size, 0) > 2 * 1024 * 1024)
          return fail("As fotos devem somar no máximo 2 MB.")
        if (photos.some((f) => !f.type.startsWith("image/")))
          return fail("Selecione apenas imagens para o diário.")
        if (photos.length) e.photos = await Promise.all(photos.map(readFile))
      } catch {
        return fail("Falha ao ler o arquivo. Tente novamente.")
      }
      if (k === "Projetos") {
        e.version = n("version")
        if (!e.file) return fail("Selecione um arquivo de projeto.")
      }
      let additions = [e]
      if (k === "Financeiro" && !editor.entry && (e.installments || 1) > 1) {
        const count = e.installments!
        const cents = Math.round(e.amount! * 100)
        const base = Math.floor(cents / count)
        additions = Array.from({ length: count }, (_, i) => {
          const [year, month, day] = e.date.split("-").map(Number)
          const last = new Date(year, month + i, 0).getDate()
          const d = new Date(year, month - 1 + i, Math.min(day, last))
          return {
            ...e,
            id: id(),
            name: `${e.name} — parcela ${i + 1}/${count}`,
            amount: (base + (i === count - 1 ? cents - base * count : 0)) / 100,
            date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          }
        })
      }
      if (
        ["Equipes", "Equipamentos", "Materiais"].includes(k) &&
        !(k === "Materiais" && e.movement === "Consumo")
      ) {
        const linked = own.find((x) => x.source === e.id)
        if (linked?.paid && cost(linked) !== cost(e))
          return fail(
            "Este custo já foi pago. Preserve o valor e registre um ajuste financeiro separado.",
          )
        additions.push({
          ...linked,
          id: linked?.id || id(),
          work: work.id,
          kind: "Financeiro",
          name: e.name,
          date: linked?.date || e.date,
          amount: e.amount,
          direction: "Pagar",
          source: e.id,
          category: k === "Equipes" ? "Mão de obra" : k,
        })
      }
      if (k === "Diário de obra" && s("activity")) {
        const task = own.find((x) => x.id === s("activity"))
        if (task) additions.push({ ...task, progress: n("progress") })
      }
      const next = {
        ...data,
        entries: [
          ...data.entries.filter((x) => !additions.some((a) => a.id === x.id)),
          ...additions,
        ],
      }
      if (!await commit(next)) return
    }
    setEditor(null)
    toast("Registro salvo. Os módulos vinculados foram atualizados.")
  }
  const visible = own.filter(
    (e) =>
      e.kind === kind &&
      (![
        "Diário de obra",
        "Equipes",
        "Materiais",
        "Equipamentos",
        "Financeiro",
      ].includes(kind) ||
        inPeriod(e)) &&
      (kind !== "Financeiro" ||
        e.direction ===
          (currentTab === "Contas a receber" || currentTab === "Boletos"
            ? "Receber"
            : "Pagar")) &&
      `${e.name} ${e.owner || ""} ${e.category || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "Todos" ||
        (kind === "Financeiro" ? status(e) : e.category) === filter),
  )
  const exportRows = (entries: Entry[], title: string) =>
    download(
      `${title}.csv`,
      csv([
        [
          "Obra",
          "Tipo",
          "Descrição",
          "Data",
          "Categoria",
          "Quantidade",
          "Valor",
          "Conclusão",
          "Observações",
        ],
        ...entries.map((e) => [
          work.name,
          e.kind,
          e.name,
          date(e.date),
          e.category || "",
          e.quantity || "",
          cost(e),
          e.progress ?? "",
          e.notes || "",
        ]),
      ]),
    )
  const alerts = [
    ...tasks
      .filter((t) => t.end! < today() && (t.progress || 0) < 100)
      .map((t) => `Atividade em atraso: ${t.name}`),
    ...accounts
      .filter((e) => !e.paid && e.date < today())
      .map((e) => `Conta vencida: ${e.name} (${money(cost(e))})`),
  ]
  const reportRows =
    report === "Diário de obra"
      ? period.filter((e) => e.kind === "Diário de obra")
      : report === "Custos por etapa"
        ? own.filter((e) => e.kind === "Orçamento")
        : period.filter((e) => e.kind !== "Orçamento" && e.kind !== "Projetos")
  const header = (
    <div className="page-header">
      <div>
        <div className="eyebrow">{work.name.toUpperCase()}</div>
        <h1>{page}</h1>
        <p>
          {page === "Visão geral"
            ? "Indicadores conectados aos registros da obra."
            : "Gerencie os registros e acompanhe os resultados."}
        </p>
      </div>
      {page !== "Relatórios" && (
        <Button
          onClick={() =>
            edit(
              page === "Visão geral" || page === "Obras"
                ? "Obra"
                : kind === "Custos"
                  ? "Equipes"
                  : kind,
            )
          }
        >
          +{" "}
          {page === "Obras" || page === "Visão geral"
            ? "Cadastrar obra"
            : kind === "Projetos"
              ? "Enviar projeto"
              : "Novo registro"}
        </Button>
      )}
    </div>
  )
  function accountAction(e: Entry) {
    return (
      <>
        {!e.paid && (
          <Button
            secondary
            onClick={() => {
              setPayment(e)
              setPaymentDate(today())
            }}
          >
            Registrar {e.direction === "Receber" ? "recebimento" : "pagamento"}
          </Button>
        )}
        {e.paid && <small>Em {date(e.paid)}</small>}
      </>
    )
  }
  const list = (
    <section className="card table-card">
      <div className="toolbar">
        <div className="search-field">
          <span>⌕</span>
          <input
            aria-label="Buscar registros"
            placeholder="Buscar descrição, disciplina ou responsável..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar registros"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "Todos",
            ...(kind === "Financeiro"
              ? ["A vencer", "Atrasado", "Pago", "Recebido"]
              : Array.from(
                  new Set(
                    own
                      .filter((e) => e.kind === kind)
                      .map((e) => e.category)
                      .filter(Boolean),
                  ),
                )),
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        {kind === "Cronograma" && (
          <Button secondary onClick={() => setGantt(!gantt)}>
            {gantt ? "Ver lista" : "Ver Gantt"}
          </Button>
        )}
        <Button secondary onClick={() => exportRows(visible, kind)}>
          Exportar CSV
        </Button>
      </div>
      {kind === "Cronograma" && gantt ? (
        <div className="gantt">
          <p>
            Escala relativa ao início e término das atividades • barras verdes
            indicam conclusão
          </p>
          {visible.map((e) => {
            const min = Math.min(...tasks.map((t) => Date.parse(t.date)))
            const max = Math.max(...tasks.map((t) => Date.parse(t.end!)))
            const span = Math.max(max - min, 86400000)
            return (
              <div className="gantt-row" key={e.id}>
                <button onClick={() => edit(kind, e)}>
                  {e.name}
                  <small>
                    {date(e.date)} – {date(e.end)}
                  </small>
                </button>
                <div className="gantt-track">
                  <div
                    className="gantt-bar"
                    style={{
                      left: `${((Date.parse(e.date) - min) / span) * 100}%`,
                      width: `${Math.max(1, ((Date.parse(e.end!) - Date.parse(e.date)) / span) * 100)}%`,
                    }}
                  >
                    <i style={{ width: `${e.progress}%` }} />
                    <span>{e.progress}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descrição / responsável</th>
                <th>{kind === "Cronograma" ? "Prazo" : "Data"}</th>
                <th>
                  {kind === "Cronograma"
                    ? "Conclusão"
                    : kind === "Projetos"
                      ? "Disciplina / versão"
                      : "Detalhes"}
                </th>
                <th>
                  {kind === "Diário de obra" || kind === "Projetos"
                    ? "Anexos"
                    : "Valor"}
                </th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    <small className="cell-sub">
                      {e.owner || e.category}
                      {e.source && " • Vinculado à execução"}
                    </small>
                    {e.notes && <small className="cell-sub">{e.notes}</small>}
                  </td>
                  <td>
                    {date(e.date)}
                    {e.end && (
                      <small className="cell-sub">até {date(e.end)}</small>
                    )}
                  </td>
                  <td>
                    {kind === "Cronograma" ? (
                      <>
                        <div className="progress">
                          <div
                            className="progress-bar bg-blue"
                            style={{ width: `${e.progress}%` }}
                          />
                        </div>
                        {e.progress}%
                        <small className="cell-sub">
                          {e.dependency
                            ? `Após: ${own.find((t) => t.id === e.dependency)?.name}`
                            : "Sem dependência"}
                        </small>
                      </>
                    ) : kind === "Financeiro" ? (
                      <span
                        className={`badge badge-${
                          e.paid ? "green" : e.date < today() ? "red" : "yellow"
                        }`}
                      >
                        {status(e)}
                      </span>
                    ) : kind === "Projetos" ? (
                      `${e.category} • v${e.version}`
                    ) : kind === "Materiais" ? (
                      `${e.movement}: ${e.quantity} ${e.unit || ""} • estoque ${stock(e.name)}`
                    ) : kind === "Orçamento" ? (
                      <>{e.quantity} {e.unit}<small className="cell-sub">Materiais: {money((e.quantity || 0) * (e.price || 0))}<br />Mão de obra: {money((e.quantity || 0) * (e.labor || 0))}<br />Equipamentos: {money((e.quantity || 0) * (e.equipment || 0))}</small></>
                    ) : e.quantity ? (
                      `${e.quantity} ${e.unit || "h"} × ${money(e.price || 0)}`
                    ) : (
                      "Registro de campo"
                    )}
                  </td>
                  <td>
                    {kind === "Projetos" ? (
                      <a href={e.file} download={e.filename} onClick={e.filePath ? (event) => { event.preventDefault(); void downloadPrivate(e.filePath!, e.filename || "projeto").catch(error => toast(cloudError(error))); } : undefined}>
                        Baixar {e.filename}
                      </a>
                    ) : kind === "Diário de obra" ? (
                      <div className="diary-photos">
                        {e.photos?.map((src, i) => (
                          <a key={i} href={src} download={`foto-${i + 1}.jpg`} onClick={e.photoPaths?.[i] ? (event) => { event.preventDefault(); void downloadPrivate(e.photoPaths![i], `foto-${i + 1}.jpg`).catch(error => toast(cloudError(error))); } : undefined}>
                            <img src={src} alt={`Foto ${i + 1} de ${e.name}`} />
                          </a>
                        ))}
                        {!e.photos?.length && "Sem fotos"}
                      </div>
                    ) : kind === "Cronograma" ? (
                      "—"
                    ) : (
                      money(cost(e))
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {kind === "Financeiro" && accountAction(e)}
                      {!e.source && !e.paid && (
                        <Button secondary onClick={() => edit(kind, e)}>
                          Editar
                        </Button>
                      )}
                      {!e.source && !e.paid && (
                        <button
                          className="text-button danger"
                          onClick={() => {
                            setError("")
                            setPendingDelete(e)
                          }}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="empty-state">
              Nenhum registro neste filtro. Altere o período ou cadastre um
              registro.
            </div>
          )}
        </div>
      )}
      <div className="table-footer">
        {visible.length} registros • Obra: {work.name}
      </div>
    </section>
  )

  return (
    <><div className="app-shell" inert={saving} aria-busy={saving}>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Engenharia</strong>
            <span>Integrada</span>
          </div>
          <button className="mobile-close" onClick={() => setMenu(false)}>
            ✕
          </button>
        </div>
        <nav>
          {pages.map((p, i) => (
            <button
              className={page === p ? "active" : ""}
              key={p}
              onClick={() => navigate(p)}
            >
              <span>{symbols[i]}</span>
              {p}
            </button>
          ))}
        </nav>
        <div className="sidebar-project">
          <strong>{work.name}</strong>
          <div className="progress">
            <div
              className="progress-bar bg-blue"
              style={{ width: `${progress(data.entries, work.id)}%` }}
            />
          </div>
          <small>Avanço físico: {progress(data.entries, work.id)}%</small>
        </div>
        <div className="sidebar-help">
          <strong>{onCommit ? "Conectado ao Supabase" : "Dados neste navegador"}</strong>
          <p>{onCommit ? "Seus registros estão salvos na sua conta." : "Exporte um backup para guardar seus registros."}</p>
          <button
            onClick={() =>
              download(
                "engenharia-backup.json",
                JSON.stringify(data, null, 2),
                "application/json",
              )
            }
          >
            Exportar backup
          </button>
          <button onClick={() => setPanel("Ajuda")}>Central de ajuda</button>
          {onReload && <button onClick={onReload}>Atualizar dados da nuvem</button>}
          {onSignOut && <button onClick={onSignOut}>Sair da conta</button>}
        </div>
      </aside>
      {menu && (
        <div className="sidebar-overlay" onClick={() => setMenu(false)} />
      )}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              aria-label="Abrir menu"
              onClick={() => setMenu(true)}
            >
              ☰
            </button>
            <label className="work-selector">
              <select
                aria-label="Obra selecionada"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setFilter("Todos")
                }}
              >
                {data.works.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="period-inputs">
              <input
                aria-label="Início do período"
                type="date"
                value={from}
                max={to}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
              />
              <span>até</span>
              <input
                aria-label="Fim do período"
                type="date"
                value={to}
                min={from}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="topbar-right">
            <button
              className="notification"
              aria-label="Notificações"
              onClick={() => setPanel("Notificações")}
            >
              ♧{alerts.length > 0 && <i />}
            </button>
            <button
              className="profile profile-button"
              onClick={() => setPanel("Perfil")}
            >
              <span>{data.profile.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{data.profile}</strong>
                <small>{accountEmail || "Administrador"}</small>
              </div>
            </button>
          </div>
        </header>
        <main>
          {header}
          {page === "Visão geral" && (
            <>
              <div className="metrics-grid">
                <Metric
                  label="Obras ativas"
                  value={
                    data.works.filter((w) => w.status !== "Concluída").length
                  }
                />
                <Metric
                  label="Orçamento de referência"
                  value={money(work.budget)}
                />
                <Metric
                  label="Custo realizado no período"
                  value={money(actual(period))}
                />
                <Metric label="Contas a pagar" value={money(due("Pagar"))} />
                <Metric
                  label="Contas a receber"
                  value={money(due("Receber"))}
                />
              </div>
              <div className="dashboard-grid">
                <section className="card chart-card">
                  <h2>Custos por categoria</h2>
                  <p>Orçamento detalhado × realizado no período</p>
                  <div className="legend">
                    <span>
                      <i className="dot navy" />
                      Previsto
                    </span>
                    <span>
                      <i className="dot blue" />
                      Realizado
                    </span>
                  </div>
                  <div className="bar-chart">
                    {["Materiais", "Mão de obra", "Equipamentos"].map(
                      (c, index) => {
                        const planned = own
                          .filter((e) => e.kind === "Orçamento")
                          .reduce(
                            (s, e) =>
                              s +
                              (e.quantity || 0) *
                                (index === 0
                                  ? e.price || 0
                                  : index === 1
                                    ? e.labor || 0
                                    : e.equipment || 0),
                            0,
                          )
                        const spent = actual(
                          period.filter(
                            (e) =>
                              e.category === c ||
                              e.kind === (index === 1 ? "Equipes" : c),
                          ),
                        )
                        const scale = Math.max(budget, actual(period), 1)
                        return (
                          <div className="bar-group" key={c}>
                            <div className="bars">
                              <i
                                title={money(planned)}
                                style={{
                                  height: `${(planned / scale) * 100}%`,
                                }}
                              />
                              <i
                                title={money(spent)}
                                style={{ height: `${(spent / scale) * 100}%` }}
                              />
                            </div>
                            <span>{c}</span>
                            <small>{money(spent)}</small>
                          </div>
                        )
                      },
                    )}
                  </div>
                </section>
                <section className="card chart-card">
                  <h2>Avanço físico previsto × realizado</h2>
                  <p>Média das atividades • posição em {date(to)}</p>
                  {(() => {
                    const expected = tasks.length
                      ? Math.round(
                          tasks.reduce(
                            (s, e) =>
                              s +
                              Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((Date.parse(to) - Date.parse(e.date)) /
                                    Math.max(
                                      86400000,
                                      Date.parse(e.end!) - Date.parse(e.date),
                                    )) *
                                    100,
                                ),
                              ),
                            0,
                          ) / tasks.length,
                        )
                      : 0
                    return (
                      <div className="physical">
                        <strong>Previsto {expected}%</strong>
                        <div className="progress">
                          <div
                            className="progress-bar bg-blue"
                            style={{ width: `${expected}%` }}
                          />
                        </div>
                        <strong>
                          Realizado atual {progress(data.entries, work.id)}%
                        </strong>
                        <div className="progress">
                          <div
                            className="progress-bar bg-green"
                            style={{
                              width: `${progress(data.entries, work.id)}%`,
                            }}
                          />
                        </div>
                        <Button
                          secondary
                          onClick={() => navigate("Planejamento", "Cronograma")}
                        >
                          Abrir cronograma
                        </Button>
                      </div>
                    )
                  })()}
                </section>
              </div>
              <section className="card alerts-card">
                <h2>Alertas da obra ({alerts.length})</h2>
                {alerts.length ? (
                  alerts.map((a) => (
                    <button
                      key={a}
                      className="alert-row alert-link"
                      onClick={() =>
                        navigate(
                          a.startsWith("Atividade")
                            ? "Planejamento"
                            : "Financeiro",
                          a.startsWith("Atividade")
                            ? "Cronograma"
                            : "Contas a pagar",
                        )
                      }
                    >
                      {a}
                    </button>
                  ))
                ) : (
                  <p>Sem atrasos registrados.</p>
                )}
              </section>
              <div className="quick-section">
                <h2>Atalhos rápidos</h2>
                <div className="quick-grid">
                  {["Diário de obra", "Equipes", "Materiais", "Financeiro"].map(
                    (k) => (
                      <button
                        className="quick-card"
                        key={k}
                        onClick={() => {
                          navigate(
                            k === "Financeiro"
                              ? "Financeiro"
                              : "Acompanhamento",
                            k === "Financeiro" ? "Contas a pagar" : k,
                          )
                          edit(k)
                        }}
                      >
                        <strong>
                          + {k === "Financeiro" ? "Lançar conta" : k}
                        </strong>
                        <span>Registrar agora →</span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </>
          )}
          {page === "Obras" && (
            <section className="card table-card">
              <div className="toolbar">
                <div className="search-field">
                  <input
                    aria-label="Buscar obras"
                    placeholder="Buscar obra, cliente, endereço ou responsável..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Status das obras"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {[
                    "Todos",
                    "Planejamento",
                    "Em andamento",
                    "Atenção",
                    "Atrasada",
                    "Concluída",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Obra / cliente</th>
                      <th>Responsável</th>
                      <th>Prazo</th>
                      <th>Orçamento</th>
                      <th>Avanço</th>
                      <th>Status / ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.works
                      .filter(
                        (w) =>
                          `${w.name} ${w.client} ${w.address} ${w.manager}`
                            .toLowerCase()
                            .includes(query.toLowerCase()) &&
                          (filter === "Todos" || w.status === filter),
                      )
                      .map((w) => (
                        <tr key={w.id}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelected(w.id)
                                navigate("Visão geral")
                              }}
                            >
                              {w.name}
                            </button>
                            <small className="cell-sub">
                              {w.client}
                              <br />
                              {w.address}
                            </small>
                          </td>
                          <td>{w.manager}</td>
                          <td>
                            {date(w.start)}
                            <br />
                            {date(w.end)}
                          </td>
                          <td>{money(w.budget)}</td>
                          <td>{progress(data.entries, w.id)}%</td>
                          <td>
                            <span
                              className={`badge badge-${
                                w.status === "Atrasada"
                                  ? "red"
                                  : w.status === "Atenção"
                                    ? "yellow"
                                    : "green"
                              }`}
                            >
                              {w.status}
                            </span>
                            <Button
                              secondary
                              onClick={() => edit("Obra", undefined, w)}
                            >
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {["Planejamento", "Acompanhamento", "Financeiro"].includes(page) && (
            <>
              <div className="tabs scroll-tabs">
                {(page === "Planejamento"
                  ? planning
                  : page === "Acompanhamento"
                    ? tracking
                    : finance
                ).map((t) => (
                  <button
                    key={t}
                    className={currentTab === t ? "active" : ""}
                    onClick={() => {
                      setTab(t)
                      setFilter("Todos")
                      setQuery("")
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {(currentTab === "Orçamento" ||
                currentTab === "Custos" ||
                page === "Financeiro") && (
                <div className="budget-cards">
                  <Metric label="Orçamento detalhado" value={money(budget)} />
                  <Metric
                    label="Realizado no período"
                    value={money(actual(period))}
                  />
                  <Metric
                    label="A pagar no período"
                    value={money(due("Pagar"))}
                  />
                  <Metric
                    label="Saldo de contas abertas"
                    value={money(due("Receber") - due("Pagar"))}
                  />
                </div>
              )}
              {currentTab === "Custos" ? (
                <section className="card report-preview">
                  <h2>Comparativo de custos</h2>
                  <p>
                    Contas originadas em equipes, entradas de materiais e
                    equipamentos não são somadas novamente. Consumo de estoque
                    não gera uma segunda despesa.
                  </p>
                  <p>
                    Previsto detalhado: <strong>{money(budget)}</strong> •
                    Realizado no período:{" "}
                    <strong>{money(actual(period))}</strong>
                  </p>
                  <Button
                    secondary
                    onClick={() =>
                      exportRows(
                        period.filter((e) =>
                          [
                            "Equipes",
                            "Materiais",
                            "Equipamentos",
                            "Financeiro",
                          ].includes(e.kind),
                        ),
                        "custos",
                      )
                    }
                  >
                    Exportar registros de custos
                  </Button>
                </section>
              ) : currentTab === "Fluxo de caixa" ? (
                <section className="card table-card">
                  <div className="card-head">
                    <div>
                      <h2>Fluxo de caixa</h2>
                      <p>
                        Movimentos pagos pela data de liquidação; projeção pela
                        data de vencimento. Saldo acumulado do período, sem
                        saldo inicial.
                      </p>
                    </div>
                    <Button
                      secondary
                      onClick={() =>
                        exportRows(
                          accounts.filter((e) =>
                            inPeriod({ ...e, date: e.paid || e.date }),
                          ),
                          "fluxo-de-caixa",
                        )
                      }
                    >
                      Exportar CSV
                    </Button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Descrição</th>
                          <th>Realizado</th>
                          <th>Projetado</th>
                          <th>Saldo acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let balance = 0
                          return accounts
                            .filter((e) =>
                              inPeriod({ ...e, date: e.paid || e.date }),
                            )
                            .sort((a, b) =>
                              (a.paid || a.date).localeCompare(
                                b.paid || b.date,
                              ),
                            )
                            .map((e) => {
                              const amount =
                                cost(e) * (e.direction === "Receber" ? 1 : -1)
                              balance += amount
                              return (
                                <tr key={e.id}>
                                  <td>{date(e.paid || e.date)}</td>
                                  <td>{e.name}</td>
                                  <td>{e.paid ? money(amount) : "—"}</td>
                                  <td>{!e.paid ? money(amount) : "—"}</td>
                                  <td>{money(balance)}</td>
                                </tr>
                              )
                            })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : currentTab === "Boletos" ? (
                <section className="card report-preview">
                  <h2>Boletos simulados</h2>
                  <p>
                    SEM VALIDADE • Demonstração sem cobrança ou integração
                    bancária.
                  </p>
                  {accounts
                    .filter((e) => e.direction === "Receber" && inPeriod(e))
                    .map((e) => (
                      <div className="boleto-row" key={e.id}>
                        <strong>
                          {e.name} • {money(cost(e))}
                        </strong>
                        <span>Vencimento {date(e.date)}</span>
                        <Button
                          secondary
                          onClick={() => {
                            setReport(`Boleto:${e.id}`)
                          }}
                        >
                          Visualizar / imprimir
                        </Button>
                      </div>
                    ))}
                  {!accounts.some(
                    (e) => e.direction === "Receber" && inPeriod(e),
                  ) && (
                    <p>Cadastre uma conta a receber para emitir a simulação.</p>
                  )}
                </section>
              ) : (
                list
              )}
            </>
          )}
          {page === "Relatórios" && (
            <>
              <section className="card report-preview">
                <h2>{work.name}</h2>
                <p>
                  Período: {date(from)} a {date(to)}. Use os seletores no topo
                  para atualizar os relatórios.
                </p>
                <Button
                  secondary
                  onClick={() => exportRows(period, "central-de-relatorios")}
                >
                  Exportar central CSV
                </Button>
              </section>
              <div className="reports-grid">
                {[
                  "Gerencial",
                  "Físico-financeiro",
                  "Custos por etapa",
                  "Diário de obra",
                ].map((r) => (
                  <section className="card report-card" key={r}>
                    <h2>{r}</h2>
                    <p>Dados consolidados da obra e do período selecionados.</p>
                    <Button secondary onClick={() => setReport(r)}>
                      Visualizar / salvar PDF
                    </Button>
                  </section>
                ))}
              </div>
            </>
          )}
        </main>
        <nav className="mobile-nav">
          {pages.map((p, i) => (
            <button
              key={p}
              className={page === p ? "active" : ""}
              onClick={() => navigate(p)}
            >
              <span>{symbols[i]}</span>
              {p === "Visão geral" ? "Início" : p}
            </button>
          ))}
        </nav>
      </div>
      {editor && (
        <Modal
          title={
            editor.entry || editor.work
              ? `Editar ${editor.kind.toLowerCase()}`
              : `Novo registro: ${editor.kind}`
          }
          close={() => setEditor(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <Field
                label={
                  editor.kind === "Obra"
                    ? "Nome da obra"
                    : "Descrição / serviço / arquivo"
                }
                name="name"
                value={editor.work?.name || editor.entry?.name}
              />
              {editor.kind === "Obra" ? (
                <>
                  <Field
                    label="Cliente"
                    name="client"
                    value={editor.work?.client}
                  />
                  <Field
                    label="Endereço completo"
                    name="address"
                    value={editor.work?.address}
                  />
                  <Field
                    label="Responsável"
                    name="manager"
                    value={editor.work?.manager}
                  />
                  <Field
                    label="Início"
                    name="start"
                    type="date"
                    value={editor.work?.start || today()}
                  />
                  <Field
                    label="Término"
                    name="end"
                    type="date"
                    value={editor.work?.end}
                  />
                  <Field
                    label="Orçamento de referência (R$)"
                    name="budget"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editor.work?.budget}
                  />
                  <Select
                    label="Status"
                    name="status"
                    values={[
                      "Planejamento",
                      "Em andamento",
                      "Atenção",
                      "Atrasada",
                      "Concluída",
                    ]}
                    value={editor.work?.status}
                  />
                </>
              ) : (
                <>
                  <Field
                    label={editor.kind === "Financeiro" ? "Vencimento" : "Data"}
                    name="date"
                    type="date"
                    value={editor.entry?.date || today()}
                  />
                  {editor.kind !== "Financeiro" && (
                    <Field
                      label="Responsável"
                      name="owner"
                      value={editor.entry?.owner || work.manager}
                    />
                  )}
                  <Field
                    label={
                      editor.kind === "Projetos"
                        ? "Disciplina"
                        : "Etapa / categoria"
                    }
                    name="category"
                    value={editor.entry?.category}
                    required={["Projetos", "Orçamento", "Financeiro"].includes(
                      editor.kind,
                    )}
                  />
                  {editor.kind === "Cronograma" && (
                    <>
                      <Field
                        label="Término"
                        name="end"
                        type="date"
                        value={editor.entry?.end}
                      />
                      <Field
                        label="Conclusão (%)"
                        name="progress"
                        type="number"
                        min={0}
                        max={100}
                        value={editor.entry?.progress || 0}
                      />
                      <label>
                        Depende de
                        <select
                          name="dependency"
                          defaultValue={editor.entry?.dependency || ""}
                        >
                          <option value="">Sem dependência</option>
                          {tasks
                            .filter((t) => t.id !== editor.entry?.id)
                            .map((t) => (
                              <option value={t.id} key={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                  {[
                    "Orçamento",
                    "Equipes",
                    "Materiais",
                    "Equipamentos",
                  ].includes(editor.kind) && (
                    <>
                      <Field
                        label={
                          editor.kind === "Equipes" ||
                          editor.kind === "Equipamentos"
                            ? "Horas totais"
                            : "Quantidade"
                        }
                        name="quantity"
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={editor.entry?.quantity}
                      />
                      <Field
                        label="Unidade (h, kg, saco, m²...)"
                        name="unit"
                        value={
                          editor.entry?.unit ||
                          (editor.kind === "Equipes" ||
                          editor.kind === "Equipamentos"
                            ? "h"
                            : "un")
                        }
                      />
                      <Field
                        label="Preço unitário (R$)"
                        name="price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={editor.entry?.price}
                      />
                    </>
                  )}
                  {editor.kind === "Orçamento" && (
                    <>
                      <Field
                        label="Mão de obra por unidade (R$)"
                        name="labor"
                        type="number"
                        min={0}
                        step="0.01"
                        value={editor.entry?.labor || 0}
                      />
                      <Field
                        label="Equipamento por unidade (R$)"
                        name="equipment"
                        type="number"
                        min={0}
                        step="0.01"
                        value={editor.entry?.equipment || 0}
                      />
                    </>
                  )}
                  {editor.kind === "Materiais" && (
                    <Select
                      label="Movimentação"
                      name="movement"
                      values={
                        editor.entry
                          ? [editor.entry.movement || "Entrada"]
                          : ["Entrada", "Consumo"]
                      }
                      value={editor.entry?.movement}
                    />
                  )}
                  {editor.kind === "Financeiro" && (
                    <>
                      <Select
                        label="Tipo"
                        name="direction"
                        values={["Pagar", "Receber"]}
                        value={editor.entry?.direction}
                      />
                      <Field
                        label="Valor total (R$)"
                        name="amount"
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={editor.entry?.amount}
                      />
                      {!editor.entry && (
                        <Field
                          label="Parcelas mensais"
                          name="installments"
                          type="number"
                          min={1}
                          max={60}
                          value={1}
                        />
                      )}
                    </>
                  )}
                  {editor.kind === "Projetos" && (
                    <>
                      <Field
                        label="Versão"
                        name="version"
                        type="number"
                        min={1}
                        value={editor.entry?.version || 1}
                      />
                      <label>
                        Arquivo (até 2 MB)
                        <input
                          name="file"
                          type="file"
                          required={!editor.entry?.file}
                        />
                      </label>
                    </>
                  )}
                  {editor.kind === "Diário de obra" && (
                    <>
                      <label>
                        Fotos (até 2 MB no total)
                        <input
                          name="photos"
                          type="file"
                          accept="image/*"
                          multiple
                        />
                      </label>
                      <label>
                        Atualizar atividade
                        <select name="activity">
                          <option value="">Sem atualização</option>
                          {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label="Nova conclusão da atividade (%)"
                        name="progress"
                        type="number"
                        min={0}
                        max={100}
                        value={0}
                      />
                      <p className="form-note">
                        Se selecionar uma atividade, a conclusão informada
                        substituirá o progresso atual.
                      </p>
                    </>
                  )}
                  <label className="wide">
                    {editor.kind === "Diário de obra"
                      ? "Serviços executados, condições e ocorrências"
                      : "Observações / alocação"}
                    <textarea
                      name="notes"
                      defaultValue={editor.entry?.notes}
                      rows={3}
                    />
                  </label>
                </>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-note">
              Obra vinculada: {work.name}
              {["Equipes", "Equipamentos", "Materiais"].includes(editor.kind) &&
                " • Entradas e utilização geram uma conta a pagar vinculada; consumo não duplica custos."}
            </div>
            <div className="modal-actions">
              <Button secondary onClick={() => setEditor(null)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar registro</Button>
            </div>
          </form>
        </Modal>
      )}
      {payment && (
        <Modal
          title={`Registrar ${
            payment.direction === "Receber" ? "recebimento" : "pagamento"
          }`}
          close={() => setPayment(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!await commit({
                ...data,
                entries: data.entries.map((x) =>
                  x.id === payment.id ? { ...x, paid: paymentDate } : x,
                ),
              })) return
              setPayment(null)
              toast("Liquidação registrada no fluxo de caixa.")
            }}
          >
            <p>
              {payment.name} • {money(cost(payment))}
            </p>
            <label>
              Data da liquidação
              <input
                required
                type="date"
                max={today()}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <Button secondary onClick={() => setPayment(null)}>
                Cancelar
              </Button>
              <Button type="submit">Confirmar liquidação</Button>
            </div>
          </form>
        </Modal>
      )}
      {pendingDelete && (
        <Modal title="Excluir registro" close={() => setPendingDelete(null)}>
          <p>Excluir “{pendingDelete.name}” e a conta vinculada, se houver?</p>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <Button secondary onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const linked = own.find((e) => e.source === pendingDelete.id)
                if (linked?.paid)
                  return setError(
                    "A conta vinculada já foi paga; o registro deve ser preservado.",
                  )
                if (own.some((e) => e.dependency === pendingDelete.id))
                  return setError(
                    "Remova a dependência nas outras atividades antes de excluir.",
                  )
                if (
                  pendingDelete.kind === "Materiais" &&
                  pendingDelete.movement === "Entrada" &&
                  stock(pendingDelete.name, pendingDelete.id) < 0
                )
                  return setError(
                    "Esta entrada sustenta consumos existentes. Ajuste os consumos primeiro.",
                  )
                if (!await commit({
                  ...data,
                  entries: data.entries.filter(
                    (e) =>
                      e.id !== pendingDelete.id &&
                      e.source !== pendingDelete.id,
                  ),
                })) return
                setPendingDelete(null)
                toast("Registro excluído.")
              }}
            >
              Excluir
            </Button>
          </div>
        </Modal>
      )}
      {panel && (
        <Modal title={panel} close={() => setPanel("")}>
          {panel === "Notificações" ? (
            alerts.length ? (
              alerts.map((a) => <p key={a}>{a}</p>)
            ) : (
              <p>Sem alertas para esta obra.</p>
            )
          ) : panel === "Perfil" ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const name = String(
                  new FormData(e.currentTarget).get("profile") || "",
                ).trim()
                if (!name) return
                if (!await commit({ ...data, profile: name })) return
                setPanel("")
                toast("Perfil atualizado.")
              }}
            >
              <Field label="Nome" name="profile" value={data.profile} />
              <div className="modal-actions">
                <Button type="submit">Salvar</Button>
              </div>
            </form>
          ) : (
            <>
              <p>
                Cadastre uma obra, selecione-a no topo e preencha o
                planejamento. Registre a execução para criar custos e contas
                vinculadas. No financeiro, liquide as contas para atualizar o
                caixa.
              </p>
              <p>
                {onCommit ? "Os dados e anexos ficam privados no Supabase, vinculados à sua conta. Use Atualizar dados da nuvem para carregar alterações feitas em outro dispositivo." : "Os dados e anexos ficam neste navegador."} Os relatórios podem ser impressos ou salvos como PDF pela janela de impressão.
              </p>
            </>
          )}
        </Modal>
      )}
      {report && (
        <Modal
          title={
            report.startsWith("Boleto:")
              ? "Boleto simulado"
              : `Relatório ${report}`
          }
          close={() => setReport("")}
        >
          <div className="printable">
            {report.startsWith("Boleto:") ? (
              (() => {
                const e = accounts.find((a) => a.id === report.split(":")[1])
                return (
                  e && (
                    <>
                      <h1>SEM VALIDADE — BOLETO SIMULADO</h1>
                      <p>Engenharia Integrada • {work.name}</p>
                      <p>Cliente: {work.client}</p>
                      <h2>{e.name}</h2>
                      <p>
                        Valor: {money(cost(e))} • Vencimento: {date(e.date)}
                      </p>
                      <p>Identificador demonstrativo: {e.id}</p>
                      <p>
                        Documento de demonstração. Não pagar. Sem registro
                        bancário.
                      </p>
                    </>
                  )
                )
              })()
            ) : (
              <>
                <h1>
                  {report} • {work.name}
                </h1>
                <p>
                  {date(from)} a {date(to)}
                </p>
                <p>
                  Orçamento de referência: {money(work.budget)} • Detalhado:{" "}
                  {money(budget)}
                </p>
                <p>
                  Custo realizado no período: {money(actual(period))} • Avanço
                  atual: {progress(data.entries, work.id)}%
                </p>
                <p>
                  A pagar: {money(due("Pagar"))} • A receber:{" "}
                  {money(due("Receber"))}
                </p>
                {report === "Custos por etapa" && <table><thead><tr><th>Etapa / categoria</th><th>Previsto total</th><th>Realizado no período</th><th>Diferença</th></tr></thead><tbody>{Array.from(new Set([...own.filter(e => e.kind === "Orçamento"), ...period].map(e => e.category || "Sem etapa"))).map(category => { const predicted = own.filter(e => e.kind === "Orçamento" && (e.category || "Sem etapa") === category).reduce((sum, e) => sum + cost(e), 0); const spent = actual(period.filter(e => (e.category || "Sem etapa") === category)); return <tr key={category}><td>{category}</td><td>{money(predicted)}</td><td>{money(spent)}</td><td>{money(spent - predicted)}</td></tr>; })}</tbody></table>}
                {report === "Físico-financeiro" && <table><thead><tr><th>Atividade</th><th>Prazo</th><th>Conclusão atual</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td>{task.name}</td><td>{date(task.date)} a {date(task.end)}</td><td>{task.progress}%</td></tr>)}</tbody></table>}
                <table>
                  <thead>
                    <tr>
                      <th>Registro</th>
                      <th>Data</th>
                      <th>Valor / detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.kind}: {e.name}
                        </td>
                        <td>{date(e.date)}</td>
                        <td>
                          {e.kind === "Diário de obra"
                            ? e.notes
                            : money(cost(e))}
                          {e.source &&
                            " (conta vinculada; não somada no custo)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
          <div className="modal-actions">
            <Button secondary onClick={() => exportRows(reportRows, report)}>
              Exportar CSV
            </Button>
            <Button onClick={() => window.print()}>
              Imprimir / salvar PDF
            </Button>
          </div>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          <div>
            <strong>Engenharia Integrada</strong>
            <p>{message}</p>
          </div>
          <button aria-label="Fechar mensagem" onClick={() => setMessage("")}>
            ✕
          </button>
        </div>
      )}
    </div>
    {saving && <div className="sync-overlay" role="status">Salvando {onCommit ? "no Supabase" : "registro"}…</div>}
    </>
  )
}
