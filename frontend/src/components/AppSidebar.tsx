import { History, PlusCircle, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean // match only this exact path ("/" would otherwise match everything)
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'New Session', icon: PlusCircle, end: true },
  { to: '/history', label: 'History', icon: History },
]

// The active item gets a soft tint and bold text, no colour.
const ACTIVE = 'data-active:bg-sidebar-accent data-active:font-semibold'

export function AppSidebar() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()

  return (
    // Sits below the header (see --header-height in AppLayout), not over it.
    <Sidebar variant="floating" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map(({ to, label, icon: Icon, end }) => {
                const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={active}
                      className={ACTIVE}
                      // On phones the sidebar is a drawer: close it once a page is picked.
                      render={<Link to={to} aria-current={active ? 'page' : undefined} onClick={() => setOpenMobile(false)} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
