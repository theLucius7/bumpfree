"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteCourse } from "@/lib/actions/courses";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface DeleteCourseButtonProps {
    courseId: string;
    courseName: string;
}

export function DeleteCourseButton({ courseId, courseName }: DeleteCourseButtonProps) {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    function handleDelete() {
        startTransition(async () => {
            const result = await deleteCourse(courseId);
            if (result.error) {
                toast.error(result.error);
                return;
            }

            toast.success(`课程 ${courseName} 已删除`);
            setOpen(false);
            router.refresh();
        });
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                        确认删除课程？
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        您正在删除 <strong>{courseName}</strong>。这个操作不可撤销。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.preventDefault();
                            handleDelete();
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isPending}
                    >
                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        确认删除
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
