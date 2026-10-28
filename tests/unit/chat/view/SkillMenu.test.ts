import { filterSkills } from '@/chat/view/SkillMenu';

describe('filterSkills', () => {
  const skills = [
    { name: 'review-plan', description: 'Check a plan.' },
    { name: 'plan', description: 'Write a plan.' },
    { name: 'zebra', description: 'Answer with a fixed word.' },
    { name: 'simplify', description: 'Plan cleanups.' },
  ];

  it('ranks names that start with the query, then names that contain it, then descriptions', () => {
    expect(filterSkills(skills, 'plan').map((skill) => skill.name)).toEqual(['plan', 'review-plan', 'simplify']);
  });

  it('lists every skill alphabetically for an empty query', () => {
    expect(filterSkills(skills, '').map((skill) => skill.name)).toEqual(['plan', 'review-plan', 'simplify', 'zebra']);
  });

  it('matches regardless of case', () => {
    expect(filterSkills(skills, 'ZEB').map((skill) => skill.name)).toEqual(['zebra']);
  });
});

