"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, Select, InputNumber, AutoComplete, Badge } from "antd";
import {
  CloudSyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { UserPreferencesDTO, SeniorityLevel } from "@/types/profile";
import { yearlyEquivalent } from "@/lib/salary/salary";
import { formatMoney } from "@/lib/salary/format";

const { Option } = Select;

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Mirrors the API's all-null default shape (src/app/api/profile/preferences/route.ts)
// so the form always binds to a stable object, even before the initial fetch resolves.
const DEFAULT_PREFERENCES: UserPreferencesDTO = {
  seniority: null,
  totalYearsExperience: null,
  acceptsContract: null,
  acceptsFreelance: null,
  acceptsOnsite: null,
  acceptsHybrid: null,
  acceptsRemote: null,
  onlyWorldwide: null,
  hasUsWorkAuth: null,
  requiresVisaRelocation: null,
  salaryMin: null,
  salaryCurrency: null,
  salaryPeriod: "YEARLY",
  hourlyMin: null,
  hourlyCurrency: null,
  excludeKeywords: [],
};

const SENIORITY_OPTIONS: { value: SeniorityLevel; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" },
];

// Tri-state: Explicit Match / Explicit Conflict / Not Stated (indifferent). Stored as
// boolean|null; represented as a string sentinel here only to sidestep Select's
// value-matching ambiguity with `null` (spectech.md tri-state preference model).
const TRISTATE_OPTIONS: { value: string; label: string }[] = [
  { value: "null", label: "Indifferent (not stated)" },
  { value: "true", label: "Accept / Yes" },
  { value: "false", label: "Reject / No" },
];

const SALARY_MAX = { YEARLY: 10_000_000, MONTHLY: 1_000_000 } as const;
const HOURLY_MAX = 100_000;

const PERIOD_OPTIONS = [
  { value: "YEARLY", label: "Yearly" },
  { value: "MONTHLY", label: "Monthly" },
];

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "BRL", "CAD", "AUD"];

// Common codes plus whatever 3-letter code the user typed (any ISO 4217 code is valid).
function currencyOptions(current: string | null) {
  const codes =
    current && /^[A-Z]{3}$/.test(current) && !COMMON_CURRENCIES.includes(current)
      ? [...COMMON_CURRENCIES, current]
      : COMMON_CURRENCIES;
  return codes
    .filter((c) => !current || c.startsWith(current))
    .map((c) => ({ value: c, label: c }));
}

function normalizeCurrency(value: string | undefined): string | null {
  return (value ?? "").toUpperCase().slice(0, 3) || null;
}

function toTriStateValue(value: boolean | null): string {
  return value === null ? "null" : String(value);
}

function fromTriStateValue(value: string): boolean | null {
  return value === "null" ? null : value === "true";
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-2 text-blue-400 text-xs font-medium bg-blue-950/40 border border-blue-900/50 px-2.5 py-1 rounded-full animate-pulse">
        <Badge status="processing" />
        <span>Saving changes...</span>
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-2 text-emerald-400 text-xs font-medium bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-1 rounded-full">
        <CheckCircleOutlined className="text-emerald-400" />
        <span>Saved to cloud</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-2 text-rose-400 text-xs font-medium bg-rose-950/40 border border-rose-900/50 px-2.5 py-1 rounded-full">
        <ExclamationCircleOutlined className="text-rose-400" />
        <span>Save failed</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-zinc-500 text-xs font-medium bg-zinc-900/40 border border-zinc-800/50 px-2.5 py-1 rounded-full">
      <CloudSyncOutlined />
      <span>Auto-saves active</span>
    </span>
  );
}

