type SecretPromptTarget = {
  question(prompt: string, options?: { hideEchoBack?: boolean }): Promise<string>;
};

export async function promptSecret(target: SecretPromptTarget, prompt: string): Promise<string> {
  return target.question(prompt, { hideEchoBack: true });
}
