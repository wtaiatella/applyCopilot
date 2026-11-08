import { formatMoney, formatSalary } from "@/lib/salary/format";

const base = { salaryMin: null, salaryMax: null, currency: "USD" };

describe("formatSalary", () => {
  it("formats a single hourly value", () => {
    expect(formatSalary({ ...base, salaryMin: 35, salaryPeriod: "HOURLY" })).toBe("US$35/hr");
  });

  it("formats a compact monthly range with the suffix once", () => {
    expect(
      formatSalary({ ...base, salaryMin: 5000, salaryMax: 8000, salaryPeriod: "MONTHLY" })
    ).toBe("US$5k - US$8k/mo");
  });

  it("uses one decimal in compact mode and drops .0", () => {
    expect(formatSalary({ ...base, salaryMin: 5500, salaryPeriod: null })).toBe("US$5.5k");
    expect(formatSalary({ ...base, salaryMin: 5000, salaryPeriod: null })).toBe("US$5k");
  });

  it("formats full mode with comma grouping", () => {
    expect(
      formatSalary(
        { ...base, salaryMin: 5000, salaryMax: 8000, salaryPeriod: "MONTHLY" },
        "full"
      )
    ).toBe("US$5,000 - US$8,000/mo");
  });

  it("renders no suffix for a null (unknown) period", () => {
    expect(formatSalary({ ...base, salaryMin: 5000, salaryMax: 8000, salaryPeriod: null })).toBe(
      "US$5k - US$8k"
    );
  });

  it("renders /yr for an absent (legacy) period", () => {
    expect(formatSalary({ ...base, salaryMin: 60000, salaryMax: 90000 })).toBe(
      "US$60k - US$90k/yr"
    );
  });

  it("uses a CODE prefix for unknown currencies without throwing", () => {
    expect(formatSalary({ ...base, currency: "CAD", salaryMin: 5000, salaryPeriod: null })).toBe(
      "CAD 5k"
    );
  });

  it("maps EUR, GBP and BRL symbols", () => {
    expect(formatSalary({ ...base, currency: "EUR", salaryMin: 40, salaryPeriod: "HOURLY" })).toBe(
      "€40/hr"
    );
    expect(formatSalary({ ...base, currency: "gbp", salaryMin: 40, salaryPeriod: "HOURLY" })).toBe(
      "£40/hr"
    );
    expect(formatSalary({ ...base, currency: "BRL", salaryMin: 40, salaryPeriod: "HOURLY" })).toBe(
      "R$40/hr"
    );
  });

  it("shows a single value when only max or equal bounds", () => {
    expect(formatSalary({ ...base, salaryMax: 8000, salaryPeriod: "MONTHLY" })).toBe("US$8k/mo");
    expect(
      formatSalary({ ...base, salaryMin: 8000, salaryMax: 8000, salaryPeriod: "MONTHLY" })
    ).toBe("US$8k/mo");
  });

  it("trims sub-1000 decimals to two places", () => {
    expect(formatSalary({ ...base, salaryMin: 35.5, salaryPeriod: "HOURLY" })).toBe("US$35.5/hr");
    expect(formatSalary({ ...base, salaryMin: 35.456, salaryPeriod: "HOURLY" })).toBe(
      "US$35.46/hr"
    );
  });

  it("returns null when there is no usable salary", () => {
    expect(formatSalary(base)).toBeNull();
    expect(formatSalary({ ...base, salaryMin: 0, salaryMax: 0, salaryPeriod: "HOURLY" })).toBeNull();
    expect(formatSalary({ ...base, salaryMin: NaN })).toBeNull();
  });

  it("omits the currency prefix when currency is missing", () => {
    expect(formatSalary({ ...base, currency: null, salaryMin: 5000, salaryPeriod: null })).toBe(
      "5k"
    );
  });
});

describe("formatMoney", () => {
  it("defaults to full mode", () => {
    expect(formatMoney(60000, "USD")).toBe("US$60,000");
  });
  it("supports compact mode", () => {
    expect(formatMoney(60000, "USD", "compact")).toBe("US$60k");
  });
});
