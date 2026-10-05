import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { signedUrl } from "../../lib/api";
import type { AnalyticsEmployee } from "./data";

interface JoiningTrendsChartProps {
  people: AnalyticsEmployee[];
}

type DepartmentFilter = "All" | "Development" | "Creative Services" | "NetSys";

// Smooth Spline interpolation that passes exactly through each point
function getSmoothSplinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

// Individual tooltip avatar item that loads signed Supabase storage URLs
function TooltipAvatarItem({ p }: { p: AnalyticsEmployee }) {
  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar", p.avatar_path],
    queryFn: async () => {
      if (!p.avatar_path) return null;
      if (
        p.avatar_path.startsWith("http") ||
        p.avatar_path.startsWith("blob:") ||
        p.avatar_path.startsWith("data:")
      ) {
        return p.avatar_path;
      }
      return signedUrl("avatars", p.avatar_path);
    },
    enabled: !!p.avatar_path,
    staleTime: 90000,
  });

  const initials = p.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className="tooltip-avatar-circle"
      title={`${p.full_name} (${p.title || p.departments?.name || ""})`}
    >
      {avatarUrl ? <img src={avatarUrl} alt={p.full_name} /> : initials}
    </span>
  );
}

export default function JoiningTrendsChart({ people }: JoiningTrendsChartProps) {
  const [selectedDept, setSelectedDept] = useState<DepartmentFilter>("All");
  const [hoveredYear, setHoveredYear] = useState<string | null>(null);

  const chartData = useMemo(() => {
    // 1. Gather all unique years from join and exit dates
    const yearSet = new Set<number>();
    people.forEach((p) => {
      if (p.joined) {
        const y = parseInt(p.joined.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2030) yearSet.add(y);
      }
      if (p.left) {
        const y = parseInt(p.left.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2030) yearSet.add(y);
      }
    });

    let yearsList: number[] = Array.from(yearSet).sort((a, b) => a - b);
    if (yearsList.length === 0) {
      yearsList = [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024];
    }

    const minYear = yearsList[0];
    const maxYear = yearsList[yearsList.length - 1];
    const continuousYears: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      continuousYears.push(y);
    }
    const finalYears = continuousYears.length <= 25 ? continuousYears : yearsList;

    // Helper for department categorization
    const isDept = (deptName: string | undefined, target: string) => {
      if (!deptName) return false;
      const d = deptName.toLowerCase();
      const t = target.toLowerCase();
      if (t === "development") return d.includes("dev") || d.includes("eng");
      if (t === "creative services") return d.includes("creat") || d.includes("desig");
      if (t === "netsys") return d.includes("net") || d.includes("sys") || d.includes("admin") || d.includes("oper");
      return d.includes(t);
    };

    // 2. Aggregate Joinings (+) and Exits (-) per department per year
    const points = finalYears.map((year) => {
      const yearStr = String(year);
      const joinedThisYear = people.filter(
        (p) => p.joined && p.joined.startsWith(yearStr)
      );
      const leftThisYear = people.filter(
        (p) => p.left && p.left.startsWith(yearStr)
      );

      // Joinings (Positive)
      const devJoinedPeople = joinedThisYear.filter((p) =>
        isDept(p.departments?.name, "development")
      );
      const creativeJoinedPeople = joinedThisYear.filter((p) =>
        isDept(p.departments?.name, "creative services")
      );
      const netsysJoinedPeople = joinedThisYear.filter((p) =>
        isDept(p.departments?.name, "netsys")
      );

      // Exits (Negative)
      const devLeftPeople = leftThisYear.filter((p) =>
        isDept(p.departments?.name, "development")
      );
      const creativeLeftPeople = leftThisYear.filter((p) =>
        isDept(p.departments?.name, "creative services")
      );
      const netsysLeftPeople = leftThisYear.filter((p) =>
        isDept(p.departments?.name, "netsys")
      );

      return {
        year: yearStr,
        devJoin: devJoinedPeople.length,
        creativeJoin: creativeJoinedPeople.length,
        netsysJoin: netsysJoinedPeople.length,
        devJoinedPeople,
        creativeJoinedPeople,
        netsysJoinedPeople,
        totalJoin: joinedThisYear.length,
        devExit: devLeftPeople.length,
        creativeExit: creativeLeftPeople.length,
        netsysExit: netsysLeftPeople.length,
        devLeftPeople,
        creativeLeftPeople,
        netsysLeftPeople,
        totalExit: leftThisYear.length,
      };
    });

    // Compute max values for positive and negative axes
    let maxPos = 6;
    let maxNeg = 6;
    points.forEach((p) => {
      maxPos = Math.max(maxPos, p.devJoin, p.creativeJoin, p.netsysJoin);
      maxNeg = Math.max(maxNeg, p.devExit, p.creativeExit, p.netsysExit);
    });

    const maxPositive = Math.max(Math.ceil(maxPos * 1.15), 6);
    const maxNegative = Math.max(Math.ceil(maxNeg * 1.15), 6);

    const stepPos = maxPositive <= 8 ? 2 : maxPositive <= 16 ? 4 : Math.ceil(maxPositive / 4);
    const yTicksPositive: number[] = [];
    for (let t = stepPos; t <= maxPositive; t += stepPos) {
      yTicksPositive.push(t);
    }
    if (!yTicksPositive.includes(maxPositive)) {
      yTicksPositive.push(maxPositive);
    }

    const stepNeg = maxNegative <= 8 ? 2 : maxNegative <= 16 ? 4 : Math.ceil(maxNegative / 4);
    const yTicksNegative: number[] = [];
    for (let t = stepNeg; t <= maxNegative; t += stepNeg) {
      yTicksNegative.push(t);
    }
    if (!yTicksNegative.includes(maxNegative)) {
      yTicksNegative.push(maxNegative);
    }

    // Totals across dataset
    const totalDev = people.filter((p) => isDept(p.departments?.name, "development")).length;
    const totalCreative = people.filter((p) => isDept(p.departments?.name, "creative services")).length;
    const totalNetSys = people.filter((p) => isDept(p.departments?.name, "netsys")).length;
    const totalExits = people.filter((p) => p.left).length;

    return {
      points,
      maxPositive,
      maxNegative,
      yTicksPositive,
      yTicksNegative,
      totals: {
        dev: totalDev,
        creative: totalCreative,
        netsys: totalNetSys,
        all: people.length,
        exits: totalExits,
      },
    };
  }, [people]);

  // Mini Avatar Stack component for tooltip
  function AvatarStack({ peopleList }: { peopleList: AnalyticsEmployee[] }) {
    if (!peopleList || !peopleList.length) return null;
    const displayPeople = peopleList.slice(0, 3);
    const remaining = peopleList.length - 3;
    return (
      <div className="tooltip-avatar-stack">
        {displayPeople.map((p) => (
          <TooltipAvatarItem key={p.id} p={p} />
        ))}
        {remaining > 0 && (
          <span className="tooltip-avatar-more">+{remaining}</span>
        )}
      </div>
    );
  }

  // Dynamic counts for selected tab
  const isDeptMatch = (deptName: string | undefined, target: string) => {
    if (!deptName) return false;
    const d = deptName.toLowerCase();
    const t = target.toLowerCase();
    if (t === "development") return d.includes("dev") || d.includes("eng");
    if (t === "creative services") return d.includes("creat") || d.includes("desig");
    if (t === "netsys") return d.includes("net") || d.includes("sys") || d.includes("admin") || d.includes("oper");
    return d.includes(t);
  };

  const selectedJoiningsCount = useMemo(() => {
    if (selectedDept === "All") {
      return people.filter((p) => p.joined).length;
    }
    return people.filter((p) => p.joined && isDeptMatch(p.departments?.name, selectedDept)).length;
  }, [people, selectedDept]);

  const selectedExitsCount = useMemo(() => {
    if (selectedDept === "All") {
      return people.filter((p) => p.left).length;
    }
    return people.filter((p) => p.left && isDeptMatch(p.departments?.name, selectedDept)).length;
  }, [people, selectedDept]);

  // SVG dimensions
  const svgWidth = 820;
  const svgHeight = 360;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;
  const zeroY = padTop + chartH / 2; // Midpoint Y = 0

  const numPoints = chartData.points.length;

  // Convert value to SVG Y coordinate (positive above zeroY up to +maxPositive, negative below zeroY down to -maxNegative)
  const getCoordinates = (index: number, val: number, isNegative = false) => {
    const x = padLeft + (index / Math.max(numPoints - 1, 1)) * chartW;
    const y = isNegative
      ? zeroY + (val / chartData.maxNegative) * (chartH / 2)
      : zeroY - (val / chartData.maxPositive) * (chartH / 2);
    return { x, y };
  };

  // Positive joinings dots
  const devJoinDots = chartData.points.map((d, i) => getCoordinates(i, d.devJoin, false));
  const creativeJoinDots = chartData.points.map((d, i) => getCoordinates(i, d.creativeJoin, false));
  const netsysJoinDots = chartData.points.map((d, i) => getCoordinates(i, d.netsysJoin, false));

  // Negative exits dots
  const devExitDots = chartData.points.map((d, i) => getCoordinates(i, d.devExit, true));
  const creativeExitDots = chartData.points.map((d, i) => getCoordinates(i, d.creativeExit, true));
  const netsysExitDots = chartData.points.map((d, i) => getCoordinates(i, d.netsysExit, true));

  // Lines start directly from zero-label (padLeft, zeroY) and connect dot to dot
  const zeroStartPoint = { x: padLeft, y: zeroY };

  // Positive curves
  const devJoinLinePoints = [zeroStartPoint, ...devJoinDots];
  const creativeJoinLinePoints = [zeroStartPoint, ...creativeJoinDots];
  const netsysJoinLinePoints = [zeroStartPoint, ...netsysJoinDots];

  const devJoinPath = getSmoothSplinePath(devJoinLinePoints);
  const creativeJoinPath = getSmoothSplinePath(creativeJoinLinePoints);
  const netsysJoinPath = getSmoothSplinePath(netsysJoinLinePoints);

  // Negative curves (Exits / Left)
  const devExitLinePoints = [zeroStartPoint, ...devExitDots];
  const creativeExitLinePoints = [zeroStartPoint, ...creativeExitDots];
  const netsysExitLinePoints = [zeroStartPoint, ...netsysExitDots];

  const devExitPath = getSmoothSplinePath(devExitLinePoints);
  const creativeExitPath = getSmoothSplinePath(creativeExitLinePoints);
  const netsysExitPath = getSmoothSplinePath(netsysExitLinePoints);

  const activeYearData = chartData.points.find((y) => y.year === hoveredYear);
  const activeYearIdx = chartData.points.findIndex((y) => y.year === hoveredYear);

  // Label step to avoid crowded year numbers
  const labelInterval = numPoints > 18 ? 3 : numPoints > 10 ? 2 : 1;

  const tabs: DepartmentFilter[] = [
    "All",
    "Development",
    "Creative Services",
    "NetSys",
  ];

  const showDev = selectedDept === "All" || selectedDept === "Development";
  const showCreative = selectedDept === "All" || selectedDept === "Creative Services";
  const showNetSys = selectedDept === "All" || selectedDept === "NetSys";

  return (
    <section className="panel chart-panel joining-trends-panel">
      <div className="joining-trends-header">
        <div>
          <h2>Joining Trends (by Year)</h2>
          <p className="muted">
            Annual headcount flow: <strong>Joinings</strong> (above 0) and <strong>Exits / Left</strong> (below 0) across teams.
          </p>
        </div>

        {/* Clickable Department Filter Buttons */}
        <div className="chart-filter-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selectedDept === tab}
              className={`chart-filter-pill ${selectedDept === tab ? "active" : ""}`}
              onClick={() => setSelectedDept(tab)}
            >
              {tab === "All" ? `All (${people.length})` : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="joining-trends-legend">
        {showDev && (
          <div className="legend-item">
            <span className="legend-dot" style={{ background: "#00b8c4" }} />
            <span>Development ({chartData.totals.dev})</span>
          </div>
        )}
        {showCreative && (
          <div className="legend-item">
            <span className="legend-dot" style={{ background: "#ff7c5c" }} />
            <span>Creative Services ({chartData.totals.creative})</span>
          </div>
        )}
        {showNetSys && (
          <div className="legend-item">
            <span className="legend-dot" style={{ background: "#8b5cf6" }} />
            <span>NetSys ({chartData.totals.netsys})</span>
          </div>
        )}
        <div className="legend-item legend-flow-hint">
          <span className="flow-badge-pos">▲ Joinings ({selectedJoiningsCount})</span>
          <span className="flow-badge-neg">▼ Left / Exits ({selectedExitsCount})</span>
        </div>
      </div>

      <div className="joining-trends-chart-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="joining-trends-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Positive Y-Axis Gridlines & Labels (up to maxPositive) */}
          {chartData.yTicksPositive.slice().reverse().map((tick) => {
            const y = zeroY - (tick / chartData.maxPositive) * (chartH / 2);
            return (
              <g key={`pos-${tick}`} className="chart-grid-line">
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + chartW}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="chart-axis-text"
                >
                  +{tick}
                </text>
              </g>
            );
          })}

          {/* Baseline Y = 0 (Center) */}
          <g className="chart-grid-line zero-baseline">
            <line
              x1={padLeft}
              y1={zeroY}
              x2={padLeft + chartW}
              y2={zeroY}
              stroke="var(--border-strong)"
              strokeWidth="1.2"
            />
            <text
              x={padLeft - 10}
              y={zeroY + 4}
              textAnchor="end"
              className="chart-axis-text zero-label"
            >
              0
            </text>
          </g>

          {/* Negative Y-Axis Gridlines & Labels (down to maxNegative) */}
          {chartData.yTicksNegative.map((tick) => {
            const y = zeroY + (tick / chartData.maxNegative) * (chartH / 2);
            return (
              <g key={`neg-${tick}`} className="chart-grid-line">
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + chartW}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="chart-axis-text"
                >
                  -{tick}
                </text>
              </g>
            );
          })}

          {/* X-Axis Year Labels (Bottom) */}
          {chartData.points.map((d, i) => {
            const x = padLeft + (i / Math.max(numPoints - 1, 1)) * chartW;
            const isHovered = hoveredYear === d.year;
            const showLabel =
              i === 0 ||
              i === numPoints - 1 ||
              i % labelInterval === 0 ||
              isHovered;

            return (
              <g key={d.year} className="chart-xaxis-group">
                {isHovered && (
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + chartH}
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                )}
                {showLabel && (
                  <text
                    x={x}
                    y={padTop + chartH + 20}
                    textAnchor="middle"
                    className={`chart-axis-text ${isHovered ? "active" : ""}`}
                  >
                    {d.year}
                  </text>
                )}
                {/* Hover hotspot */}
                <rect
                  x={x - chartW / (numPoints * 2)}
                  y={padTop}
                  width={chartW / numPoints}
                  height={chartH + 30}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredYear(d.year)}
                  onMouseLeave={() => setHoveredYear(null)}
                />
              </g>
            );
          })}

          {/* ----------------- Positive Spline Curves (Joinings) ----------------- */}
          {showDev && (
            <path
              d={devJoinPath}
              fill="none"
              stroke="#00b8c4"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline"
            />
          )}
          {showCreative && (
            <path
              d={creativeJoinPath}
              fill="none"
              stroke="#ff7c5c"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline"
            />
          )}
          {showNetSys && (
            <path
              d={netsysJoinPath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline"
            />
          )}

          {/* ----------------- Negative Spline Curves (Exits / Left) ----------------- */}
          {showDev && (
            <path
              d={devExitPath}
              fill="none"
              stroke="#00b8c4"
              strokeWidth="2.2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline spline--exit"
            />
          )}
          {showCreative && (
            <path
              d={creativeExitPath}
              fill="none"
              stroke="#ff7c5c"
              strokeWidth="2.2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline spline--exit"
            />
          )}
          {showNetSys && (
            <path
              d={netsysExitPath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline spline--exit"
            />
          )}

          {/* ----------------- Positive Dots (Joinings) ----------------- */}
          {showDev &&
            devJoinDots.map((pt, i) => {
              const yearStr = chartData.points[i].year;
              const isHovered = hoveredYear === yearStr;
              return (
                <circle
                  key={`dev-join-dot-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  fill="#00b8c4"
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="chart-point"
                  onMouseEnter={() => setHoveredYear(yearStr)}
                />
              );
            })}

          {showCreative &&
            creativeJoinDots.map((pt, i) => {
              const yearStr = chartData.points[i].year;
              const isHovered = hoveredYear === yearStr;
              return (
                <circle
                  key={`creative-join-dot-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  fill="#ff7c5c"
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="chart-point"
                  onMouseEnter={() => setHoveredYear(yearStr)}
                />
              );
            })}

          {showNetSys &&
            netsysJoinDots.map((pt, i) => {
              const yearStr = chartData.points[i].year;
              const isHovered = hoveredYear === yearStr;
              return (
                <circle
                  key={`netsys-join-dot-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  fill="#8b5cf6"
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="chart-point"
                  onMouseEnter={() => setHoveredYear(yearStr)}
                />
              );
            })}

          {/* ----------------- Negative Dots (Exits / Left) ----------------- */}
          {showDev &&
            devExitDots.map((pt, i) => {
              const yearStr = chartData.points[i].year;
              const isHovered = hoveredYear === yearStr;
              return (
                <circle
                  key={`dev-exit-dot-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  fill="#00b8c4"
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="chart-point point--exit"
                  onMouseEnter={() => setHoveredYear(yearStr)}
                />
              );
            })}

          {showCreative &&
            creativeExitDots.map((pt, i) => {
              const yearStr = chartData.points[i].year;
              const isHovered = hoveredYear === yearStr;
              return (
                <circle
                  key={`creative-exit-dot-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  fill="#ff7c5c"
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="chart-point point--exit"
                  onMouseEnter={() => setHoveredYear(yearStr)}
                />
              );
            })}

          {showNetSys &&
            netsysExitDots.map((pt, i) => {
              const yearStr = chartData.points[i].year;
              const isHovered = hoveredYear === yearStr;
              return (
                <circle
                  key={`netsys-exit-dot-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  fill="#8b5cf6"
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="chart-point point--exit"
                  onMouseEnter={() => setHoveredYear(yearStr)}
                />
              );
            })}
        </svg>

        {/* Floating Tooltip */}
        {activeYearData && activeYearIdx !== -1 && (
          <div
            className="chart-floating-tooltip"
            style={{
              left: `${Math.min(Math.max(((padLeft + (activeYearIdx / Math.max(numPoints - 1, 1)) * chartW) / svgWidth) * 100, 14), 86)}%`,
              top: "20px",
            }}
          >
            <strong>Year {activeYearData.year}</strong>

            {/* JOININGS Section (if > 0) */}
            {activeYearData.totalJoin > 0 && (
              <>
                <div className="tooltip-section-header">▲ Headcount Joinings</div>
                {showDev && activeYearData.devJoin > 0 && (
                  <div className="tooltip-row">
                    <span className="tooltip-dot" style={{ background: "#00b8c4" }} />
                    <span>Development:</span>
                    <div className="tooltip-row-val">
                      <AvatarStack peopleList={activeYearData.devJoinedPeople} />
                      <b>+{activeYearData.devJoin}</b>
                    </div>
                  </div>
                )}
                {showCreative && activeYearData.creativeJoin > 0 && (
                  <div className="tooltip-row">
                    <span className="tooltip-dot" style={{ background: "#ff7c5c" }} />
                    <span>Creative Services:</span>
                    <div className="tooltip-row-val">
                      <AvatarStack peopleList={activeYearData.creativeJoinedPeople} />
                      <b>+{activeYearData.creativeJoin}</b>
                    </div>
                  </div>
                )}
                {showNetSys && activeYearData.netsysJoin > 0 && (
                  <div className="tooltip-row">
                    <span className="tooltip-dot" style={{ background: "#8b5cf6" }} />
                    <span>NetSys:</span>
                    <div className="tooltip-row-val">
                      <AvatarStack peopleList={activeYearData.netsysJoinedPeople} />
                      <b>+{activeYearData.netsysJoin}</b>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* EXITS / LEFT Section (if > 0) */}
            {activeYearData.totalExit > 0 && (
              <>
                <div className="tooltip-section-header tooltip-exit-header">▼ Exits / Left</div>
                {showDev && activeYearData.devExit > 0 && (
                  <div className="tooltip-row">
                    <span className="tooltip-dot" style={{ background: "#00b8c4" }} />
                    <span>Development:</span>
                    <div className="tooltip-row-val">
                      <AvatarStack peopleList={activeYearData.devLeftPeople} />
                      <b>-{activeYearData.devExit}</b>
                    </div>
                  </div>
                )}
                {showCreative && activeYearData.creativeExit > 0 && (
                  <div className="tooltip-row">
                    <span className="tooltip-dot" style={{ background: "#ff7c5c" }} />
                    <span>Creative Services:</span>
                    <div className="tooltip-row-val">
                      <AvatarStack peopleList={activeYearData.creativeLeftPeople} />
                      <b>-{activeYearData.creativeExit}</b>
                    </div>
                  </div>
                )}
                {showNetSys && activeYearData.netsysExit > 0 && (
                  <div className="tooltip-row">
                    <span className="tooltip-dot" style={{ background: "#8b5cf6" }} />
                    <span>NetSys:</span>
                    <div className="tooltip-row-val">
                      <AvatarStack peopleList={activeYearData.netsysLeftPeople} />
                      <b>-{activeYearData.netsysExit}</b>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="tooltip-row tooltip-total">
              <span>Net Change:</span>
              <b>
                {activeYearData.totalJoin - activeYearData.totalExit >= 0 ? "+" : ""}
                {activeYearData.totalJoin - activeYearData.totalExit}
              </b>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
