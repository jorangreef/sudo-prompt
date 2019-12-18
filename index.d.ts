export function exec(cmd: string, options: { name?: string, icns?: string, env?: { [key: string]: string } }, callback: (error: string, stdout: string, stderr: string) => void): void;
