// File: server.js
import express from "express";
import { CoPilot } from "./CoPilot.js";
import { Terminal } from "./Terminal.js";
import fs from "fs/promises";
import path from "path";

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", "./views");

const copilot = new CoPilot();
const terminal = new Terminal();
const sandboxDir = path.join(process.cwd(), "sandbox");

async function ensureSandbox() {
  try {
    await fs.mkdir(sandboxDir, { recursive: true });
  } catch (error) {
    console.error("Error ensuring sandbox directory:", error);
  }
}
async function getDirectoryStructure(dir) {
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    const structure = {};
    for (const file of files) {
      // Skip the "node_modules" directory
      if (file.name === "node_modules") {
        continue;
      }
      if (file.isDirectory()) {
        structure[file.name] = await getDirectoryStructure(
          path.join(dir, file.name)
        );
      } else {
        structure[file.name] = {};
      }
    }
    return structure;
  } catch (error) {
    return {};
  }
}

app.get("/", async (req, res) => {
  await ensureSandbox();
  const sandboxStructure = await getDirectoryStructure(sandboxDir);
  res.render("index", {
    query: "",
    history: [],
    suggestedCommand: null,
    sandboxStructure,
    currentDir: sandboxDir,
  });
});

app.post("/copilot", async (req, res) => {
  try {
    const { query, history = [], currentDir = sandboxDir } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const sandboxStructure = await getDirectoryStructure(sandboxDir);
    const startingDir = path.dirname(sandboxDir);
    console.log("Current dir:", currentDir);
    console.log("Starting dir:", startingDir);
    const copilotResponse = await copilot.generateCopilotResponse(query, {
      history,
      sandboxStructure,
      currentDir,
      startingDir,
    });
    const fileTreeAwareness = await copilot.generateFileTreeAwareness(query, {
      history,
      sandboxStructure,
      currentDir,
    });
    const newHistory = [
      ...history,
      {
        type: "copilot",
        data: copilotResponse,
        timestamp: new Date().toISOString(),
      },
    ];
    copilotResponse.file_tree_awareness = fileTreeAwareness;
    const codeSnippet = await copilot.generateCodeSnippet(
      query,
      copilotResponse
    );
    newHistory.push({
      type: "code_snippet",
      data: codeSnippet,
      timestamp: new Date().toISOString(),
    });
    // Always review the planning step
    const review = await copilot.reviewTerminalOutput(
      "Review the initial app planning. This has not been executed yet. If you approve, pass on the terminal commands suggested. If not, modify or improve. Consider the current project structure. We are building our project in the sandbox folder.",
      {
        command: "Planning phase",
        output: JSON.stringify(copilotResponse),
        error: "",
        history: newHistory,
        sandboxStructure,
        currentDir,
        requires_manual_run: false,
      }
    );

    newHistory.push({
      type: "review",
      data: review,
      timestamp: new Date().toISOString(),
    });

    let suggestedCommand = review.next_terminal_command;

    res.json({
      history: newHistory,
      suggestedCommand,
      sandboxStructure,
      currentDir,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/execute-and-review", async (req, res) => {
  try {
    let { command, history = [], currentDir = sandboxDir } = req.body;
    if (!command) {
      return res.status(400).json({ error: "Command is required" });
    }

    const fullCommand = `cd ${currentDir} && ${command}`;
    const executionResult = await terminal.executeCommand(fullCommand);
    const sandboxStructure = await getDirectoryStructure(sandboxDir);
    const startingDir = path.dirname(sandboxDir);
    console.log("Current dir:", currentDir);
    console.log("Starting dir:", startingDir);
    //make sure history is not too long

    if (history.length > 10) {
      history = history.slice(history.length - 10);
    }

    const review = await copilot.reviewTerminalOutput(
      "Review this command output and suggest the next step",
      {
        command,
        output: executionResult.stdout,
        error: executionResult.stderr,
        history,
        sandboxStructure,
        currentDir: startingDir,
        requires_manual_run: executionResult.requires_manual_run,
      }
    );

    const newHistory = [
      ...history,
      {
        type: "execution",
        data: {
          command,
          stdout: executionResult.stdout,
          stderr: executionResult.stderr,
          requires_manual_run: executionResult.requires_manual_run,
        },
        timestamp: new Date().toISOString(),
      },
      {
        type: "review",
        data: review,
        timestamp: new Date().toISOString(),
      },
    ];

    let suggestedCommand = review.next_terminal_command;
    if (review.requires_manual_edit || executionResult.requires_manual_run) {
      suggestedCommand = null;
    } else if (suggestedCommand && suggestedCommand.includes("nano")) {
      const fileName = suggestedCommand.split(" ")[1] || "file";
      suggestedCommand = `echo "Initial content" > ${fileName}`;
    }

    res.json({
      history: newHistory,
      suggestedCommand,
      sandboxStructure,
      currentDir: startingDir,
    });
  } catch (error) {
    console.error("Error executing command:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/review-file", async (req, res) => {
  try {
    const { filePath, history = [], currentDir = sandboxDir } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }

    const fullPath = path.join(currentDir, filePath);
    const fileContent = await fs.readFile(fullPath, "utf-8").catch(() => "");
    const sandboxStructure = await getDirectoryStructure(sandboxDir);

    const fileReview = await copilot.reviewFileContent(
      `Review the content of ${filePath}`,
      {
        filePath,
        fileContent,
        history,
        sandboxStructure,
        currentDir,
      }
    );

    const newHistory = [
      ...history,
      {
        type: "file_review",
        data: fileReview,
        timestamp: new Date().toISOString(),
      },
    ];

    // Review the file review output
    const review = await copilot.reviewTerminalOutput(
      "Review the file review and suggest the next step",
      {
        command: `Reviewed ${filePath}`,
        output: JSON.stringify(fileReview),
        error: "",
        history: newHistory,
        sandboxStructure,
        currentDir,
        requires_manual_run: false,
      }
    );

    newHistory.push({
      type: "review",
      data: review,
      timestamp: new Date().toISOString(),
    });

    res.json({
      history: newHistory,
      suggestedCommand: review.next_terminal_command,
      sandboxStructure,
      currentDir,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/enhance-file", async (req, res) => {
  try {
    const { filePath, history = [], currentDir = sandboxDir } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }

    const fullPath = path.join(currentDir, filePath);
    const fileContent = await fs.readFile(fullPath, "utf-8").catch(() => "");
    const sandboxStructure = await getDirectoryStructure(sandboxDir);

    const fileEnhancement = await copilot.enhanceFileContent(
      `Enhance the content of ${filePath}`,
      {
        filePath,
        fileContent,
        history,
        sandboxStructure,
        currentDir,
      }
    );

    await fs.writeFile(fullPath, fileEnhancement.code);
    const updatedSandboxStructure = await getDirectoryStructure(sandboxDir);

    const newHistory = [
      ...history,
      {
        type: "file_enhance",
        data: fileEnhancement,
        timestamp: new Date().toISOString(),
      },
    ];

    // Review the enhancement output
    const review = await copilot.reviewTerminalOutput(
      "Review the file enhancement and suggest the next step",
      {
        command: `Enhanced ${filePath}`,
        output: JSON.stringify(fileEnhancement),
        error: "",
        history: newHistory,
        sandboxStructure: updatedSandboxStructure,
        currentDir,
        requires_manual_run: false,
      }
    );

    newHistory.push({
      type: "review",
      data: review,
      timestamp: new Date().toISOString(),
    });

    res.json({
      history: newHistory,
      suggestedCommand: review.next_terminal_command,
      sandboxStructure: updatedSandboxStructure,
      currentDir,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

export { app };
