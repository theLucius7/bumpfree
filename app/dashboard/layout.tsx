import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/lib/actions/auth";
import {
    Zap,
    LayoutDashboard,
    User,
    DoorOpen,
    Mail,
    LogOut,
    Shield,
    Settings,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, profile } = await getCurrentUserProfile();

    if (!user) redirect("/auth/login");

    const isSuperAdmin = profile?.role === "superadmin";

    const navLinks = [
        { href: "/dashboard", label: "概览", icon: LayoutDashboard },
        { href: "/dashboard/profile", label: "我的课表", icon: User },
        { href: "/dashboard/rooms", label: "我的 Room", icon: DoorOpen },
        { href: "/dashboard/invitations", label: "邀请通知", icon: Mail },
        { href: "/dashboard/settings", label: "账号设置", icon: Settings },
    ];

    return (
        <div className="flex min-h-screen bg-background">
            <aside className="hidden md:flex w-60 flex-col border-r border-border/60 p-4">
                <div className="flex items-center gap-2 px-2 py-3 mb-4">
                    <Zap className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-lg">BumpFree</span>
                </div>

                <nav className="flex-1 space-y-1">
                    {navLinks.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </Link>
                    ))}

                    {isSuperAdmin && (
                        <>
                            <Separator className="my-2" />
                            <Link
                                href="/admin/users"
                                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                                <Shield className="w-4 h-4" />
                                管理后台
                            </Link>
                        </>
                    )}
                </nav>

                <div className="mt-auto space-y-2">
                    <div className="px-3 py-2">
                        <p className="text-xs text-muted-foreground truncate">{profile?.display_name ?? user.email}</p>
                        {isSuperAdmin && (
                            <p className="text-xs text-primary font-medium">管理员</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <form action={logoutAction} className="flex-1">
                            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                                <LogOut className="w-4 h-4" />
                                退出
                            </Button>
                        </form>
                    </div>
                </div>
            </aside>

            <div className="flex flex-col flex-1 min-w-0">
                <header className="md:hidden border-b border-border/60 px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-primary" />
                        <span className="font-semibold">BumpFree</span>
                    </div>
                    <ThemeToggle />
                </header>

                <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>

                <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border/60 bg-background px-2 py-2 flex justify-around">
                    {navLinks.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex flex-col items-center gap-1 p-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Icon className="w-5 h-5" />
                            <span>{label}</span>
                        </Link>
                    ))}
                </nav>
            </div>
        </div>
    );
}