// Self-contained preferences tab: fetches UserPreferences on mount and auto-saves via
// its own debounced PUT — deliberately NOT threaded through ProfileContext's aggregate
// save machinery (spectech.md Technical Decisions: mirrors LLMSettingsPanel/JobCard's
// own self-contained fetch/save patterns).
export default function PreferencesForm() {
  const [prefs, setPrefs] = useState<UserPreferencesDTO>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [clampNotice, setClampNotice] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/profile/preferences");
        if (!res.ok) throw new Error("Failed to load preferences");
        const data: UserPreferencesDTO = await res.json();
        if (!cancelled) setPrefs(data);
      } catch {
        if (!cancelled) setError("Failed to load preferences.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up any pending debounced save on unmount (mirrors CVComposerContext).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const scheduleSave = (next: UserPreferencesDTO) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/profile/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error("Failed to save preferences");
        setSaveStatus("saved");
        setClampNotice(false);
      } catch {
        setSaveStatus("error");
      }
    }, 1500);
  };

  const updateField = <K extends keyof UserPreferencesDTO>(
    field: K,
    value: UserPreferencesDTO[K],
  ) => {
    setPrefs((prev) => {
      const next = { ...prev, [field]: value };
      scheduleSave(next);
      return next;
    });
  };

  const handlePeriodChange = (period: "YEARLY" | "MONTHLY") => {
    updateField("salaryPeriod", period);
    // Keep the saved amount valid for the new period's limit.
    if (prefs.salaryMin !== null && prefs.salaryMin > SALARY_MAX[period]) {
      updateField("salaryMin", SALARY_MAX[period]);
      setClampNotice(true);
    } else {
      setClampNotice(false);
    }
  };

  const showYearlyHint =
    prefs.salaryPeriod === "MONTHLY" &&
    prefs.salaryMin !== null &&
    prefs.salaryMin > 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        Loading preferences...
      </div>
    );
  }

  if (error) {
    return <div className="text-rose-400">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <Card
        className="bg-zinc-900/50 border-zinc-800 text-white"
        title="Job Preferences"
      >
        <p className="text-zinc-400 text-xs mb-4">
          Used to score and disqualify job matches. Leaving a field as
          &quot;Indifferent&quot; never lowers your score as much as an explicit
          conflict — only set fields you actually care about.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Seniority
            </label>
            <Select
              allowClear
              value={prefs.seniority ?? undefined}
              onChange={(value) => updateField("seniority", value ?? null)}
              onClear={() => updateField("seniority", null)}
              placeholder="Not stated"
              className="w-full"
            >
              {SENIORITY_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Total Years of Experience
            </label>
            <InputNumber
              min={0}
              max={60}
              value={prefs.totalYearsExperience ?? undefined}
              onChange={(value) =>
                updateField("totalYearsExperience", value ?? null)
              }
              className="w-full bg-zinc-950 border-zinc-800 text-white"
              placeholder="Not stated"
            />
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Accepts Contract
            </label>
            <Select
              value={toTriStateValue(prefs.acceptsContract)}
              onChange={(value) =>
                updateField("acceptsContract", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Accepts Freelance
            </label>
            <Select
              value={toTriStateValue(prefs.acceptsFreelance)}
              onChange={(value) =>
                updateField("acceptsFreelance", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Accepts Onsite
            </label>
            <Select
              value={toTriStateValue(prefs.acceptsOnsite)}
              onChange={(value) =>
                updateField("acceptsOnsite", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Accepts Hybrid
            </label>
            <Select
              value={toTriStateValue(prefs.acceptsHybrid)}
              onChange={(value) =>
                updateField("acceptsHybrid", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Accepts Remote
            </label>
            <Select
              value={toTriStateValue(prefs.acceptsRemote)}
              onChange={(value) =>
                updateField("acceptsRemote", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Only Worldwide-Applicable Jobs
            </label>
            <Select
              value={toTriStateValue(prefs.onlyWorldwide)}
              onChange={(value) =>
                updateField("onlyWorldwide", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Has US Work Authorization
            </label>
            <Select
              value={toTriStateValue(prefs.hasUsWorkAuth)}
              onChange={(value) =>
                updateField("hasUsWorkAuth", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-zinc-300 text-sm block mb-1">
              Requires Visa/Relocation Sponsorship
            </label>
            <Select
              value={toTriStateValue(prefs.requiresVisaRelocation)}
              onChange={(value) =>
                updateField("requiresVisaRelocation", fromTriStateValue(value))
              }
              className="w-full"
            >
              {TRISTATE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </div>

          <fieldset className="md:col-span-2 border border-zinc-800 rounded-md p-3">
            <legend className="text-zinc-300 text-sm px-1">
              Minimum salary (annual/monthly)
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pref-salary-min"
                  className="text-zinc-300 text-sm block mb-1"
                >
                  Minimum Salary
                </label>
                <InputNumber
                  id="pref-salary-min"
                  min={0}
                  max={SALARY_MAX[prefs.salaryPeriod]}
                  value={prefs.salaryMin ?? undefined}
                  onChange={(value) => {
                    setClampNotice(false);
                    updateField("salaryMin", value ?? null);
                  }}
                  className="w-full bg-zinc-950 border-zinc-800 text-white"
                  placeholder="Not stated"
                  aria-describedby={[
                    clampNotice ? "pref-salary-notice" : null,
                    showYearlyHint ? "pref-salary-hint" : "pref-salary-help",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </div>
              <div>
                <label
                  htmlFor="pref-salary-currency"
                  className="text-zinc-300 text-sm block mb-1"
                >
                  Salary Currency
                </label>
                <AutoComplete
                  id="pref-salary-currency"
                  value={prefs.salaryCurrency ?? ""}
                  options={currencyOptions(prefs.salaryCurrency)}
                  onChange={(value: string) =>
                    updateField("salaryCurrency", normalizeCurrency(value))
                  }
                  placeholder="USD"
                  className="w-full"
                />
              </div>
              <div>
                <label
                  htmlFor="pref-salary-period"
                  className="text-zinc-300 text-sm block mb-1"
                >
                  Salary Period
                </label>
                <Select
                  id="pref-salary-period"
                  value={prefs.salaryPeriod}
                  onChange={handlePeriodChange}
                  options={PERIOD_OPTIONS}
                  className="w-full"
                />
              </div>
            </div>
            {clampNotice && (
              <p
                id="pref-salary-notice"
                role="status"
                className="text-amber-400 text-xs mt-2"
              >
                Minimum adjusted to the monthly maximum of 1,000,000
              </p>
            )}
            {showYearlyHint && (
              <p
                id="pref-salary-hint"
                className="text-emerald-400 text-xs mt-2"
              >
                {`≈ ${formatMoney(
                  yearlyEquivalent(prefs.salaryMin as number),
                  prefs.salaryCurrency,
                )} per year`}
              </p>
            )}
            <p id="pref-salary-help" className="text-zinc-500 text-xs mt-2">
              Set a currency (e.g. USD, EUR, BRL): salaries are only compared
              with jobs that state the same currency.
            </p>
          </fieldset>

          <fieldset className="md:col-span-2 border border-zinc-800 rounded-md p-3">
            <legend className="text-zinc-300 text-sm px-1">
              Minimum hourly rate
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pref-hourly-min"
                  className="text-zinc-300 text-sm block mb-1"
                >
                  Minimum Hourly Rate
                </label>
                <InputNumber
                  id="pref-hourly-min"
                  min={0}
                  max={HOURLY_MAX}
                  value={prefs.hourlyMin ?? undefined}
                  onChange={(value) => updateField("hourlyMin", value ?? null)}
                  className="w-full bg-zinc-950 border-zinc-800 text-white"
                  placeholder="Not stated"
                  aria-describedby="pref-hourly-help"
                />
              </div>
              <div>
                <label
                  htmlFor="pref-hourly-currency"
                  className="text-zinc-300 text-sm block mb-1"
                >
                  Hourly Currency
                </label>
                <AutoComplete
                  id="pref-hourly-currency"
                  value={prefs.hourlyCurrency ?? ""}
                  options={currencyOptions(prefs.hourlyCurrency)}
                  onChange={(value: string) =>
                    updateField("hourlyCurrency", normalizeCurrency(value))
                  }
                  placeholder="USD"
                  className="w-full"
                />
              </div>
            </div>
            <p id="pref-hourly-help" className="text-zinc-500 text-xs mt-2">
              Set a currency (e.g. USD, EUR, BRL) so hourly jobs can be compared.
            </p>
          </fieldset>

          <div className="md:col-span-2">
            <label className="text-zinc-300 text-sm block mb-1">
              Excluded Keywords
            </label>
            <Select
              mode="tags"
              value={prefs.excludeKeywords}
              onChange={(value) =>
                updateField("excludeKeywords", value.slice(0, 50))
              }
              tokenSeparators={[","]}
              maxTagTextLength={200}
              placeholder="e.g. PHP, WordPress, on-call"
              className="w-full"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
