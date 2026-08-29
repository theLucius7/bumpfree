"use client";

import { motion } from "framer-motion";
import { springSmooth } from "@/lib/animations";

export function FloatingHeroElements() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
            {/* Mesh Gradient Blobs */}
            <motion.div
                className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] mix-blend-multiply dark:mix-blend-screen opacity-50"
                animate={{
                    x: ["0%", "20%", "0%"],
                    y: ["0%", "30%", "0%"],
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
            <motion.div
                className="absolute top-[20%] right-[-5%] w-[35vw] h-[35vw] rounded-full bg-indigo-500/20 blur-[100px] mix-blend-multiply dark:mix-blend-screen opacity-50"
                animate={{
                    x: ["0%", "-20%", "0%"],
                    y: ["0%", "10%", "0%"],
                }}
                transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2
                }}
            />

            {/* Floating Glass Cubes (Abstract Time Blocks) */}

            {/* Cube 1 */}
            <motion.div
                className="absolute top-[15%] left-[10%] lg:left-[20%] w-24 h-24 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md shadow-xl flex items-center justify-center dark:bg-zinc-900/30 dark:border-zinc-800/50"
                initial={{ y: 50, opacity: 0, rotate: -10 }}
                animate={{ y: [0, -20, 0], opacity: 1, rotate: [-10, -5, -10] }}
                transition={{
                    y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                    opacity: { duration: 1 },
                    rotate: { duration: 8, repeat: Infinity, ease: "easeInOut" }
                }}
            >
                <div className="w-1/2 h-2/3 rounded-md bg-gradient-to-br from-indigo-400/80 to-indigo-600/80" />
            </motion.div>

            {/* Cube 2 */}
            <motion.div
                className="absolute top-[40%] right-[10%] lg:right-[15%] w-32 h-32 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md shadow-xl flex items-center justify-center dark:bg-zinc-900/30 dark:border-zinc-800/50"
                initial={{ y: 50, opacity: 0, rotate: 15, scale: 0.8 }}
                animate={{ y: [0, 25, 0], opacity: 1, rotate: [15, 20, 15], scale: 1 }}
                transition={{
                    y: { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 },
                    opacity: { duration: 1, delay: 0.2 },
                    rotate: { duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 },
                    scale: { ...springSmooth, delay: 0.2 }
                }}
            >
                <div className="flex flex-col gap-2 w-2/3">
                    <div className="h-3 w-full rounded-full bg-primary/40" />
                    <div className="h-3 w-4/5 rounded-full bg-primary/60" />
                    <div className="h-3 w-1/2 rounded-full bg-primary/80" />
                </div>
            </motion.div>

        </div>
    );
}
