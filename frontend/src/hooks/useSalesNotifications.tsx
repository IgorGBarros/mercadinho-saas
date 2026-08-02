import { useState, useEffect, useMemo } from "react";
import { movementsApi, Movement, formatMoney } from "../lib/api";
import { useAuth } from "../../src/hooks/useAuth";

export interface SalesMilestone {
  id: string;
  type: "milestone";
  title: string;
  description: string;
  value: number;
  icon: "trophy" | "star" | "flame";
}

export interface TopProduct {
  product_name: string;
  barcode: string;
  totalQty: number;
  totalRevenue: number;
}

export interface WeeklyInsight {
  id: string;
  type: "weekly_top";
  title: string;
  description: string;
  products: TopProduct[];
}

export type Notification = SalesMilestone | WeeklyInsight;

const MILESTONES = [
  { threshold: 500, label: "R$ 500", icon: "star" as const },
  { threshold: 1000, label: "R$ 1.000", icon: "trophy" as const },
  { threshold: 2500, label: "R$ 2.500", icon: "trophy" as const },
  { threshold: 5000, label: "R$ 5.000", icon: "flame" as const },
  { threshold: 10000, label: "R$ 10.000", icon: "flame" as const },
];

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function useSalesNotifications() {
  const { user } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    movementsApi.list()
      .then(setMovements)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const { milestones, weeklyInsight, topProducts, totalSalesMonth, totalSalesWeek } = useMemo(() => {
    const sales = movements.filter((m) => m.movement_type === "saida" && m.sale_type === "venda");

    // Monthly sales total
    const monthStart = getMonthStart();
    const monthlySales = sales.filter((m) => new Date(m.created_at) >= monthStart);
    const totalSalesMonth = monthlySales.reduce((sum, m) => sum + (m.unit_price || 0) * m.quantity, 0);

    // Weekly sales
    const weekStart = getWeekStart();
    const weeklySales = sales.filter((m) => new Date(m.created_at) >= weekStart);
    const totalSalesWeek = weeklySales.reduce((sum, m) => sum + (m.unit_price || 0) * m.quantity, 0);

    // All-time total for milestones
    const allTimeSales = sales.reduce((sum, m) => sum + (m.unit_price || 0) * m.quantity, 0);

    // Dismissed milestones
    const dismissed = JSON.parse(localStorage.getItem("dismissed_milestones") || "[]") as number[];

    // Check milestones
    const milestones: SalesMilestone[] = MILESTONES
      .filter((m) => allTimeSales >= m.threshold && !dismissed.includes(m.threshold))
      .map((m) => ({
        id: `milestone-${m.threshold}`,
        type: "milestone" as const,
        title: `🎉 Meta de ${m.label} atingida!`,
        description: `Você já vendeu ${formatMoney(allTimeSales)} no total. Parabéns!`,
        value: m.threshold,
        icon: m.icon,
      }));

    // Weekly top products (all exits this week, not just sales)
    const weeklyExits = movements.filter(
      (m) => m.movement_type === "saida" && new Date(m.created_at) >= weekStart
    );

    const productMap = new Map<string, TopProduct>();
    for (const m of weeklyExits) {
      const key = m.barcode || m.product_name;
      const existing = productMap.get(key);
      if (existing) {
        existing.totalQty += m.quantity;
        existing.totalRevenue += (m.unit_price || 0) * m.quantity;
      } else {
        productMap.set(key, {
          product_name: m.product_name,
          barcode: m.barcode,
          totalQty: m.quantity,
          totalRevenue: (m.unit_price || 0) * m.quantity,
        });
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);

    const weeklyInsight: WeeklyInsight | null = topProducts.length > 0
      ? {
          id: "weekly-top",
          type: "weekly_top",
          title: "📊 Mais vendidos da semana",
          description: `${topProducts.length} produto${topProducts.length > 1 ? "s" : ""} com saída esta semana`,
          products: topProducts,
        }
      : null;

    return { milestones, weeklyInsight, topProducts, totalSalesMonth, totalSalesWeek };
  }, [movements]);

  const dismissMilestone = (threshold: number) => {
    const dismissed = JSON.parse(localStorage.getItem("dismissed_milestones") || "[]") as number[];
    dismissed.push(threshold);
    localStorage.setItem("dismissed_milestones", JSON.stringify(dismissed));
  };

  return {
    milestones,
    weeklyInsight,
    topProducts,
    totalSalesMonth,
    totalSalesWeek,
    loading,
    dismissMilestone,
    notificationCount: milestones.length + (weeklyInsight ? 1 : 0),
  };
}
