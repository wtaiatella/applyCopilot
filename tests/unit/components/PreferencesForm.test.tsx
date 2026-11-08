/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import PreferencesForm from "@/components/profile/PreferencesForm";

const basePrefs = {
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

let fetchMock: jest.Mock;

function mockFetch(prefs: Record<string, unknown>) {
  fetchMock = jest.fn().mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(init?.method === "PUT" ? {} : prefs),
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
}

async function renderForm(prefs: Record<string, unknown> = {}) {
  mockFetch({ ...basePrefs, ...prefs });
  render(<PreferencesForm />);
  await screen.findByLabelText("Minimum Salary");
}

const hint = () => screen.queryByText(/per year/);

describe("PreferencesForm — multi-period salary (APC-44)", () => {
  it("defaults to Yearly with no hint (AC-8)", async () => {
    await renderForm({ salaryMin: 5000, salaryCurrency: "USD" });
    expect(screen.getByText("Yearly")).toBeInTheDocument();
    expect(hint()).toBeNull();
  });

  it("shows the yearly equivalent as real text when MONTHLY (AC-3)", async () => {
    await renderForm({
      salaryMin: 5000,
      salaryCurrency: "USD",
      salaryPeriod: "MONTHLY",
    });
    const el = screen.getByText("≈ US$60,000 per year");
    expect(el).toBeVisible();
    expect(screen.getByLabelText("Minimum Salary")).toHaveAttribute(
      "aria-describedby",
      el.id,
    );
  });

  it("shows no hint for MONTHLY without an amount", async () => {
    await renderForm({ salaryPeriod: "MONTHLY" });
    expect(hint()).toBeNull();
  });

  it("updates the hint on typing and on period change", async () => {
    await renderForm({ salaryMin: 1000, salaryCurrency: "EUR", salaryPeriod: "MONTHLY" });
    expect(screen.getByText("≈ €12,000 per year")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minimum Salary"), {
      target: { value: "2000" },
    });
    expect(screen.getByText("≈ €24,000 per year")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText("Salary Period"));
    fireEvent.click(await screen.findByText("Yearly", { selector: ".ant-select-item-option-content" }));
    expect(hint()).toBeNull();
  });

  it("shows no hint for the hourly group", async () => {
    await renderForm({ hourlyMin: 50, hourlyCurrency: "USD" });
    expect(screen.getByLabelText("Minimum Hourly Rate")).toHaveValue("50");
    expect(hint()).toBeNull();
  });

  it("labels all touched controls", async () => {
    await renderForm();
    for (const l of [
      "Minimum Salary",
      "Salary Currency",
      "Salary Period",
      "Minimum Hourly Rate",
      "Hourly Currency",
    ]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument();
    }
  });

  it("auto-saves a payload with salaryPeriod, hourlyMin and hourlyCurrency", async () => {
    jest.useFakeTimers();
    try {
      await renderForm();
      fireEvent.change(screen.getByLabelText("Minimum Hourly Rate"), {
        target: { value: "40" },
      });
      fireEvent.change(screen.getByLabelText("Hourly Currency"), {
        target: { value: "eur" },
      });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some((c) => c[1]?.method === "PUT"),
        ).toBe(true),
      );
      const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT")!;
      const body = JSON.parse(put[1].body);
      expect(body).toMatchObject({
        salaryPeriod: "YEARLY",
        hourlyMin: 40,
        hourlyCurrency: "EUR",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  describe("monthly clamp notice", () => {
    const switchToMonthly = async () => {
      fireEvent.mouseDown(screen.getByLabelText("Salary Period"));
      fireEvent.click(
        await screen.findByText("Monthly", {
          selector: ".ant-select-item-option-content",
        }),
      );
    };
    const notice = () =>
      screen.queryByText("Minimum adjusted to the monthly maximum of 1,000,000");

    it("clamps to 1,000,000 and shows a visible status notice", async () => {
      await renderForm({ salaryMin: 5_000_000, salaryCurrency: "USD" });
      await switchToMonthly();
      expect(screen.getByLabelText("Minimum Salary")).toHaveValue("1000000");
      const el = notice();
      expect(el).toBeVisible();
      expect(el).toHaveAttribute("role", "status");
      expect(screen.getByLabelText("Minimum Salary").getAttribute("aria-describedby")).toContain(
        el!.id,
      );
    });

    it("shows no notice when the amount is within the monthly limit", async () => {
      await renderForm({ salaryMin: 900_000, salaryCurrency: "USD" });
      await switchToMonthly();
      expect(screen.getByLabelText("Minimum Salary")).toHaveValue("900000");
      expect(notice()).toBeNull();
    });

    it("clears the notice when the amount is edited", async () => {
      await renderForm({ salaryMin: 5_000_000, salaryCurrency: "USD" });
      await switchToMonthly();
      expect(notice()).not.toBeNull();
      fireEvent.change(screen.getByLabelText("Minimum Salary"), {
        target: { value: "2000" },
      });
      expect(notice()).toBeNull();
    });
  });

  describe("currency inputs", () => {
    it("uppercases and cuts salaryCurrency to 3 letters", async () => {
      jest.useFakeTimers();
      try {
        await renderForm();
        fireEvent.change(screen.getByLabelText("Salary Currency"), {
          target: { value: "brlx" },
        });
        await act(async () => {
          jest.advanceTimersByTime(2000);
        });
        await waitFor(() =>
          expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(true),
        );
        const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT")!;
        expect(JSON.parse(put[1].body).salaryCurrency).toBe("BRL");
      } finally {
        jest.useRealTimers();
      }
    });

    const optionTexts = () =>
      Array.from(
        document.querySelectorAll(".ant-select-item-option-content"),
      ).map((e) => e.textContent);

    it("offers the common codes when empty", async () => {
      await renderForm();
      fireEvent.mouseDown(screen.getByLabelText("Salary Currency"));
      await screen.findByText("USD", { selector: ".ant-select-item-option-content" });
      expect(optionTexts()).toEqual(["USD", "EUR", "GBP", "BRL", "CAD", "AUD"]);
    });

    it("adds a typed uppercased 3-letter code that is not a common one", async () => {
      await renderForm();
      const input = screen.getByLabelText("Salary Currency");
      fireEvent.mouseDown(input);
      fireEvent.change(input, { target: { value: "chf" } });
      await screen.findByText("CHF", { selector: ".ant-select-item-option-content" });
      expect(optionTexts()).toEqual(["CHF"]);
    });
  });
});
