import { describe, expect, it } from 'vitest';
import { ageOn, campaignDate, startOfCampaignDay } from './campaignDay';

describe('campaignDate', () => {
  it('is the Santo Domingo date, not the UTC one', () => {
    // 02:30 UTC on 1 March is still 22:30 on 28 February in Higüey.
    expect(campaignDate(new Date('2026-03-01T02:30:00Z'))).toBe('2026-02-28');
    expect(campaignDate(new Date('2026-03-01T04:00:00Z'))).toBe('2026-03-01');
  });
});

describe('startOfCampaignDay', () => {
  it('is local midnight, 04:00 UTC', () => {
    expect(startOfCampaignDay(new Date('2026-09-28T15:00:00Z')).toISOString()).toBe(
      '2026-09-28T04:00:00.000Z',
    );
  });

  it('belongs to the previous UTC date late in the local evening', () => {
    expect(startOfCampaignDay(new Date('2026-09-29T03:59:59Z')).toISOString()).toBe(
      '2026-09-28T04:00:00.000Z',
    );
  });
});

describe('ageOn', () => {
  it('counts a year only once the birthday arrives', () => {
    expect(ageOn('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageOn('1990-06-15', '2026-06-15')).toBe(36);
    expect(ageOn('1990-06-15', '2026-12-01')).toBe(36);
  });

  it('handles birthdays earlier in the year and voters over 100', () => {
    expect(ageOn('1920-01-01', '2026-01-01')).toBe(106);
    expect(ageOn('2008-02-10', '2026-01-31')).toBe(17);
  });

  it('treats a 29 February birthday as reached on 1 March in common years', () => {
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
    expect(ageOn('2000-02-29', '2026-03-01')).toBe(26);
  });
});
