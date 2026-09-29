/**
 * Calendar days as the campaign lives them: in Higüey (America/Santo_Domingo), whatever time zone
 * the server runs in (Render runs in UTC). Dates are "YYYY-MM-DD" strings, like voters' birth dates.
 */

export const CAMPAIGN_TIME_ZONE = 'America/Santo_Domingo';

/** The Dominican Republic keeps UTC−4 all year (no daylight saving time). */
const CAMPAIGN_UTC_OFFSET = '-04:00';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAMPAIGN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The campaign's calendar date at `instant`, "YYYY-MM-DD". */
export function campaignDate(instant: Date): string {
  return dayFormat.format(instant);
}

/** The instant the campaign day containing `instant` began (local midnight). */
export function startOfCampaignDay(instant: Date): Date {
  return new Date(`${campaignDate(instant)}T00:00:00${CAMPAIGN_UTC_OFFSET}`);
}

function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year ?? 0, month ?? 0, day ?? 0];
}

/** Completed years between `birthDate` and `today` (both "YYYY-MM-DD"). Plain arithmetic: no Date. */
export function ageOn(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = dateParts(birthDate);
  const [year, month, day] = dateParts(today);
  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}
