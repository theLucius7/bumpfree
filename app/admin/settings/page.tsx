import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { ImportInterfaceSettings } from "@/components/admin/ImportInterfaceSettings";
import { getAllImportInterfaces } from "@/lib/actions/import-interfaces";
import { getManualScheduleSubmissions } from "@/lib/actions/manual-submissions";

export default async function AdminSettingsPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profile?.role !== "superadmin") redirect("/dashboard");

    const [importInterfaces, manualSubmissions] = await Promise.all([
        getAllImportInterfaces(),
        getManualScheduleSubmissions(),
    ]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">全站配置</h1>
                <p className="text-muted-foreground text-sm mt-1">网站参数、系统信息、课表导入接口开关和人工处理队列</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        系统信息
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                    <InfoItem label="当前版本" value="v1.0.0" />
                    <InfoItem label="默认 Room 额度" value="3 个 / 用户" />
                    <InfoItem label="新用户角色" value="user" />
                </CardContent>
            </Card>

            <ImportInterfaceSettings interfaces={importInterfaces} manualSubmissions={manualSubmissions} />
        </div>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Badge variant="outline">{value}</Badge>
        </div>
    );
}
