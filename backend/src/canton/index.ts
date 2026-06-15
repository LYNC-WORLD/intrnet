import { SandboxCantonAdapter } from "./sandboxAdapter";
import { ValidatorCantonAdapter } from "./validatorAdapter";

export function getCantonAdapter() {
  const mode = process.env.CANTON_MODE ?? "sandbox";
  if (mode === "validator") return new ValidatorCantonAdapter();
  return new SandboxCantonAdapter();
}
