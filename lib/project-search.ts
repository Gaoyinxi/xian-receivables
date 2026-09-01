import type { ProjectRecord } from './types';

// Only search the server-authorized snapshot; never fetch a second unscoped list.
export function searchProjects(
  projects: ProjectRecord[],
  query: string,
): ProjectRecord[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return projects.filter((project) => {
    const text = [
      project.name,
      project.projectCode,
      project.contractCode,
      project.customerName,
      project.districtName,
    ]
      .join(' ')
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
