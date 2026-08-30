import { parseIcs, type IcsOptions } from "./ics";
self.onmessage = (
  event: MessageEvent<{ text: string; options: IcsOptions }>,
) => {
  try {
    self.postMessage({ data: parseIcs(event.data.text, event.data.options) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "ICS解析失败",
    });
  }
};
