import { ArcElement, BarElement, CategoryScale, Chart, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";
import { useEffect, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { cssVar } from "../lib/theme";

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Legend, Tooltip);

// Re-render charts when the theme changes so axes, grid and tooltips pick up the new colours.
export function useChartTheme() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN(n => n + 1); addEventListener("themechange", f); return () => removeEventListener("themechange", f); }, []);
  Chart.defaults.font.family = cssVar("--font") || "Inter, system-ui, sans-serif";
  Chart.defaults.color = cssVar("--text-3");
  Chart.defaults.borderColor = cssVar("--border");
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = cssVar("--text");
  Chart.defaults.plugins.tooltip.titleColor = cssVar("--surface");
  Chart.defaults.plugins.tooltip.bodyColor = cssVar("--surface");
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation.duration = 700;
  return { grid: { color: cssVar("--border") }, accent: cssVar("--accent"), accent2: cssVar("--accent-2"), surface: cssVar("--surface"), text: cssVar("--text"), text3: cssVar("--text-3"), font: cssVar("--font") };
}

// Draws a big number in the middle of a doughnut.
export const centerText = (big, small) => ({
  id: "center",
  afterDraw(c) {
    const { ctx, chartArea: a } = c;
    ctx.save(); ctx.textAlign = "center";
    ctx.fillStyle = cssVar("--text"); ctx.font = `700 22px ${cssVar("--font")}`;
    ctx.fillText(big, (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 4);
    ctx.font = `12px ${cssVar("--font")}`; ctx.fillStyle = cssVar("--text-3");
    ctx.fillText(small, (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 22);
    ctx.restore();
  },
});

// A vertical gradient fill for line/bar charts.
export const gradient = (from, to) => ctx => {
  const { chart } = ctx;
  const a = chart.chartArea;
  if (!a) return from;
  const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
  g.addColorStop(0, from); g.addColorStop(1, to);
  return g;
};

export { Bar, Doughnut, Line };
