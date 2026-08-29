import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Shield, Users, Settings, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/actions/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, display_name")
        .eq("id", user.id)
        .single();

    if (profile?.role !== "superadmin") redirect("/dashboard");

    const navItems = [
        { href: "/admin/users", label: "用户管理", icon: Users },
        { href: "/admin/settings", label: "全站配置", icon: Settings },
    ];

    return (
        <div className="flex min-h-screen bg-background">
            <aside className="hidden md:flex w-60 flex-col border-r border-border/60 p-4">
                <div className="flex items-center gap-2 px-2 py-3 mb-2">
                    <Zap className="w-5 h-5 text-primary" />
                    <span className="font-semibold">BumpFree</span>
                </div>
                <div className="flex items-center gap-2 px-2 mb-4">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-primary font-medium">管理后台</span>
                </div>
                <Separator className="mb-4" />
                <nav className="flex-1 space-y-1">
                    {navItems.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </Link>
                    ))}
                </nav>
                <div className="mt-auto space-y-2">
                    <Link href="/dashboard">
                        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                            返回 Dashboard
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <form action={logoutAction} className="flex-1">
                            <Button type="submit" variant="ghost" size="sm" className="w-full text-muted-foreground">
                                退出
                            </Button>
                        </form>
                    </div>
                </div>
            </aside>
            <main className="flex-1 p-6">{children}</main>
        </div>
    );
}
