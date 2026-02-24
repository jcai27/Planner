"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { Activity, SharedDraftPlanResponse } from "@/lib/types";

type DayRow = {
  day: number;
  morning?: Activity;
  afternoon?: Activity;
  evening?: Activity;
};

function activityPrice(activity: Activity): string {
  if (activity.estimated_price?.trim()) {
    return activity.estimated_price;
  }
  if (activity.price_level <= 0) {
    return "Free";
  }
  return "$".repeat(Math.max(1, activity.price_level));
}

export default function SharedSchedulePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [payload, setPayload] = useState<SharedDraftPlanResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const shared = await api.getSharedDraft(shareToken);
        setPayload(shared);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shared schedule");
      }
    };
    void load();
  }, [shareToken]);

  const rows = useMemo(() => {
    const map = new Map<number, DayRow>();
    for (const selection of payload?.draft_plan.selections ?? []) {
      const row = map.get(selection.day) ?? { day: selection.day };
      if (selection.slot === "morning") {
        row.morning = selection.activity;
      } else if (selection.slot === "afternoon") {
        row.afternoon = selection.activity;
      } else if (selection.slot === "evening") {
        row.evening = selection.activity;
      }
      map.set(selection.day, row);
    }
    return Array.from(map.values()).sort((a, b) => a.day - b.day);
  }, [payload]);

  return (
    <main className="page-shell">
      <section className="panel fade-up p-6 md:p-8">
        <p className="badge">Shared Itinerary</p>
        <h1 className="hero-title mt-4 text-3xl sm:text-4xl">
          {payload ? `${payload.destination} final plan` : "Shared schedule"}
        </h1>
        {payload && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {payload.start_date} to {payload.end_date}
          </p>
        )}
        <div className="mt-4">
          <Link href="/" className="secondary-btn inline-flex">
            Create Your Own Trip
          </Link>
        </div>
      </section>

      <section className="panel fade-up mt-5 p-6 md:p-7">
        {error && <p className="error-text">{error}</p>}
        {!error && !payload && <p className="text-sm text-[var(--muted)]">Loading...</p>}
        {!error && payload && (
          <div className="schedule-table-wrap">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Morning</th>
                  <th>Afternoon</th>
                  <th>Dinner</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const validation = payload.validation.days.find((day) => day.day === row.day);
                  return (
                    <tr key={`shared-day-${row.day}`}>
                      <td className="schedule-day-cell">Day {row.day}</td>
                      <td>{row.morning ? `${row.morning.name} (${activityPrice(row.morning)})` : "Open slot"}</td>
                      <td>{row.afternoon ? `${row.afternoon.name} (${activityPrice(row.afternoon)})` : "Open slot"}</td>
                      <td>{row.evening ? `${row.evening.name} (${activityPrice(row.evening)})` : "Open slot"}</td>
                      <td>
                        {!validation ? (
                          "No validation"
                        ) : (
                          <div className="schedule-activity-card">
                            <p className="schedule-activity-meta">
                              Cost {validation.estimated_cost_per_person} (${validation.estimated_cost_value.toFixed(0)})
                            </p>
                            <p className="schedule-activity-meta">
                              Transfers {validation.transfer_minutes_total} min
                            </p>
                            {validation.warnings.length > 0 && (
                              <p className="schedule-activity-reason text-[var(--danger)]">
                                {validation.warnings.join(" | ")}
                              </p>
                            )}
                            {validation.route_map_url && (
                              <a href={validation.route_map_url} target="_blank" rel="noreferrer" className="schedule-map-link">
                                Open Day Route
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
