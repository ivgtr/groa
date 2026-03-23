import type { Session } from "@groa/types";
import type { StepEvent } from "@groa/pipeline";
import { createProgressDisplay } from "../progress-display.js";

/**
 * セッション結果をコンソールに表示する。
 */
export function displaySession(session: Session): void {
  console.log("");

  for (const turn of session.turns) {
    if (session.mode === "multi" || session.mode === "chat") {
      const label = turn.speakerId === "__user__" ? "You" : turn.speakerId;
      console.log(`[${label}]: ${turn.text}`);
    } else {
      if (session.turns.length > 1) {
        console.log(`--- Turn ${turn.index + 1} ---`);
      }
      console.log(turn.text);
    }

    if (session.turns.length > 1 && turn.index < session.turns.length - 1) {
      console.log("");
    }
  }

  if (session.evaluation) {
    console.log("");
    console.log(`  authenticity: ${session.evaluation.authenticity.toFixed(1)}`);
    console.log(`  coherence: ${session.evaluation.coherence.toFixed(1)}`);
    console.log(`  consistency: ${session.evaluation.consistency.toFixed(1)}`);
  }
}

/**
 * セッションパイプライン用の進捗表示を作成する。
 */
export function createSessionProgressDisplay(): (event: StepEvent) => void {
  return createProgressDisplay({
    stepNames: {
      session: "Running session",
      evaluate: "Evaluating quality",
    },
    stepIndexOffset: 6,
  });
}
