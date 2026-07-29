import {
  LayoutDashboard,
  Target,
  BarChart3,
  Megaphone,
  HandCoins,
  Globe,
  Table2,
  Building2,
  GitCommitHorizontal,
  Flame,
  Users,
  Activity,
  Settings,
  type LucideIcon,
} from "lucide-react";

// Config única de navegación (iconos incluidos), consumida por el Sidebar de
// escritorio y por el drawer móvil del Topbar. Un solo sitio donde tocar rutas,
// etiquetas e iconos. ABM va agrupado y colapsable porque está on hold.
export type NavItem = { href: string; label: string; icon: LucideIcon; onhold?: boolean };
export type NavGroup = { title: string; items: NavItem[]; collapsible?: boolean; defaultCollapsed?: boolean };

export const NAV: NavGroup[] = [
  {
    title: "Rendimiento",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/overview", label: "Overview vs Target", icon: Target },
      { href: "/metrics", label: "Métricas Canal/País", icon: BarChart3 },
      { href: "/paid", label: "Detalle Campaña/Canal", icon: Megaphone },
      { href: "/deals", label: "Deals & Atribución", icon: HandCoins },
      { href: "/organic", label: "Orgánico + AEO", icon: Globe },
    ],
  },
  {
    title: "Planificación",
    items: [{ href: "/explorer", label: "Explorer (pivot)", icon: Table2 }],
  },
  {
    title: "ABM · on hold",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { href: "/abm-accounts", label: "Cuentas", icon: Building2, onhold: true },
      { href: "/abm-timeline", label: "Timeline", icon: GitCommitHorizontal, onhold: true },
      { href: "/abm-heat", label: "Heat Score", icon: Flame, onhold: true },
      { href: "/abm-sdr", label: "Por SDR", icon: Users, onhold: true },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/data-health", label: "Data Health", icon: Activity },
      { href: "/admin", label: "Admin", icon: Settings },
    ],
  },
];
