/**
 * Demo cover photos for seeded venues, so the Coordinator's venue catalogue
 * shows real images instead of placeholders. Hotlinked from Unsplash (free to
 * use under the Unsplash License); nothing is uploaded to Supabase Storage.
 */
const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;

const AUDITORIUM = [
  unsplash('1587825140708-dfaf72ae4b04'),
  unsplash('1505373877841-8d25f7d46678'),
  unsplash('1540575467063-178a50c2df87'),
];
const MEETING_ROOM = [
  unsplash('1431540015161-0bf868a2d407'),
  unsplash('1517502884422-41eaead166d4'),
  unsplash('1497366811353-6870744d04b2'),
  unsplash('1524758631624-e2822e304c36'),
];
const BANQUET = [
  unsplash('1519167758481-83f550bb49b3'),
  unsplash('1511578314322-379afb476865'),
];
const OUTDOOR = [
  unsplash('1562774053-701939374585'),
  unsplash('1464366400600-7168b8af9bc3'),
];

const BY_KEYWORD: [RegExp, string[]][] = [
  [/auditorium|theatre|theater|lecture|hall/i, AUDITORIUM],
  [/gala|banquet|function|ballroom/i, BANQUET],
  [/garden|green|terrace|lawn|outdoor|courtyard/i, OUTDOOR],
  [/seminar|meeting|room|studio|board/i, MEETING_ROOM],
];
const ALL = [...AUDITORIUM, ...MEETING_ROOM, ...BANQUET, ...OUTDOOR];

/**
 * Photos for a venue, chosen from its name: two from the matching set (cover
 * first), varied by `index` so neighbouring venues don't all share one cover.
 */
export function photosForVenue(name: string, index: number): string[] {
  const set = BY_KEYWORD.find(([pattern]) => pattern.test(name))?.[1] ?? ALL;
  return [set[index % set.length], set[(index + 1) % set.length]];
}
