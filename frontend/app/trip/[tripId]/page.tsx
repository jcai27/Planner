"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { api } from "@/lib/api";
import {
  Activity,
  AnalyticsSummary,
  DraftPlan,
  DraftSchedule,
  DraftSlotFeedback,
  DraftValidationReport,
  InterestVector,
  ItineraryResult,
  PlanningSettings,
  Trip,
} from "@/lib/types";

const defaultInterests: InterestVector = {
  food: 3,
  nightlife: 2,
  culture: 3,
  outdoors: 3,
  relaxation: 2,
};

const defaultPlanningSettings: PlanningSettings = {
  daily_budget_per_person: 120,
  max_transfer_minutes: 45,
  dietary_notes: "",
  mobility_notes: "",
  must_do_places: [],
  avoid_places: [],
};

type FeedbackValue = {
  votes: number;
  vetoed: boolean;
};

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function feedbackKey(slotId: string, candidateName: string): string {
  return `${slotId}::${candidateName}`;
}

function formatActivityPrice(activity: Activity): string {
  const estimated = activity.estimated_price?.trim();
  if (estimated) {
    return estimated;
  }
  if (activity.price_level <= 0) {
    return "Free";
  }
  return "$".repeat(Math.max(1, activity.price_level));
}

function formatPriceConfidence(activity: Activity): string {
  const confidence = (activity.price_confidence || "").toLowerCase();
  if (confidence === "verified") {
    return "High confidence";
  }
  if (confidence === "inferred") {
    return "Estimated";
  }
  return "Unknown confidence";
}

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");

  const [trip, setTrip] = useState<Trip | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
  const [draft, setDraft] = useState<DraftSchedule | null>(null);
  const [savedDraftPlan, setSavedDraftPlan] = useState<DraftPlan | null>(null);
  const [validationReport, setValidationReport] = useState<DraftValidationReport | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [draftIndex, setDraftIndex] = useState(0);
  const [draftPicks, setDraftPicks] = useState<Record<string, Activity>>({});
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackValue>>({});
  const [shareUrl, setShareUrl] = useState("");

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [interests, setInterests] = useState<InterestVector>(defaultInterests);
  const [schedulePreference, setSchedulePreference] = useState<"packed" | "balanced" | "chill">("balanced");
  const [wakePreference, setWakePreference] = useState<"early" | "normal" | "late">("normal");

  const [planningSettings, setPlanningSettings] = useState<PlanningSettings>(defaultPlanningSettings);
  const [mustDoInput, setMustDoInput] = useState("");
  const [avoidInput, setAvoidInput] = useState("");

  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [planningBusy, setPlanningBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const interestEntries = useMemo(
    () => Object.entries(interests) as [keyof InterestVector, number][],
    [interests]
  );

  const styleSubtitle: Record<string, string> = {
    packed: "Higher energy days with denser activity blocks",
    balanced: "Even pace across culture, food, and downtime",
    chill: "Lower pressure pacing with lighter transitions",
  };

  const slotLabel: Record<string, string> = {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Dinner",
  };

  const planningPayload = useMemo(
    () => ({
      ...planningSettings,
      must_do_places: splitCsv(mustDoInput),
      avoid_places: splitCsv(avoidInput),
    }),
    [planningSettings, mustDoInput, avoidInput]
  );

  const draftSlots = draft?.slots ?? [];
  const currentDraftSlot = draftSlots[draftIndex] ?? null;
  const draftComplete = draftSlots.length > 0 && draftSlots.every((slot) => !!draftPicks[slot.slot_id]);
  const draftPickedCount = draftSlots.reduce((count, slot) => count + (draftPicks[slot.slot_id] ? 1 : 0), 0);
  const draftProgress = draftSlots.length ? Math.round((draftPickedCount / draftSlots.length) * 100) : 0;

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

  const validationByDay = useMemo(() => {
    const map = new Map<number, DraftValidationReport["days"][number]>();
    for (const day of validationReport?.days ?? []) {
      map.set(day.day, day);
    }
    return map;
  }, [validationReport]);

  useEffect(() => {
    if (inviteToken) {
      api.saveTripAccess(tripId, inviteToken);
    }
    setJoinCode(api.getSavedJoinCode(tripId));
  }, [tripId, inviteToken]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tripData, itineraryData, savedDraft, settingsData, analyticsData] = await Promise.all([
          api.getTrip(tripId),
          api.getItinerary(tripId).catch(() => null),
          api.getDraftPlan(tripId).catch(() => null),
          api.getPlanningSettings(tripId).catch(() => defaultPlanningSettings),
          api.getAnalyticsSummary().catch(() => null),
        ]);
        setTrip(tripData);
        setItinerary(itineraryData);
        setSavedDraftPlan(savedDraft);
        setPlanningSettings(settingsData);
        setMustDoInput((settingsData.must_do_places || []).join(", "));
        setAvoidInput((settingsData.avoid_places || []).join(", "));
        setAnalytics(analyticsData);

        if (savedDraft?.metadata?.shared_token) {
          const base = window.location.origin;
          setShareUrl(`${base}/share/${savedDraft.metadata.shared_token}`);
        }
        if (savedDraft?.metadata?.slot_feedback?.length) {
          const initialFeedback: Record<string, FeedbackValue> = {};
          for (const feedback of savedDraft.metadata.slot_feedback) {
            initialFeedback[feedbackKey(feedback.slot_id, feedback.candidate_name)] = {
              votes: feedback.votes,
              vetoed: feedback.vetoed,
            };
          }
          setFeedbackMap(initialFeedback);
        }
        if (savedDraft) {
          const report = await api.getDraftValidation(tripId).catch(() => null);
          setValidationReport(report);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trip");
      }
    };
    void load();
  }, [tripId]);

  useEffect(() => {
    if (!currentDraftSlot) {
      setDraftModalOpen(false);
    }
  }, [currentDraftSlot]);

  const getFeedback = (slotId: string, candidateName: string): FeedbackValue => {
    return feedbackMap[feedbackKey(slotId, candidateName)] || { votes: 0, vetoed: false };
  };

  const toFeedbackPayload = (): DraftSlotFeedback[] => {
    return Object.entries(feedbackMap)
      .filter(([, feedback]) => feedback.votes > 0 || feedback.vetoed)
      .map(([key, feedback]) => {
        const [slotId, ...nameParts] = key.split("::");
        return {
          slot_id: slotId,
          candidate_name: nameParts.join("::"),
          votes: feedback.votes,
          vetoed: feedback.vetoed,
        };
      });
  };

  const onVoteCandidate = (slotId: string, candidateName: string) => {
    const key = feedbackKey(slotId, candidateName);
    setFeedbackMap((prev) => {
      const current = prev[key] || { votes: 0, vetoed: false };
      return {
        ...prev,
        [key]: { ...current, votes: current.votes + 1 },
      };
    });
  };

  const onToggleVetoCandidate = (slotId: string, candidateName: string) => {
    const key = feedbackKey(slotId, candidateName);
    setFeedbackMap((prev) => {
      const current = prev[key] || { votes: 0, vetoed: false };
      return {
        ...prev,
        [key]: { ...current, vetoed: !current.vetoed },
      };
    });
  };

  const onSavePlanningSettings = async () => {
    setPlanningBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const saved = await api.savePlanningSettings(tripId, planningPayload);
      setPlanningSettings(saved);
      setMustDoInput((saved.must_do_places || []).join(", "));
      setAvoidInput((saved.avoid_places || []).join(", "));
      setStatusMessage("Planning constraints saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save planning constraints");
    } finally {
      setPlanningBusy(false);
    }
  };

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
        wake_preference: wakePreference,
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
      await api.savePlanningSettings(tripId, planningPayload);
      const generatedDraft = await api.getDraftSlots(tripId);
      if (!generatedDraft.slots.length) {
        throw new Error("No draft candidates available. Try adding more participants or adjusting constraints.");
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
      setStatusMessage("Draft choices generated with your constraints.");
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
    const feedback = getFeedback(currentDraftSlot.slot_id, activity.name);
    if (feedback.vetoed) {
      setError("This option is vetoed. Remove veto before selecting it.");
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
      const saved = await api.saveDraftPlan(tripId, {
        selections,
        planning_settings: planningPayload,
        slot_feedback: toFeedbackPayload(),
      });
      setSavedDraftPlan(saved);
      const report = await api.getDraftValidation(tripId).catch(() => null);
      setValidationReport(report);
      setStatusMessage("Draft plan saved. Validation report updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft plan");
    } finally {
      setSaveBusy(false);
    }
  };

  const onCreateShareLink = async () => {
    setShareBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = await api.createShareLink(tripId);
      setShareUrl(payload.share_url);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.share_url).catch(() => undefined);
      }
      setStatusMessage("Share link generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="panel fade-up p-6 md:p-8">
        <p className="badge">Trip Workspace</p>
        <h1 className="hero-title mt-4 text-3xl sm:text-4xl">
          {trip?.destination ? `${trip.destination} plan` : "Build your group plan"}
        </h1>
        <div className="view-tabs mt-4">
          <Link href={`/trip/${tripId}`} className="view-tab view-tab-active">
            Workspace
          </Link>
          <Link href={`/trip/${tripId}/schedule`} className="view-tab">
            Schedule Table
          </Link>
        </div>

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
            </div>
          )}
        </div>
        {analytics && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="metric-card">
              <p className="metric-label">Draft Adoption</p>
              <p className="metric-value">{analytics.pct_trips_with_saved_draft}%</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Full Coverage</p>
              <p className="metric-value">{analytics.pct_saved_drafts_full_slots}%</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Share Rate</p>
              <p className="metric-value">{analytics.pct_saved_drafts_shared}%</p>
            </div>
          </div>
        )}
        {error && <p className="error-text mt-3">{error}</p>}
        {statusMessage && <p className="mt-3 text-sm font-semibold text-[var(--brand)]">{statusMessage}</p>}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-5">
          <div className="panel fade-up p-6 md:p-7">
            <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Participants</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Add everyone, then generate itinerary options.</p>

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
                      onChange={(e) => setInterests((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
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
              {trip?.participants?.map((participant, idx) => (
                <li key={`${participant.name}-${idx}`} className="participant-chip">
                  <p className="font-semibold text-[var(--ink)]">{participant.name}</p>
                  <p className="mt-1 text-[var(--muted)]">
                    {participant.schedule_preference} pace | {participant.wake_preference} wake
                  </p>
                </li>
              ))}
              {!trip?.participants?.length && <li className="text-sm text-[var(--muted)]">No participants yet.</li>}
            </ul>

            <button onClick={onGenerate} className="secondary-btn mt-6 w-full" disabled={busy}>
              {busy ? "Generating..." : "Generate Itinerary Options"}
            </button>
          </div>

          <div className="panel fade-up p-6 md:p-7">
            <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Planning Constraints</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Set budget, transit limits, and must-do/avoid guidance before drafting.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="field-label">Daily Budget Per Person (USD)</span>
                <input
                  type="number"
                  min={0}
                  className="field-input"
                  value={planningSettings.daily_budget_per_person}
                  onChange={(e) =>
                    setPlanningSettings((prev) => ({ ...prev, daily_budget_per_person: Number(e.target.value || 0) }))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="field-label">Max Transfer Minutes Between Slots</span>
                <input
                  type="number"
                  min={5}
                  className="field-input"
                  value={planningSettings.max_transfer_minutes}
                  onChange={(e) =>
                    setPlanningSettings((prev) => ({ ...prev, max_transfer_minutes: Number(e.target.value || 5) }))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="field-label">Dietary Notes</span>
                <input
                  className="field-input"
                  value={planningSettings.dietary_notes}
                  onChange={(e) => setPlanningSettings((prev) => ({ ...prev, dietary_notes: e.target.value }))}
                  placeholder="e.g. vegetarian-friendly dinners"
                />
              </label>
              <label className="grid gap-2">
                <span className="field-label">Mobility Notes</span>
                <input
                  className="field-input"
                  value={planningSettings.mobility_notes}
                  onChange={(e) => setPlanningSettings((prev) => ({ ...prev, mobility_notes: e.target.value }))}
                  placeholder="e.g. avoid steep hikes"
                />
              </label>
              <label className="grid gap-2">
                <span className="field-label">Must-do Places (comma separated)</span>
                <input
                  className="field-input"
                  value={mustDoInput}
                  onChange={(e) => setMustDoInput(e.target.value)}
                  placeholder="e.g. Louvre, Central Park"
                />
              </label>
              <label className="grid gap-2">
                <span className="field-label">Avoid Places (comma separated)</span>
                <input
                  className="field-input"
                  value={avoidInput}
                  onChange={(e) => setAvoidInput(e.target.value)}
                  placeholder="e.g. fast food, tourist trap"
                />
              </label>
              <button onClick={onSavePlanningSettings} className="primary-btn" disabled={planningBusy}>
                {planningBusy ? "Saving..." : "Save Constraints"}
              </button>
            </div>
          </div>
        </div>

        <div className="panel fade-up p-6 md:p-7">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Draft Builder</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Each slot shows four cards. Vote, veto, then pick. Choices use your constraints and avoid duplicates.
          </p>

          {!draft && (
            <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
              <p className="text-sm text-[var(--muted)]">
                Generate draft rounds after preferences and constraints are set.
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
            </div>
          )}

          {savedDraftPlan && (
            <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold">Saved Draft Plan</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                    Last saved {savedDraftPlan.saved_at}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/trip/${tripId}/schedule`} className="secondary-btn inline-flex">
                    Open Schedule Table
                  </Link>
                  <button onClick={onCreateShareLink} className="primary-btn" disabled={shareBusy}>
                    {shareBusy ? "Generating..." : "Create Share Link"}
                  </button>
                </div>
              </div>
              {shareUrl && (
                <div className="mt-3">
                  <p className="field-label">Share URL</p>
                  <div className="mono-block mt-1">{shareUrl}</div>
                </div>
              )}
              <div className="mt-4 grid gap-4">
                {savedDraftSummaryByDay.map(({ day, picks }) => {
                  const validation = validationByDay.get(day);
                  return (
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
                      {validation && (
                        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm">
                          <p className="font-semibold text-[var(--ink)]">
                            Cost {validation.estimated_cost_per_person} (${validation.estimated_cost_value.toFixed(0)}) | Transfers {validation.transfer_minutes_total} min
                          </p>
                          {validation.warnings.length > 0 && (
                            <p className="mt-1 text-[var(--danger)]">{validation.warnings.join(" | ")}</p>
                          )}
                          {validation.route_map_url && (
                            <a href={validation.route_map_url} target="_blank" rel="noreferrer" className="schedule-map-link mt-2">
                              Open Day Route
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {validationReport?.warnings?.length ? (
                <div className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-red-50 p-3 text-sm text-[var(--danger)]">
                  {validationReport.warnings.join(" | ")}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="panel fade-up mt-5 p-6 md:p-7">
        <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Itinerary Options</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Generated pacing styles from real nearby places.</p>
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
              <p className="mt-3 text-sm text-[var(--muted)]">{option.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      {draftModalOpen && currentDraftSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl md:p-7">
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
                const feedback = getFeedback(currentDraftSlot.slot_id, candidate.name);
                const selected = draftPicks[currentDraftSlot.slot_id]?.name === candidate.name;
                const mapUrl =
                  candidate.activity_url ||
                  `https://www.google.com/maps/search/?api=1&query=${candidate.latitude},${candidate.longitude}`;
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
                        Rating {candidate.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {formatActivityPrice(candidate)} | {formatPriceConfidence(candidate)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--ink)]">
                      Why this matches group: {candidate.group_fit_score?.toFixed(1) ?? "n/a"} / 100
                    </p>
                    {candidate.conflict_summary && (
                      <p className="mt-1 text-xs text-[var(--muted)]">{candidate.conflict_summary}</p>
                    )}
                    {candidate.explanation && (
                      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{candidate.explanation}</p>
                    )}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => onVoteCandidate(currentDraftSlot.slot_id, candidate.name)}
                        className="secondary-btn"
                      >
                        Vote ({feedback.votes})
                      </button>
                      <button
                        onClick={() => onToggleVetoCandidate(currentDraftSlot.slot_id, candidate.name)}
                        className="secondary-btn"
                      >
                        {feedback.vetoed ? "Remove Veto" : "Veto"}
                      </button>
                    </div>

                    <a href={mapUrl} target="_blank" rel="noreferrer" className="secondary-btn mt-3 inline-flex w-full justify-center">
                      Open in Google Maps
                    </a>
                    <button
                      onClick={() => onPickCandidate(candidate)}
                      className="primary-btn mt-4 w-full"
                      disabled={feedback.vetoed}
                    >
                      {feedback.vetoed ? "Blocked by Veto" : "Pick This"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
