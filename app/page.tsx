import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, DoorOpen, Github, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/40 sticky top-0 z-50 bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <Zap className="w-5 h-5 text-primary" />
            BumpFree
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm">登录</Button>
            </Link>
            <Link href="/auth/register">
              <Button size="sm">免费注册</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-6 gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              课表聚合 · 共同空闲 · Room 协作
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              把多人课表放到一起，快速找到共同空闲时间
            </h1>
            <p className="text-lg text-muted-foreground mt-6 leading-relaxed">
              导入课表，创建 Room，邀请成员加入。BumpFree 会把不同成员的课程和临时 busy 时间聚合到同一个日历里，减少反复询问和手工对时间。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link href="/auth/register">
                <Button size="lg" className="w-full sm:w-auto gap-2">
                  <DoorOpen className="w-4 h-4" />
                  创建 Room
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  登录已有账号
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-border/40 bg-muted/25">
          <div className="max-w-6xl mx-auto px-4 py-16 grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={<CalendarDays className="w-5 h-5" />}
              title="多格式课表导入"
              desc="支持厦马 HTML 课表、BumpFree v1 文本、手机粘贴文本和 AI 整理后的课程数据。"
            />
            <FeatureCard
              icon={<Users className="w-5 h-5" />}
              title="按人分色"
              desc="每个成员使用稳定颜色显示，日历上可以快速区分课程归属。"
            />
            <FeatureCard
              icon={<ShieldCheck className="w-5 h-5" />}
              title="Room 内可见"
              desc="私密 Room 只对成员开放，公开 Room 支持只读查看。"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-4">
        <span>© 2026 BumpFree</span>
        <a href="https://github.com/theLucius7/bumpfree" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          <Github className="w-4 h-4" /> GitHub
        </a>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-5">
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h2 className="font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
