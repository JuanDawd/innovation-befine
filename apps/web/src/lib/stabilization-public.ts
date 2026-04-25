import type {
  StabilizationSnapshot,
  StabilizationStatus,
  StabilizationTask,
} from "./stabilization";

export interface PublicTask {
  title: string;
  status: StabilizationStatus;
}

export interface PublicSnapshot {
  phase: string;
  total: number;
  done: number;
  remaining: number;
  progressPct: number;
  tasks: PublicTask[];
}

const TITLE_RULES: Array<[RegExp, string]> = [
  [/^Detect unpaid past business days in payroll/i, "Mejorar control de pagos"],
  [/^Block payout creation when prior days unpaid/i, "Evitar pagos duplicados"],
  [/^Default payroll form to current business day/i, "Simplificar registro de pagos"],
  [/^Show pending payments banner on payroll dashboard/i, "Visibilidad de pagos pendientes"],
  [/^Show per-day payout status grid/i, "Resumen diario de pagos"],
  [/payroll/i, "Mejorar pagos"],
  [/payout/i, "Mejorar pagos"],
  [/sidebar active state|active route detection/i, "Mejorar navegación"],
  [/Group nav into/i, "Reorganizar navegación"],
  [/Remove "Disponible en Fase X"/i, "Limpiar mensajes de la app"],
  [/Remove "Configuración"/i, "Ocultar opciones no disponibles"],
  [/Expand user menu/i, "Mejorar menú de usuario"],
  [/Remove fixed-position logout button/i, "Mejorar menú de usuario"],
  [/Remove hardcoded disabled/i, "Habilitar acciones disponibles"],
  [/Large Order/i, "Pedidos grandes"],
  [/Cashier dashboard/i, "Mejorar inicio de caja"],
  [/Analytics/i, "Mejorar analíticas"],
  [/notification bell/i, "Mejorar notificaciones"],
  [/Toast notifications/i, "Mejorar feedback al usuario"],
  [/Sidebar collapse persistence/i, "Mejorar navegación"],
  [/Mobile bottom nav/i, "Mejorar navegación móvil"],
  [/roadmap/i, "Página de progreso"],
  [/stabilization markdown parser/i, "Página de progreso"],
];

const BLOCKED_KEYWORDS = [
  /financial/i,
  /idempotenc/i,
  /sentry/i,
  /sql/i,
  /transaction/i,
  /price_override/i,
];

function simplifyTitle(internal: string): string {
  for (const [pattern, replacement] of TITLE_RULES) {
    if (pattern.test(internal)) return replacement;
  }
  return "Mejora del producto";
}

function isPublicSafe(task: StabilizationTask): boolean {
  for (const k of BLOCKED_KEYWORDS) {
    if (k.test(task.title)) return false;
    for (const s of task.scope) if (k.test(s)) return false;
  }
  return true;
}

export function buildPublicSnapshot(snapshot: StabilizationSnapshot): PublicSnapshot {
  const safe = snapshot.tasks.filter(isPublicSafe);

  const titles = new Set<string>();
  const tasks: PublicTask[] = [];
  for (const t of safe) {
    const title = simplifyTitle(t.title);
    const key = `${title}|${t.status}`;
    if (titles.has(key)) continue;
    titles.add(key);
    tasks.push({ title, status: t.status });
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const remaining = total - done;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return { phase: snapshot.phase, total, done, remaining, progressPct, tasks };
}

export { simplifyTitle };
