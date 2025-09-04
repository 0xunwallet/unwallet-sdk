export function logSomething(message: string = 'SDK ready'): void {
  console.log(`[unwallet-sdk] ${message}`);
}

export default { logSomething };
