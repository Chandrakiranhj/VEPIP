export interface FiscalYearWindow {
  fiscalYear: string;
  label: string;
  startDate: string;
  endDate: string;
}

const DAY_MS = 86_400_000;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function fiscalYearForDate(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${pad2(startYear % 100)}-${pad2((startYear + 1) % 100)}`;
}

export function fiscalYearStartDate(fiscalYear: string): Date {
  const start = parseInt(fiscalYear.split("-")[0] ?? "", 10);
  const startYear = start < 100 ? 2000 + start : start;
  return new Date(Date.UTC(startYear, 3, 1));
}

export function fiscalYearEndDate(fiscalYear: string): Date {
  const start = fiscalYearStartDate(fiscalYear);
  return new Date(Date.UTC(start.getUTCFullYear() + 1, 2, 31, 23, 59, 59, 999));
}

export function fiscalYearLabel(fiscalYear: string) {
  const [a, b] = fiscalYear.split("-");
  return `FY 20${a}-${b}`;
}

export function fiscalYearWindow(fiscalYear: string): FiscalYearWindow {
  const start = fiscalYearStartDate(fiscalYear);
  const end = fiscalYearEndDate(fiscalYear);
  return {
    fiscalYear,
    label: fiscalYearLabel(fiscalYear),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function enumerateFiscalYears(startDate?: string | null, endDate?: string | null): FiscalYearWindow[] {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const out: FiscalYearWindow[] = [];
  let fy = fiscalYearForDate(start);
  while (fy) {
    out.push(fiscalYearWindow(fy));
    if (fiscalYearEndDate(fy) >= end) break;
    const nextYear = parseInt(fy.split("-")[0] ?? "", 10) + 1;
    fy = `${pad2(nextYear % 100)}-${pad2((nextYear + 1) % 100)}`;
    if (out.length > 40) break;
  }
  return out;
}

export function inclusiveDayOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

export function prorateAmountByFiscalYear(
  amount: number,
  startDate?: string | null,
  endDate?: string | null,
) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const totalDays = inclusiveDayOverlap(start, end, start, end);
  if (totalDays <= 0 || !amount) return [];

  return enumerateFiscalYears(startDate, endDate)
    .map((window) => {
      const overlapDays = inclusiveDayOverlap(
        start,
        end,
        fiscalYearStartDate(window.fiscalYear),
        fiscalYearEndDate(window.fiscalYear),
      );
      const fraction = overlapDays / totalDays;
      return {
        ...window,
        days: overlapDays,
        fraction,
        amount: Math.round(amount * fraction),
      };
    })
    .filter((row) => row.days > 0);
}
