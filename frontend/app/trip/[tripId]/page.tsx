"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { api } from "@/lib/api";
import { Activity, DraftPlan, DraftSchedule, ItineraryResult, InterestVector, Trip } from "@/lib/types";

const defaultInterests: InterestVector = {
  food: 3,
  nightlife: 2,
  culture: 3,
  outdoors: 3,
  relaxation: 2
};

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");

  const [trip, setTrip] = useState<Trip | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
  const [draft, setDraft] = useState<DraftSchedule | null>(null);
  const [savedDraftPlan, setSavedDraftPlan] = useState<DraftPlan | null>(null);
  const [draftIndex, setDraftIndex] = useState(0);
  const [draftPicks, setDraftPicks] = useState<Record<string, Activity>>({});
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [interests, setInterests] = useState<InterestVector>(defaultInterests);
  const [schedulePreference, setSchedulePreference] = useState<"packed" | "balanced" | "chill">("balanced");
  const [wakePreference, setWakePreference] = useState<"early" | "normal" | "late">("normal");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const interestEntries = useMemo(
    () => Object.entries(interests) as [keyof InterestVector, number][],
    [interests]
  );
  const styleSubtitle: Record<string, string> = {
    packed: "Higher energy days with denser activity blocks",
    balanced: "Even pace across culture, food, and downtime",
    chill: "Lower pressure pacing with lighter transitions"
  };
  const slotLabel: Record<string, string> = {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Dinner"
  };
  const draftSlots = draft?.slots ?? [];
  const currentDraftSlot = draftSlots[draftIndex] ?? null;
  const draftComplete = draftSlots.length > 0 && draftSlots.every((slot) => !!draftPicks[slot.slot_id]);
  const draftPickedCount = draftSlots.reduce((count, slot) => count + (draftPicks[slot.slot_id] ? 1 : 0), 0);
  const draftProgress = draftSlots.length ? Math.round((draftPickedCount / draftSlots.length) * 100) : 0;
  const draftSummaryByDay = useMemo(() => {
    const map = new Map<number, { morning?: Activity; afternoon?: Activity; evening?: Activity }>();
    for (const slot of draftSlots) {
      const selected = draftPicks[slot.slot_id];
      if (!selected) {
        continue;
      }
      const day = map.get(slot.day) ?? {};
      if (slot.slot === "morning") {
        day.morning = selected;
      } else if (slot.slot === "afternoon") {
        day.afternoon = selected;
      } else if (slot.slot === "evening") {
        day.evening = selected;
      }
      map.set(slot.day, day);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, picks]) => ({ day, picks }));
  }, [draftSlots, draftPicks]);
  const savedDraftSummaryByDay = useMemo(() => {
    const map = new Map<number, { morning?: Activity; afternoon?: Activity; evening?: Activity }>();
    for (const selection of savedDraftPlan?.selections ?? []) {
      const day = map.get(selection.day) ?? {};
      if (selection.slot === "morning") {
        day.morning = selection.activity;
      } else if (selection.slot === "afternoon") {
        day.afternoon = selection.activity;
      } else if (selection.slot === "evening") {
        day.evening = selection.activity;
      }
      map.set(selection.day, day);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, picks]) => ({ day, picks }));
  }, [savedDraftPlan]);

  const getDraftCandidateDescription = (candidate: Activity, slot: "morning" | "afternoon" | "evening"): string => {
    if (candidate.explanation && candidate.explanation.trim()) {
      return candidate.explanation;
    }
    if (slot === "evening") {
      return `${candidate.name} is a strong dinner choice with solid ratings and easy group appeal.`;
    }
    return `${candidate.name} is a ${candidate.category} activity that fits this slot and keeps the day balanced.`;
  };

  useEffect(() => {
    if (inviteToken) {
      api.saveTripAccess(tripId, inviteToken);
    }
    setJoinCode(api.getSavedJoinCode(tripId));
  }, [tripId, inviteToken]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tripData, itineraryData, savedDraft] = await Promise.all([
          api.getTrip(tripId),
          api.getItinerary(tripId).catch(() => null),
          api.getDraftPlan(tripId).catch(() => null),
        ]);
        setTrip(tripData);
        setItinerary(itineraryData);
        setSavedDraftPlan(savedDraft);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trip");
      }
    };
    void load();
  }, [tripId, inviteToken]);

  useEffect(() => {
    if (!currentDraftSlot) {
      setDraftModalOpen(false);
    }
  }, [currentDraftSlot]);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const updated = await api.joinTrip(tripId, {
        name: participantName,
        interest_vector: interests,
        schedule_preference: schedulePreference,
        wake_preference: wakePreference
      });
      setTrip(updated);
      setParticipantName("");
      setInterests(defaultInterests);
      setSchedulePreference("balanced");
      setWakePreference("normal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add participant");
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const generated = await api.generateItinerary(tripId);
      setItinerary(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate itinerary");
    } finally {
      setBusy(false);
    }
  };

  const onStartDraft = async () => {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const generatedDraft = await api.getDraftSlots(tripId);
      if (!generatedDraft.slots.length) {
        throw new Error("No draft candidates available. Try adding more participants or changing trip details.");
      }
      const prefills: Record<string, Activity> = {};
      for (const selection of savedDraftPlan?.selections ?? []) {
        prefills[selection.slot_id] = selection.activity;
      }
      const firstUnpickedIndex = generatedDraft.slots.findIndex((slot) => !prefills[slot.slot_id]);

      setDraft(generatedDraft);
      setDraftPicks(prefills);
      setDraftIndex(firstUnpickedIndex === -1 ? generatedDraft.slots.length : firstUnpickedIndex);
      setDraftModalOpen(firstUnpickedIndex !== -1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate slot draft");
    } finally {
      setBusy(false);
    }
  };

  const onPickCandidate = (activity: Activity) => {
    if (!currentDraftSlot) {
      return;
    }
    setDraftPicks((prev) => ({ ...prev, [currentDraftSlot.slot_id]: activity }));
    setDraftIndex((prev) => Math.min(prev + 1, draftSlots.length));
  };

  const onBackDraftSlot = () => {
    setDraftIndex((prev) => Math.max(0, prev - 1));
  };

  const onRedraft = () => {
    setStatusMessage("");
    setDraftPicks({});
    setDraftIndex(0);
    setDraftModalOpen(false);
  };

  const onSaveDraftPlan = async () => {
    if (!draft || !draftComplete) {
      setError("Complete all slot picks before saving.");
      return;
    }

    const selections = draft.slots
      .map((slot) => {
        const activity = draftPicks[slot.slot_id];
        if (!activity) {
          return null;
        }
        return {
          slot_id: slot.slot_id,
          day: slot.day,
          slot: slot.slot,
          activity,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);

    setSaveBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const saved = await api.saveDraftPlan(tripId, { selections });
      setSavedDraftPlan(saved);
      setStatusMessage("Draft plan saved and shareable with everyone on this trip.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft plan");
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="panel fade-up p-6 md:p-8">
        <p className="badge">Trip Workspace</p>
        <h1 className="hero-title mt-4 text-3xl sm:text-4xl">
          {trip?.destination ? `${trip.destination} plan` : "Build your group plan"}
        </h1>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="meta-strip">
            <p className="field-label">Trip ID</p>
            <div className="mono-block mt-1">{tripId}</div>
          </div>
          {trip && (
            <div className="meta-strip">
              <p className="field-label">Dates</p>
              <p className="mt-1 text-sm text-[var(--ink)]">
                {trip.start_date} to {trip.end_date}
              </p>
            </div>
          )}
          {joinCode && (
            <div className="meta-strip">
              <p className="field-label">Invite Code</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{joinCode}</p>
              <div className="mono-block mt-1">{`/trip/${tripId}?token=${joinCode}`}</div>
            </div>
          )}
        </div>

        {trip && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Accommodation coordinates: {trip.accommodation_lat}, {trip.accommodation_lng}
          </p>
        )}
        {error && <p className="error-text mt-3">{error}</p>}
        {statusMessage && <p className="mt-3 text-sm font-semibold text-[var(--brand)]">{statusMessage}</p>}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel fade-up p-6 md:p-7">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Participants</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Add everyone first, then generate itinerary options.</p>

          <form onSubmit={onJoin} className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="field-label">Participant Name</span>
              <input
                className="field-input"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                required
              />
            </label>

            <div className="grid gap-3">
              {interestEntries.map(([key, value]) => (
                <label className="metric-card" key={key}>
                  <div className="flex items-center justify-between">
                    <span className="field-label">{key}</span>
                    <span className="text-sm font-semibold text-[var(--ink)]">{value}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={value}
                    className="field-input mt-2"
                    onChange={(e) =>
                      setInterests((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="field-label">Schedule Preference</span>
                <select
                  value={schedulePreference}
                  onChange={(e) => setSchedulePreference(e.target.value as "packed" | "balanced" | "chill")}
                  className="field-input"
                >
                  <option value="packed">Packed</option>
                  <option value="balanced">Balanced</option>
                  <option value="chill">Chill</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="field-label">Wake Preference</span>
                <select
                  value={wakePreference}
                  onChange={(e) => setWakePreference(e.target.value as "early" | "normal" | "late")}
                  className="field-input"
                >
                  <option value="early">Early</option>
                  <option value="normal">Normal</option>
                  <option value="late">Late</option>
                </select>
              </label>
            </div>

            <button type="submit" className="primary-btn" disabled={busy}>
              Add Participant
            </button>
          </form>

          <h3 className="mt-7 font-[var(--font-heading)] text-xl font-semibold">Current Participants</h3>
          <ul className="mt-3 grid gap-2 text-sm">
            {trip?.participants?.map((p, idx) => (
              <li key={`${p.name}-${idx}`} className="participant-chip">
                <p className="font-semibold text-[var(--ink)]">{p.name}</p>
                <p className="mt-1 text-[var(--muted)]">{p.schedule_preference} pace | {p.wake_preference} wake</p>
              </li>
            ))}
            {!trip?.participants?.length && <li className="text-sm text-[var(--muted)]">No participants yet.</li>}
          </ul>

          <button onClick={onGenerate} className="secondary-btn mt-6 w-full" disabled={busy}>
            {busy ? "Generating..." : "Generate Itinerary Options"}
          </button>
          <button onClick={onStartDraft} className="primary-btn mt-3 w-full" disabled={busy}>
            {busy ? "Preparing Draft..." : "Start Draft Pick Builder"}
          </button>
        </div>

        <div className="panel fade-up p-6 md:p-7">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Draft Builder</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Pick one option for each day slot. Morning and afternoon rounds show activity options, dinner rounds show restaurant options.
          </p>

          {!draft && (
            <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
              <p className="text-sm text-[var(--muted)]">
                Start draft mode after preferences are set. The system will generate slot-by-slot choices for every day.
              </p>
              <button onClick={onStartDraft} className="primary-btn mt-4" disabled={busy}>
                {busy ? "Preparing..." : "Generate Draft Slots"}
              </button>
            </div>
          )}

          {draft && currentDraftSlot && (
            <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-[var(--font-heading)] text-xl font-semibold">
                  Day {currentDraftSlot.day} - {slotLabel[currentDraftSlot.slot]}
                </h3>
                <span className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">
                  Slot {Math.min(draftIndex + 1, draftSlots.length)} / {draftSlots.length}
                </span>
              </div>
              <div className="score-track mt-3">
                <span className="score-fill" style={{ width: `${draftProgress}%` }} />
              </div>
              <p className="mt-4 text-sm text-[var(--muted)]">
                Open the popup to review 4 options with quick reasons, then pick one.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setDraftModalOpen(true)} className="primary-btn">
                  Open Choices Popup
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={onBackDraftSlot} className="secondary-btn" disabled={draftIndex === 0}>
                    Previous Slot
                  </button>
                  <button onClick={onRedraft} className="secondary-btn">
                    Restart Draft
                  </button>
                </div>
              </div>
            </div>
          )}

          {draft && !currentDraftSlot && draftComplete && (
            <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-[var(--font-heading)] text-xl font-semibold">Draft Complete</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={onSaveDraftPlan} className="primary-btn" disabled={saveBusy}>
                    {saveBusy ? "Saving..." : "Save Draft Plan"}
                  </button>
                  <button onClick={onRedraft} className="secondary-btn">Draft Again</button>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                {draftSummaryByDay.map(({ day, picks }) => (
                  <div key={`draft-day-${day}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <h4 className="font-[var(--font-heading)] text-lg font-semibold">Day {day}</h4>
                    {[
                      { label: "Morning", activity: picks.morning },
                      { label: "Afternoon", activity: picks.afternoon },
                      { label: "Dinner", activity: picks.evening },
                    ].map((slot) => (
                      <div key={`${day}-${slot.label}`} className="mt-3 rounded-lg border border-[var(--line)] px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{slot.label}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{slot.activity?.name ?? "Open slot"}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {savedDraftPlan && (
            <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
              <h3 className="font-[var(--font-heading)] text-xl font-semibold">Saved Draft Plan</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                Last saved {savedDraftPlan.saved_at}
              </p>
              <div className="mt-4 grid gap-4">
                {savedDraftSummaryByDay.map(({ day, picks }) => (
                  <div key={`saved-draft-day-${day}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <h4 className="font-[var(--font-heading)] text-lg font-semibold">Day {day}</h4>
                    {[
                      { label: "Morning", activity: picks.morning },
                      { label: "Afternoon", activity: picks.afternoon },
                      { label: "Dinner", activity: picks.evening },
                    ].map((slot) => (
                      <div key={`${day}-saved-${slot.label}`} className="mt-3 rounded-lg border border-[var(--line)] px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{slot.label}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{slot.activity?.name ?? "Open slot"}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="mt-8 font-[var(--font-heading)] text-2xl font-semibold">Itinerary Options</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Three pacing styles generated from real nearby places.</p>

          {trip?.accommodation_address && (
            <div className="mt-5 rounded-xl border border-[var(--brand)] bg-[var(--brand)]/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-[var(--font-heading)] text-sm font-bold uppercase tracking-wider text-[var(--brand)]">Your Basecamp</h3>
                  <p className="mt-1 text-base font-medium text-[var(--ink)]">{trip.accommodation_address}</p>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.accommodation_address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  View on Map
                </a>
              </div>
            </div>
          )}

          {!itinerary && <p className="mt-5 text-sm text-[var(--muted)]">No itinerary generated yet.</p>}

          <div className="mt-5 grid gap-4">
            {itinerary?.options.map((option) => (
              <article key={option.style} className={`option-card fade-up style-${option.style}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold">{option.name}</h3>
                  <span className="rounded-full border border-[var(--line-strong)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.07em]">
                    Match {option.group_match_score}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                  {styleSubtitle[option.style] ?? "Smartly arranged group plan"}
                </p>
                <div className="score-track">
                  <span className="score-fill" style={{ width: `${option.group_match_score}%` }} />
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">{option.explanation}</p>

                <div className="mt-5 grid gap-5">
                  {option.days.map((day) => (
                    <div key={day.day} className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
                      <h4 className="font-[var(--font-heading)] text-xl font-bold">Day {day.day}</h4>
                      <div className="mt-4 grid gap-4">
                        {[
                          { label: "Morning", activity: day.morning_activity },
                          { label: "Afternoon", activity: day.afternoon_activity },
                          { label: "Dinner", activity: day.dinner },
                          { label: "Evening", activity: day.evening_option },
                        ].map((slot) => (
                          <div key={slot.label} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm hover:shadow-md transition-shadow">
                            {!slot.activity ? (
                              <div className="flex items-center gap-3 opacity-50">
                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand)]">{slot.label}</span>
                                <span className="text-sm font-medium text-[var(--muted)]">Open time</span>
                              </div>
                            ) : (
                              <>
                                {slot.activity.image_url && (
                                  <div className="-mx-4 -mt-4 mb-4 h-48 overflow-hidden rounded-t-xl bg-[var(--surface-soft)]">
                                    <img
                                      src={slot.activity.image_url}
                                      alt={slot.activity.name}
                                      className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                                    />
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand)]">{slot.label}</span>
                                    <h4 className="font-semibold text-[var(--ink)] text-lg">{slot.activity.name}</h4>
                                  </div>
                                  <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] border border-[var(--line-strong)] capitalize">
                                    {slot.activity.category}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-4 text-xs font-medium text-[var(--muted)]">
                                  <span>⭐ {slot.activity.rating.toFixed(1)}</span>
                                  <span>{Array(Math.max(1, slot.activity.price_level)).fill('$').join('')} {slot.activity.estimated_price ? `(${slot.activity.estimated_price})` : ''}</span>
                                </div>
                                {slot.activity.explanation && (
                                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{slot.activity.explanation}</p>
                                )}
                                {slot.activity.activity_url && (
                                  <div className="mt-4 border-t border-[var(--line)] pt-4">
                                    <a
                                      href={slot.activity.activity_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex w-full justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-white"
                                    >
                                      View on Map / Book
                                    </a>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {draftModalOpen && currentDraftSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Draft Round</p>
                <h3 className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--ink)]">
                  Day {currentDraftSlot.day} - {slotLabel[currentDraftSlot.slot]}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Pick 1 of {currentDraftSlot.candidates.length}. Slot {Math.min(draftIndex + 1, draftSlots.length)} of {draftSlots.length}.
                </p>
              </div>
              <button onClick={() => setDraftModalOpen(false)} className="secondary-btn">Close</button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {currentDraftSlot.candidates.map((candidate) => {
                const selected = draftPicks[currentDraftSlot.slot_id]?.name === candidate.name;
                return (
                  <article
                    key={`${currentDraftSlot.slot_id}-modal-${candidate.name}`}
                    className={`rounded-xl border bg-[var(--surface-soft)] p-4 shadow-sm transition-shadow hover:shadow-md ${
                      selected ? "border-[var(--brand)]" : "border-[var(--line)]"
                    }`}
                  >
                    {candidate.image_url && (
                      <div className="-mx-4 -mt-4 mb-4 h-40 overflow-hidden rounded-t-xl bg-[var(--surface)]">
                        <img
                          src={candidate.image_url}
                          alt={candidate.name}
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                        />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{candidate.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)] capitalize">
                          {candidate.category}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                        {candidate.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {Array(Math.max(1, candidate.price_level)).fill("$").join("")}
                      {candidate.estimated_price ? ` | ${candidate.estimated_price}` : ""}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                      {getDraftCandidateDescription(candidate, currentDraftSlot.slot)}
                    </p>
                    <button onClick={() => onPickCandidate(candidate)} className="primary-btn mt-4 w-full">
                      Pick This
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button onClick={onBackDraftSlot} className="secondary-btn" disabled={draftIndex === 0}>
                Previous Slot
              </button>
              <button onClick={onRedraft} className="secondary-btn">
                Restart Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
