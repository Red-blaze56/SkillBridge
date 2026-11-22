import { FileText, LayoutDashboard } from 'lucide-react';

type NavIcon = typeof LayoutDashboard;

export interface NavItem {
  label: string;
  to: string;
  icon: NavIcon;
  active: boolean;
}

/** Sections the API can serve today. Everything else is listed as upcoming. */
export function buildNav(pathname: string): NavItem[] {
  return [
    { label: 'Overview', to: '/', icon: LayoutDashboard, active: pathname === '/' },
    { label: 'Resume', to: '/resume', icon: FileText, active: pathname === '/resume' },
  ];
}

/** Planned sections, shown so the shape of the product is visible without dead links. */
export const upcoming = ['Readiness score', 'Skill gaps', 'Job matches', 'Learning roadmap'];

export function breadcrumbFor(pathname: string) {
  if (pathname === '/resume') return 'Resume';
  return 'Overview';
}
