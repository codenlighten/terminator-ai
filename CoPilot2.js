// File: CoPilot.js
import { StructuredResponseGenerator } from "./StructuredResponseGenerator.js";

const COPILOT_SCHEMA = {
  type: "object",
  properties: {
    thoughts: {
      type: "array",
      description: "Thoughts and considerations for building the app",
      items: { type: "string" },
    },
    steps: {
      type: "array",
      description: "Step-by-step plan to build the app",
      items: { type: "string" },
    },
    file_tree: {
      type: "object",
      description: "Proposed file structure for the app",
    },
    read_me: {
      type: "string",
      description: "Detailed overview of the app",
    },
    next_terminal_command: {
      type: "string",
      description:
        "The immediate next terminal command to execute (non-interactive). Avoid nano/vim. Consider the current directory and folder structure. Always specify the workspace directory and project sandbox directory in your command to keep things in our correct folders and project structure.",
    },
  },
  required: ["thoughts", "steps", "file_tree", "next_terminal_command"],
  additionalProperties: false,
};

const FILE_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    file_path: {
      type: "string",
      description: "The path to the file being reviewed",
    },
    file_content: {
      type: "string",
      description: "The content of the file being reviewed",
    },
    review: {
      type: "string",
      description: "Review of the file content",
    },
    next_steps: {
      type: "array",
      description: "Suggested next steps based on the file content",
      items: { type: "string" },
    },
  },
  required: ["file_path", "file_content", "review", "next_steps"],
  additionalProperties: false,
};

const FILE_ENHANCE_SCHEMA = {
  type: "object",
  properties: {
    file_path: {
      type: "string",
      description: "The path to the file being enhanced",
    },
    enhancements: {
      type: "array",
      description: "Enhancements to be made to the file",
      items: { type: "string" },
    },
    code: {
      type: "string",
      description: "The code content of the file after enhancements",
    },
    next_steps: {
      type: "array",
      description: "Suggested next steps after enhancing the file",
      items: { type: "string" },
    },
  },
  required: ["file_path", "enhancements", "code", "next_steps"],
  additionalProperties: false,
};

const TERMINAL_OUTPUT_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    thoughts: {
      type: "array",
      description:
        "Analysis of the last step's outcome (command execution, planning, file review, or enhancement). Consider the workspace directory, project sandbox directory, and folder structure. You have not executed your next command yet.",
      items: { type: "string" },
    },
    success: {
      type: "boolean",
      description: "Whether the step succeeded",
    },
    goal_of_command: {
      type: "string",
      description: "What the step was intended to achieve",
    },
    next_terminal_command: {
      type: "string",
      description:
        "The next non-interactive command to execute (avoid nano/vim). If the last step failed, provide a fix or alternative. Consider the workspace directory, project sandbox directory, and folder structure. Be specific about the directories you are working in, relative to everything else.",
    },
    requires_manual_edit: {
      type: "boolean",
      description: "Whether manual editing is needed instead of automation",
      default: false,
    },
    manual_edit_instructions: {
      type: "string",
      description: "Instructions for manual editing if required",
    },
    requires_manual_run: {
      type: "boolean",
      description:
        "Whether the command needs to be run manually in a separate terminal",
      default: false,
    },
    manual_run_instructions: {
      type: "string",
      description: "Instructions for running the command manually",
    },
  },
  required: ["thoughts", "success", "goal_of_command", "next_terminal_command"],
  additionalProperties: false,
};

const CODE_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description:
        "The complete generated code snippet for the terminal command",
    },

    next_steps: {
      type: "array",
      description: "Suggested next steps after generating the code",
      items: { type: "string" },
    },
  },
  required: ["code", "next_steps"],
  additionalProperties: false,
};
//we will use this to give awareness where our copilot is in the file tree
const FILE_TREE_AWARENESS_SCHEMA = {
  type: "object",
  properties: {
    current_dir: {
      type: "string",
      description: "The current directory in the file tree",
    },
    file_tree: {
      type: "object",
      description: "The file tree structure",
    },
    cd_command: {
      type: "string",
      description: "The command to change the current directory",
    },
    ls_command: {
      type: "string",
      description: "The command to list the files in the current directory",
    },
  },
  required: ["current_dir", "file_tree"],
  additionalProperties: false,
};

class CoPilot extends StructuredResponseGenerator {
  constructor(apiKey) {
    super(apiKey);
  }

  async generateCopilotResponse(query, context = {}) {
    const { sandboxStructure = {}, currentDir = "" } = context;
    return this.generateStructuredResponse(
      `Plan and structure an app based on this request: ${query}. Current workspace folder where the sandbox folder lives that we will work in: ${currentDir}. Our project folder structure: ${JSON.stringify(
        sandboxStructure
      )}. Build this current project in the sandbox folder. Provide non-interactive terminal commands (avoid nano/vim).`,
      COPILOT_SCHEMA,
      context
    );
  }
  async generateFileTreeAwareness(query, context = {}) {
    const { sandboxStructure = {}, currentDir = "" } = context;
    return this.generateStructuredResponse(
      `Provide awareness of the current directory in the file tree and the file tree structure. Current directory: ${currentDir}. Current file tree structure: ${JSON.stringify(
        sandboxStructure
      )}.`,
      FILE_TREE_AWARENESS_SCHEMA,
      context
    );
  }

  async generateCodeSnippet(query, context = {}) {
    const { code, next_steps = [] } = context;
    return this.generateStructuredResponse(
      `Generate a code snippet for the terminal command: ${query}.`,
      CODE_GENERATION_SCHEMA,
      context
    );
  }

  async reviewTerminalOutput(query, context = {}) {
    const {
      sandboxStructure = {},
      currentDir = "",
      requires_manual_run = false,
    } = context;
    return this.generateStructuredResponse(
      `Review this step's outcome and suggest the next non-interactive step (avoid nano/vim) or flag for manual action. Current directory you are in: ${currentDir}. Our project sandbox folder structure: ${JSON.stringify(
        sandboxStructure
      )}. Step requires manual run: ${requires_manual_run}: ${query}`,
      TERMINAL_OUTPUT_REVIEW_SCHEMA,
      context
    );
  }

  async reviewFileContent(query, context = {}) {
    const {
      filePath,
      fileContent,
      sandboxStructure = {},
      currentDir = "",
    } = context;
    return this.generateStructuredResponse(
      `Review the content of this file: ${filePath}. Current content: ${fileContent}. Current directory: ${currentDir}. Current sandbox folder structure: ${JSON.stringify(
        sandboxStructure
      )}.`,
      FILE_REVIEW_SCHEMA,
      context
    );
  }

  async enhanceFileContent(query, context = {}) {
    const {
      filePath,
      fileContent,
      sandboxStructure = {},
      currentDir = "",
    } = context;
    return this.generateStructuredResponse(
      `Enhance the content of this file: ${filePath}. Current content: ${fileContent}. Current directory: ${currentDir}. Current sandbox folder structure: ${JSON.stringify(
        sandboxStructure
      )}. Provide the updated code and next steps.`,
      FILE_ENHANCE_SCHEMA,
      context
    );
  }
}

export { CoPilot };
