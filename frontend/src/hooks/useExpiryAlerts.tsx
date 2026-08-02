import { useState, useEffect, useMemo } from "react";
import { inventoryApi, InventoryItem } from "../lib/api";
import { useAuth } from "../../src/hooks/useAuth";

export interface ExpiryAlert {
  id: string;
  product_name: string;
  barcode: string;
  expiry_date: string;
  daysLeft: number;
  severity: "critical" | "warning" | "info";
  quantity: number;
}

function getConfig() {
  const enabled = localStorage.getItem("expiry_alert_enabled") !== "false";
  const days = parseInt(localStorage.getItem("expiry_alert_days") || "30", 10);
  return { enabled, days };
}

export function useExpiryAlerts() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const config = getConfig();

  useEffect(() => {
    if (!user || !config.enabled) {
      setLoading(false);
      return;
    }
    inventoryApi.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const alerts = useMemo<ExpiryAlert[]>(() => {
    if (!config.enabled) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return items
      .filter((item) => item.expiry_date && item.quantity > 0)
      .map((item) => {
        const expiry = new Date(item.expiry_date!);
        expiry.setHours(0, 0, 0, 0);
        const diffMs = expiry.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        let severity: ExpiryAlert["severity"] = "info";
        if (daysLeft <= 0) severity = "critical";
        else if (daysLeft <= 7) severity = "critical";
        else if (daysLeft <= config.days) severity = "warning";

        return {
          id: item.id,
          product_name: item.product_name,
          barcode: item.barcode,
          expiry_date: item.expiry_date!,
          daysLeft,
          severity,
          quantity: item.quantity,
        };
      })
      .filter((a) => a.daysLeft <= config.days)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [items, config.enabled, config.days]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return {
    alerts,
    loading,
    enabled: config.enabled,
    alertDays: config.days,
    criticalCount,
    warningCount,
    totalCount: alerts.length,
  };
}
