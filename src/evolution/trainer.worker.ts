/// <reference lib="webworker" />
import { Trainer, type TrainingConfig, type Checkpoint } from "./trainer";
export type WorkerCommand = {
  type: "init";
  config: TrainingConfig;
  checkpoint?: Checkpoint;
};
type Message = {
  data:
    | WorkerCommand
    | { type: "run"; generations?: number }
    | { type: "pause" | "step" | "export" }
    | { type: "speed"; value: "1x" | "10x" | "max" };
};
let trainer: Trainer | undefined,
  running = false,
  target = Infinity,
  busy = false,
  speed = "max";
const send = (message: unknown) => self.postMessage(message);
async function pump() {
  if (busy || !trainer) return;
  busy = true;
  try {
    while (running) {
      const result = trainer.batch(2);
      send({
        type: "progress",
        progress: result.progress,
        generation: trainer.generation + 1,
      });
      if (result.record) {
        send({
          type: "generation",
          record: result.record,
          checkpoint: trainer.checkpoint(),
        });
        if (trainer.generation >= target) {
          running = false;
        }
      }
      await new Promise((resolve) =>
        setTimeout(resolve, speed === "1x" ? 25 : speed === "10x" ? 2 : 0),
      );
    }
    send({ type: "paused" });
  } catch (error) {
    running = false;
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
  }
}
self.onmessage = ({ data }: Message) => {
  if (data.type === "init") {
    trainer = data.checkpoint
      ? Trainer.restore(data.checkpoint)
      : new Trainer(data.config);
    send({ type: "ready", checkpoint: trainer.checkpoint() });
  } else if (data.type === "run") {
    running = true;
    target =
      data.generations &&
      Number.isInteger(data.generations) &&
      data.generations > 0
        ? (trainer?.generation ?? 0) + data.generations
        : Infinity;
    void pump();
  } else if (data.type === "pause") {
    running = false;
  } else if (data.type === "step") {
    target = (trainer?.generation ?? 0) + 1;
    running = true;
    void pump();
  } else if (data.type === "speed") speed = data.value;
  else if (data.type === "export" && trainer) {
    try {
      send({ type: "checkpoint", checkpoint: trainer.checkpoint() });
    } catch {
      send({
        type: "error",
        message: "Pause at a completed generation before exporting.",
      });
    }
  }
};
