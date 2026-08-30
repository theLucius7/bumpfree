"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ExternalLink,
  Users,
  UserPlus,
  Loader2,
  Globe,
  Lock,
  Search,
  Copy,
  Check,
  Pencil,
} from "lucide-react";
import { searchUsers, inviteUserToRoom, updateRoom } from "@/lib/actions/rooms";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface RoomManageCardProps {
  room: {
    id: string;
    name: string;
    description: string | null;
    is_public: boolean;
    expires_at: string | null;
    created_at: string;
    room_members: { count: number }[];
  };
}

export function RoomManageCard({ room }: RoomManageCardProps) {
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; display_name: string | null }[]
  >([]);
  const [roomName, setRoomName] = useState(room.name);
  const [roomDescription, setRoomDescription] = useState(
    room.description ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const [isPublicToggling, startPublicTransition] = useTransition();
  const [isSearching, startSearchTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const searchRequestId = useRef(0);
  const router = useRouter();

  const memberCount = room.room_members?.[0]?.count ?? 0;

  function copyLink() {
    navigator.clipboard.writeText(
      `${window.location.origin}/room/?id=${room.id}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("链接已复制");
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    const requestId = ++searchRequestId.current;
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    startSearchTransition(async () => {
      const results = await searchUsers(q);
      if (requestId === searchRequestId.current) setSearchResults(results);
    });
  }

  function handleInvite(inviteeId: string, name: string) {
    startTransition(async () => {
      const result = await inviteUserToRoom(room.id, inviteeId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`已向 ${name} 发送邀请`);
        setInviteOpen(false);
        setSearchQuery("");
        setSearchResults([]);
        router.refresh();
      }
    });
  }

  function handleSaveRoom() {
    startSaveTransition(async () => {
      const result = await updateRoom(room.id, {
        name: roomName,
        description: roomDescription,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Room 信息已更新");
      setEditOpen(false);
      router.refresh();
    });
  }

  function togglePublic() {
    startPublicTransition(async () => {
      const result = await updateRoom(room.id, { isPublic: !room.is_public });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(room.is_public ? "已关闭公开访问" : "已开启公开只读访问");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{room.name}</CardTitle>
            {room.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                {room.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {room.is_public ? (
              <Badge variant="secondary" className="text-xs gap-1">
                <Globe className="w-3 h-3" />
                公开
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1">
                <Lock className="w-3 h-3" />
                私密
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>{memberCount} 名成员</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/room/?id=${room.id}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              查看日历
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={copyLink}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            复制链接
          </Button>

          <Dialog
            open={editOpen}
            onOpenChange={(open) => {
              setEditOpen(open);
              if (open) {
                setRoomName(room.name);
                setRoomDescription(room.description ?? "");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                修改 Room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>编辑 Room 信息</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Room 名称</label>
                  <Input
                    value={roomName}
                    maxLength={100}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="输入新的 Room 名称"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">描述</label>
                  <Input
                    value={roomDescription}
                    maxLength={500}
                    onChange={(e) => setRoomDescription(e.target.value)}
                    placeholder="可选描述"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSaveRoom}
                  disabled={isSaving || !roomName.trim()}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "保存"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={inviteOpen}
            onOpenChange={(open) => {
              setInviteOpen(open);
              if (!open) {
                searchRequestId.current += 1;
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                邀请成员
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>邀请成员加入 {room.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <p className="text-xs text-muted-foreground">
                  输入至少 2 个字符搜索；对方确认邀请后才会加入 Room。
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="输入至少 2 个字符搜索昵称..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
                {isSearching && (
                  <p className="text-sm text-muted-foreground text-center">
                    搜索中...
                  </p>
                )}
                {searchResults.length > 0 && (
                  <div className="border border-border rounded-md divide-y divide-border max-h-60 overflow-y-auto">
                    {searchResults.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between px-3 py-2.5"
                      >
                        <span className="text-sm">{u.display_name}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            handleInvite(u.id, u.display_name ?? "该用户")
                          }
                        >
                          {isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "邀请"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {!isSearching && searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    {searchQuery.trim().length >= 2
                      ? "没有找到用户"
                      : "请输入至少 2 个字符"}
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={togglePublic}
            disabled={isPublicToggling}
          >
            {isPublicToggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : room.is_public ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            {room.is_public ? "关闭公开" : "开启公开"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
