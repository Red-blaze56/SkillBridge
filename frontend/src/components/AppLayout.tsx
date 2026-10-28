import { Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/AppSidebar'
import { Logo } from '@/components/Logo'
import { ServerStatusBadge } from '@/components/ServerStatusBadge'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { UserMenu } from '@/components/UserMenu'

// Frame for every page that shows the sidebar: header on top, sidebar on the
// left, the page itself in <Outlet />.
export function AppLayout() {
  return (
    <SidebarProvider className="flex-col bg-muted/40" style={{ '--header-height': '4rem' } as React.CSSProperties}>
      <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-3 border-b bg-background px-4">
        <SidebarTrigger aria-label="Toggle sidebar" />
        <Logo compact />
        <div className="ml-auto flex items-center gap-3">
          <ServerStatusBadge />
          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset className="bg-transparent">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
