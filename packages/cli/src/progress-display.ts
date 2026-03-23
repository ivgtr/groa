import { clearLine, cursorTo } from "node:readline";
import type { StepEvent, StepTokenUsage } from "@groa/pipeline";

export interface ProgressDisplayOptions {
  stepNames: Record<string, string>;
  stepIndexOffset?: number;
  pipelineCompleteMessage?: string;
}

/** トークン数をカンマ区切りでフォーマットする */
function formatTokens(usage: StepTokenUsage): string {
  return `[in: ${usage.inputTokens.toLocaleString()} / out: ${usage.outputTokens.toLocaleString()}]`;
}

export function createProgressDisplay(
  options: ProgressDisplayOptions,
): (event: StepEvent) => void {
  const { stepNames, stepIndexOffset = 0, pipelineCompleteMessage } = options;
  const isTTY = process.stdout.isTTY === true;
  // step-start の行から改行等で離脱したかを追跡
  let lineBroken = false;

  return (event: StepEvent) => {
    switch (event.type) {
      case "step-start":
        process.stdout.write(
          `[Step ${event.stepIndex + stepIndexOffset}] ${stepNames[event.stepName] ?? event.stepName}...`,
        );
        lineBroken = false;
        break;

      case "step-warning":
        if (!lineBroken) {
          console.log();
          lineBroken = true;
        }
        console.warn(`  ⚠ ${event.message}`);
        break;

      case "step-progress":
        if (isTTY) {
          if (lineBroken) {
            clearLine(process.stdout, 0);
            cursorTo(process.stdout, 0);
          } else {
            console.log();
            lineBroken = true;
          }
          process.stdout.write(`  (${event.detail})`);
        }
        break;

      case "step-complete": {
        if (lineBroken && isTTY) {
          clearLine(process.stdout, 0);
          cursorTo(process.stdout, 0);
        }
        // コスト > 0: コスト表示、コスト 0 + トークンあり: トークン表示
        const stepDisplay =
          event.costUsd > 0
            ? `[$${event.costUsd.toFixed(2)}]`
            : event.tokenUsage &&
                (event.tokenUsage.inputTokens > 0 || event.tokenUsage.outputTokens > 0)
              ? formatTokens(event.tokenUsage)
              : `[$${event.costUsd.toFixed(2)}]`;

        if (lineBroken) {
          console.log(`  ${stepDisplay}`);
        } else {
          console.log(` ${stepDisplay}`);
        }
        lineBroken = false;
        break;
      }

      case "pipeline-complete": {
        if (pipelineCompleteMessage) {
          const tu = event.totalTokenUsage;
          if (event.totalCostUsd > 0) {
            console.log(
              `${pipelineCompleteMessage} Total cost: $${event.totalCostUsd.toFixed(2)}`,
            );
          } else if (tu && (tu.inputTokens > 0 || tu.outputTokens > 0)) {
            const total = tu.inputTokens + tu.outputTokens;
            console.log(
              `${pipelineCompleteMessage} Total: ${total.toLocaleString()} tokens (in: ${tu.inputTokens.toLocaleString()} / out: ${tu.outputTokens.toLocaleString()})`,
            );
          } else {
            console.log(
              `${pipelineCompleteMessage} Total cost: $${event.totalCostUsd.toFixed(2)}`,
            );
          }
        }
        break;
      }

      case "cost-limit-exceeded":
        console.error(
          `✗ コスト上限に達しました: $${event.currentCostUsd.toFixed(2)} / $${event.limitUsd.toFixed(2)}`,
        );
        break;
    }
  };
}
