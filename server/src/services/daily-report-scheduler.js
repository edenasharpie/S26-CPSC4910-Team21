import { generateReport } from './report-service.js';
import {
  getAllSponsorCompanyIds,
  upsertGeneratedReport,
} from '../utils/queries.js';

const DAILY_REPORT_TYPES = ['driver-applications', 'point-transactions', 'orders'];

let dailyReportInterval = null;
let startupTimeout = null;
let isDailyRunInProgress = false;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toLocalSqlDateTime(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function toLocalDateOnly(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getPreviousDayWindow(baseDate = new Date()) {
  const previousDayStart = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() - 1,
    0,
    0,
    0,
    0
  );

  const previousDayEnd = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() - 1,
    23,
    59,
    59,
    999
  );

  return {
    reportDate: toLocalDateOnly(previousDayStart),
    startDate: toLocalSqlDateTime(previousDayStart),
    endDate: toLocalSqlDateTime(previousDayEnd),
  };
}

export async function runDailySponsorReportGeneration(runTimestamp = new Date()) {
  if (isDailyRunInProgress) {
    console.warn('[daily-reports] Previous run is still in progress; skipping this tick.');
    return;
  }

  isDailyRunInProgress = true;

  const schedulerRunAt = toLocalSqlDateTime(runTimestamp);
  const { reportDate, startDate, endDate } = getPreviousDayWindow(runTimestamp);

  let successCount = 0;
  let failureCount = 0;

  try {
    const sponsorCompanyIds = await getAllSponsorCompanyIds();

    for (const sponsorCompanyId of sponsorCompanyIds) {
      for (const reportType of DAILY_REPORT_TYPES) {
        try {
          const reportPayload = await generateReport(
            reportType,
            {
              startDate,
              endDate,
              includeDetails: true,
            },
            {
              role: 'sponsor',
              sponsorCompanyId,
            }
          );

          await upsertGeneratedReport({
            sponsorCompanyId,
            reportType,
            reportDate,
            generatedAt: schedulerRunAt,
            schedulerRunAt,
            generationStatus: 'success',
            generationError: null,
            reportPayload,
          });

          successCount += 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown daily report generation error';

          await upsertGeneratedReport({
            sponsorCompanyId,
            reportType,
            reportDate,
            generatedAt: schedulerRunAt,
            schedulerRunAt,
            generationStatus: 'failed',
            generationError: errorMessage.slice(0, 1000),
            reportPayload: null,
          });

          failureCount += 1;
          console.error(
            `[daily-reports] Failed report type=${reportType} sponsorCompanyId=${sponsorCompanyId} reportDate=${reportDate}:`,
            error
          );
        }
      }
    }

    console.log(
      `[daily-reports] Completed run for reportDate=${reportDate}. Success=${successCount}, Failed=${failureCount}`
    );
  } catch (error) {
    console.error('[daily-reports] Fatal scheduler run error:', error);
  } finally {
    isDailyRunInProgress = false;
  }
}

function getDelayUntilNextMidnight(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime() - now.getTime();
}

export function startDailyReportScheduler() {
  if (dailyReportInterval || startupTimeout) {
    return;
  }

  const delayMs = getDelayUntilNextMidnight();
  console.log(`[daily-reports] Scheduler armed. First run in ${Math.round(delayMs / 1000)}s at next server midnight.`);

  startupTimeout = setTimeout(async () => {
    await runDailySponsorReportGeneration(new Date());

    dailyReportInterval = setInterval(async () => {
      await runDailySponsorReportGeneration(new Date());
    }, 24 * 60 * 60 * 1000);
  }, delayMs);
}

export function stopDailyReportScheduler() {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }

  if (dailyReportInterval) {
    clearInterval(dailyReportInterval);
    dailyReportInterval = null;
  }

  isDailyRunInProgress = false;
}
