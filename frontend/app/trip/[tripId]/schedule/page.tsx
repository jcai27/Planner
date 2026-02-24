"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { Activity, DraftPlan, DraftValidationReport, Trip } from "@/lib/types";

type DayScheduleRow = {
  day: number;
  label: string;
  morning?: Activity;
  afternoon?: Activity;
  evening?: Activity;
};

function countTripDays(trip: Trip | null): number {
  if (!trip) {
    return 0;
  }
  const start = new Date(`${trip.start_date}T00:00:00Z`);
  const end = new Date(`${trip.end_date}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
}

function formatDayLabel(startDate: string | undefined, day: number): string {
  if (!startDate) {
    return `Day ${day}`;
  }
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return `Day ${day}`;
  }
  date.setUTCDate(date.getUTCDate() + day - 1);
  const human = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `Day ${day} (${human})`;
}

function activityMapLink(activity: Activity): string {
  if (activity.activity_url) {
    return activity.activity_url;
  }
  return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
}

function activityPrice(activity: Activity): string {
  const estimated = activity.estimated_price?.trim();
  if (estimated) {
    return estimated;
  }
  if (activity.price_level <= 0) {
    return "Free";
  }
  return "$".repeat(Math.max(1, activity.price_level));
}

function ActivityCell({ activity }: { activity?: Activity }) {
  if (!activity) {
    return <p className="text-sm text-[var(--muted)]">Open slot</p>;
  }
  return (
    <div className="schedule-activity-card">
      <p className="schedule-activity-name">{activity.name}</p>
      <p className="schedule-activity-meta capitalize">{activity.category}</p>
      <p className="schedule-activity-meta">Rating {activity.rating.toFixed(1)} | {activityPrice(activity)}</p>
      {activity.explanation && <p className="schedule-activity-reason">{activity.explanation}</p>}
      <a href={activityMapLink(activity)} target="_blank" rel="noreferrer" className="schedule-map-link">
        Open Map
      </a>
    </div>
  );
}

export default function ScheduleTablePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [draftPlan, setDraftPlan] = useState<DraftPlan | null>(null);
  const [validation, setValidation] = useState<DraftValidationReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      setBusy(true);
      setError("");
      try {
        const [tripData, draftPlanData, validationData] = await Promise.all([
          api.getTrip(tripId),
          api.getDraftPlan(tripId),
          api.getDraftValidation(tripId).catch(() => null),
        ]);
        setTrip(tripData);
        setDraftPlan(draftPlanData);
        setValidation(validationData);
        if (draftPlanData?.metadata?.shared_token) {
          setShareUrl(`${window.location.origin}/share/${draftPlanData.metadata.shared_token}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schedule");
      } finally {
        setBusy(false);
      }
    };
    void load();
  }, [tripId]);

  const validationByDay = useMemo(() => {
    const map = new Map<number, DraftValidationReport["days"][number]>();
    for (const day of validation?.days ?? []) {
      map.set(day.day, day);
    }
    return map;
  }, [validation]);

  const rows = useMemo(() => {
    const startDate = trip?.start_date;
    const byDay = new Map<number, DayScheduleRow>();
    for (const selection of draftPlan?.selections ?? []) {
      const current =
        byDay.get(selection.day) ??
        {
          day: selection.day,
          label: formatDayLabel(startDate, selection.day),
        };
      if (selection.slot === "morning") {
        current.morning = selection.activity;
      } else if (selection.slot === "afternoon") {
        current.afternoon = selection.activity;
      } else if (selection.slot === "evening") {
        current.evening = selection.activity;
      }
      byDay.set(selection.day, current);
    }

    const days = countTripDays(trip);
    if (days > 0) {
      for (let day = 1; day <= days; day += 1) {
        if (!byDay.has(day)) {
          byDay.set(day, { day, label: formatDayLabel(startDate, day) });
        }
      }
    }

    return Array.from(byDay.values()).sort((a, b) => a.day - b.day);
  }, [draftPlan, trip]);

  const onCreateShareLink = async () => {
    setShareBusy(true);
    setError("");
    try {
      const payload = await api.createShareLink(tripId);
      setShareUrl(payload.share_url);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.share_url).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="panel fade-up p-6 md:p-8">
        <p className="badge">Schedule View</p>
        <h1 className="hero-title mt-4 text-3xl sm:text-4xl">
          {trip?.destination ? `${trip.destination} schedule table` : "Schedule table"}
        </h1>
        <div className="view-tabs mt-4">
          <Link href={`/trip/${tripId}`} className="view-tab">
            Workspace
          </Link>
          <Link href={`/trip/${tripId}/schedule`} className="view-tab view-tab-active">
            Schedule Table
          </Link>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Morning, afternoon, and dinner picks in one table with cost and travel warnings.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/trip/${tripId}`} className="secondary-btn inline-flex">
            Back to Trip Workspace
          </Link>
          <button onClick={onCreateShareLink} className="primary-btn" disabled={shareBusy}>
            {shareBusy ? "Generating..." : "Create Share Link"}
          </button>
        </div>
        {shareUrl && <div className="mono-block mt-3">{shareUrl}</div>}
      </section>

      <section className="panel fade-up mt-5 p-6 md:p-7">
        {busy && <p className="text-sm text-[var(--muted)]">Loading schedule...</p>}
        {!busy && error && <p className="error-text">{error}</p>}
        {!busy && !error && !draftPlan && (
          <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
            <p className="text-sm text-[var(--muted)]">
              No saved draft plan yet. Finish draft picks and save them first.
            </p>
            <Link href={`/trip/${tripId}`} className="primary-btn mt-4 inline-flex">
              Open Draft Builder
            </Link>
          </div>
        )}
        {!busy && !error && draftPlan && (
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
                  const dayValidation = validationByDay.get(row.day);
                  return (
                    <tr key={`row-${row.day}`}>
                      <td className="schedule-day-cell">{row.label}</td>
                      <td><ActivityCell activity={row.morning} /></td>
                      <td><ActivityCell activity={row.afternoon} /></td>
                      <td><ActivityCell activity={row.evening} /></td>
                      <td>
                        {!dayValidation ? (
                          <p className="text-sm text-[var(--muted)]">No validation data</p>
                        ) : (
                          <div className="schedule-activity-card">
                            <p className="schedule-activity-meta">
                              Cost {dayValidation.estimated_cost_per_person} (${dayValidation.estimated_cost_value.toFixed(0)})
                            </p>
                            <p className="schedule-activity-meta">
                              Transfers {dayValidation.transfer_minutes_total} min
                            </p>
                            {dayValidation.warnings.length > 0 && (
                              <p className="schedule-activity-reason text-[var(--danger)]">
                                {dayValidation.warnings.join(" | ")}
                              </p>
                            )}
                            {dayValidation.route_map_url && (
                              <a href={dayValidation.route_map_url} target="_blank" rel="noreferrer" className="schedule-map-link">
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
