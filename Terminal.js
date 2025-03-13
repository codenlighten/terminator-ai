// File: Terminal.js
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class Terminal {
  /**
   * Executes a terminal command
   * @param {string} command - The command to execute
   * @returns {Promise<{ stdout: string, stderr: string, requires_manual_run?: boolean }>} - Command output
   */
  async executeCommand(command) {
    if (!command || typeof command !== "string") {
      throw new Error("Valid command string is required");
    }

    // Detect continuous/dev server commands
    const isContinuous = /(npm run dev|npm start|node .*\.js)/i.test(command);
    if (isContinuous) {
      return {
        stdout: "This is a development server command that runs continuously.",
        stderr: "",
        requires_manual_run: true,
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024,
      }); // Increase buffer for npx
      return { stdout, stderr, requires_manual_run: false };
    } catch (error) {
      return {
        stdout: "",
        stderr: error.message || "Command execution failed",
        requires_manual_run: false,
      };
    }
  }

  /**
   * Reads the stdout from a command execution
   * @param {string} command - The command to execute and read stdout from
   * @returns {Promise<string>} - The stdout content
   */
  async readStdout(command) {
    const { stdout } = await this.executeCommand(command);
    return stdout;
  }
}
