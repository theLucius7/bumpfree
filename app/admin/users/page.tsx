import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { getAllUsers, getGlobalStats } from "@/lib/actions/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Users, DoorOpen } from "lucide-react";
import { PageWrapper } from "@/components/motion/PageWrapper";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const [users, stats] = await Promise.all([getAllUsers(), getGlobalStats()]);

    return (
        <PageWrapper className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">用户管理</h1>
                <p className="text-muted-foreground text-sm mt-1">管理所有用户账号、权限和配额</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Card>
                    <CardContent className="pt-5">
                        <div className="flex items-center gap-3">
                            <Users className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold">{stats.userCount}</p>
                                <p className="text-xs text-muted-foreground">注册用户</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <div className="flex items-center gap-3">
                            <DoorOpen className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold">{stats.roomCount}</p>
                                <p className="text-xs text-muted-foreground">创建的 Room</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <AdminUsersClient users={users} currentUserId={user.id} />
        </PageWrapper>
    );
}
