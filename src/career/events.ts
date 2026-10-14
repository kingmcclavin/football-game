import type { CareerEvent } from '../core/types';
import { Rng } from '../core/rng';

const EVENTS: CareerEvent[] = [
  {
    id: 'extra_film', title: 'Late Night Film Session',
    body: 'Your position coach offers to break down next week\'s opponent with you after hours. It means less sleep before practice.',
    choices: [
      { label: 'Stay late and study', detail: '+150 XP, +3 coach trust, +10 fatigue', effects: { xp: 150, trust: 3, fatigue: 10 } },
      { label: 'Go home and rest', detail: '-10 fatigue', effects: { fatigue: -10 } },
    ],
  },
  {
    id: 'media', title: 'Media Request',
    body: 'A national sports show wants a sit-down interview this week. Your agent loves it; your coach would rather you stay focused.',
    choices: [
      { label: 'Do the interview', detail: '+4 reputation, -2 coach trust', effects: { rep: 4, trust: -2 } },
      { label: 'Decline politely', detail: '+2 coach trust', effects: { trust: 2 } },
    ],
  },
  {
    id: 'weak_spot', title: 'Fix a Weakness?',
    body: 'The strength staff thinks a focused week could shore up a weak spot in your game.',
    choices: [
      { label: 'Work on strength', detail: '+1 Strength, +8 fatigue', effects: { attr: { attr: 'str', delta: 1 }, fatigue: 8 } },
      { label: 'Sharpen awareness', detail: '+1 Awareness, +8 fatigue', effects: { attr: { attr: 'awr', delta: 1 }, fatigue: 8 } },
      { label: 'Skip it', detail: 'No change', effects: {} },
    ],
  },
  {
    id: 'vet_mentor', title: 'Veteran Mentor',
    body: 'A respected veteran offers to take you under his wing. He expects you to carry his pads and buy breakfast for the position group.',
    choices: [
      { label: 'Accept the mentorship', detail: '+250 XP, +2 trust', effects: { xp: 250, trust: 2 } },
      { label: 'Go your own way', detail: '+2 reputation', effects: { rep: 2 } },
    ],
  },
  {
    id: 'sore', title: 'Sore Hamstring',
    body: 'You tweaked something in practice. The trainers recommend taking it easy, but the coaches want to see you on the field.',
    choices: [
      { label: 'Rest and recover', detail: '-25 fatigue, -2 trust', effects: { fatigue: -25, trust: -2 } },
      { label: 'Practice through it', detail: '+3 trust, +15 fatigue', effects: { trust: 3, fatigue: 15 } },
    ],
  },
  {
    id: 'stat_vs_team', title: 'Chasing a Milestone',
    body: 'You are close to a personal milestone. Teammates say you should be more selfish; the coordinator wants you to run the system.',
    choices: [
      { label: 'Focus on the team plan', detail: '+4 coach trust', effects: { trust: 4 } },
      { label: 'Chase the milestone', detail: '+200 XP, +3 reputation, -3 trust', effects: { xp: 200, rep: 3, trust: -3 } },
    ],
  },
  {
    id: 'community', title: 'Community Event',
    body: 'The team is hosting a youth football camp on your off day.',
    choices: [
      { label: 'Coach the kids', detail: '+5 reputation, +5 fatigue', effects: { rep: 5, fatigue: 5 } },
      { label: 'Use the day to recover', detail: '-12 fatigue', effects: { fatigue: -12 } },
    ],
  },
  {
    id: 'playbook', title: 'Install Week',
    body: 'The coordinator is installing new concepts. You can volunteer for extra reps in walk-throughs.',
    choices: [
      { label: 'Volunteer for extra reps', detail: '+180 XP, +2 trust, +8 fatigue', effects: { xp: 180, trust: 2, fatigue: 8 } },
      { label: 'Stick to the normal schedule', detail: 'No change', effects: {} },
    ],
  },
];

export function rollEvent(rng: Rng, seen: string[]): CareerEvent | undefined {
  if (!rng.chance(0.22)) return undefined;
  const fresh = EVENTS.filter((e) => !seen.slice(-4).includes(e.id));
  return fresh.length ? rng.pick(fresh) : undefined;
}
