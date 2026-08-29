import type { ParsedTextSchedule } from "@/lib/utils/textSchedule";
import { genericTextAdapter } from "./generic";
import { manualReviewAdapter } from "./manualReview";
import { swpuPdfAdapter } from "./swpuPdf";
import type { ScheduleAdapter } from "./types";
import { xmuHtmlAdapter } from "./xmuHtml";

class ScheduleAdapterRegistry {
    private readonly adapters = new Map<string, ScheduleAdapter>();

    register(adapter: ScheduleAdapter) {
        if (this.adapters.has(adapter.key)) {
            throw new Error(`Duplicate schedule adapter: ${adapter.key}`);
        }
        this.adapters.set(adapter.key, adapter);
    }

    get(key: string) {
        return this.adapters.get(key);
    }

    getAll() {
        return [...this.adapters.values()].sort((a, b) => a.config.sortOrder - b.config.sortOrder);
    }

    parse(key: string, input: string): ParsedTextSchedule {
        const adapter = this.get(key);
        if (!adapter) throw new Error(`不支持的导入接口：${key}`);
        return adapter.parse(input);
    }
}

export const scheduleAdapterRegistry = new ScheduleAdapterRegistry();

scheduleAdapterRegistry.register(genericTextAdapter);
scheduleAdapterRegistry.register(manualReviewAdapter);
scheduleAdapterRegistry.register(xmuHtmlAdapter);
scheduleAdapterRegistry.register(swpuPdfAdapter);

export function getDefaultImportInterfaceConfigs() {
    return scheduleAdapterRegistry.getAll().map((adapter) => adapter.config);
}

export type { CustomImportInterfaceMeta, ScheduleAdapter, ScheduleAdapterConfig, ScheduleAdapterFeatures, ImportInterfaceCategory } from "./types";
