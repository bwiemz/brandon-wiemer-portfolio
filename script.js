const filterButtons = document.querySelectorAll(".filter-button");
const projectCards = document.querySelectorAll(".project-card");
const languageTabs = document.querySelectorAll(".language-tab");
const codeEditor = document.querySelector("#code-editor");
const codeOutput = document.querySelector("#code-output");
const runCodeButton = document.querySelector("#run-code");
const resetCodeButton = document.querySelector("#reset-code");
const fileExtension = document.querySelector("#file-extension");
const runtimeLabel = document.querySelector("#runtime-label");

const codeSamples = {
  javascript: `const projects = ["NSL", "sealstack", "SiliconScript", "codeforge"];

const systemsProjects = projects.filter((name) => name.length > 6);

console.log("Brandon Wiemer portfolio lab");
console.log("Systems projects:", systemsProjects.join(", "));
console.log("Score:", systemsProjects.length * 42);`,
  nsl: `// NSL Lite supports let, print, strings, and arithmetic.
let language = "NSL";
let tensor_tiles = 12;
let compiler_passes = 4;
let throughput = tensor_tiles * compiler_passes + 8;

print("Running " + language + " preview");
print("Estimated throughput score: " + throughput);`
};

let activeLanguage = "javascript";

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedFilter = button.dataset.filter;

    filterButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    projectCards.forEach((card) => {
      const shouldShow = selectedFilter === "all" || card.dataset.language === selectedFilter;
      card.classList.toggle("is-hidden", !shouldShow);
    });
  });
});

function setLanguage(language) {
  activeLanguage = language;
  codeEditor.value = codeSamples[language];
  codeOutput.textContent = "Press Run to execute the sample.";
  fileExtension.textContent = language === "javascript" ? "js" : "nsl";
  runtimeLabel.textContent = language === "javascript" ? "JavaScript worker" : "NSL Lite interpreter";

  languageTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.language === language);
  });
}

function runJavaScript(code) {
  codeOutput.textContent = "Running...";

  const workerSource = `
    const formatValue = (value) => {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    };

    console.log = (...args) => {
      postMessage({ type: "log", value: args.map(formatValue).join(" ") });
    };

    console.error = (...args) => {
      postMessage({ type: "error", value: args.map(formatValue).join(" ") });
    };

    onmessage = (event) => {
      try {
        const result = new Function(event.data)();
        if (result !== undefined) {
          console.log(result);
        }
        postMessage({ type: "done" });
      } catch (error) {
        postMessage({ type: "error", value: error.message });
      }
    };
  `;

  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const output = [];
  const timeout = window.setTimeout(() => {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    codeOutput.textContent = "Execution stopped after 2 seconds.";
  }, 2000);

  worker.onmessage = (event) => {
    if (event.data.type === "done") {
      window.clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      codeOutput.textContent = output.length ? output.join("\n") : "Program completed with no output.";
      return;
    }

    output.push(event.data.type === "error" ? `Error: ${event.data.value}` : event.data.value);
  };

  worker.postMessage(code);
}

function tokenizeExpression(expression) {
  const tokens = [];
  const pattern = /\s*("(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/])\s*/g;
  let match;
  let consumed = 0;

  while ((match = pattern.exec(expression)) !== null) {
    tokens.push(match[1]);
    consumed = pattern.lastIndex;
  }

  if (consumed !== expression.length) {
    throw new Error(`Unexpected token near: ${expression.slice(consumed)}`);
  }

  return tokens;
}

function evaluateNslExpression(expression, scope) {
  const tokens = tokenizeExpression(expression);
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => tokens[index++];

  function parsePrimary() {
    const token = consume();

    if (token === undefined) {
      throw new Error("Expected a value.");
    }

    if (token === "(") {
      const value = parseAdditive();
      if (consume() !== ")") {
        throw new Error("Expected closing parenthesis.");
      }
      return value;
    }

    if (token.startsWith("\"")) {
      return token.slice(1, -1).replace(/\\"/g, "\"");
    }

    if (/^\d/.test(token)) {
      return Number(token);
    }

    if (Object.prototype.hasOwnProperty.call(scope, token)) {
      return scope[token];
    }

    throw new Error(`Unknown identifier: ${token}`);
  }

  function parseMultiplicative() {
    let value = parsePrimary();

    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      const right = parsePrimary();
      value = operator === "*" ? Number(value) * Number(right) : Number(value) / Number(right);
    }

    return value;
  }

  function parseAdditive() {
    let value = parseMultiplicative();

    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const right = parseMultiplicative();
      if (operator === "+") {
        value = typeof value === "string" || typeof right === "string" ? `${value}${right}` : Number(value) + Number(right);
      } else {
        value = Number(value) - Number(right);
      }
    }

    return value;
  }

  const result = parseAdditive();

  if (index < tokens.length) {
    throw new Error(`Unexpected token: ${tokens[index]}`);
  }

  return result;
}

function runNslLite(code) {
  const scope = {};
  const output = [];
  const statements = code
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);

  statements.forEach((statement, lineIndex) => {
    const lineNumber = lineIndex + 1;

    if (statement.endsWith(";")) {
      statement = statement.slice(0, -1).trim();
    }

    const assignment = statement.match(/^let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignment) {
      scope[assignment[1]] = evaluateNslExpression(assignment[2], scope);
      return;
    }

    const printCall = statement.match(/^print\((.*)\)$/);
    if (printCall) {
      output.push(String(evaluateNslExpression(printCall[1], scope)));
      return;
    }

    throw new Error(`Line ${lineNumber}: expected let assignment or print call.`);
  });

  codeOutput.textContent = output.length ? output.join("\n") : "Program completed with no output.";
}

languageTabs.forEach((tab) => {
  tab.addEventListener("click", () => setLanguage(tab.dataset.language));
});

resetCodeButton.addEventListener("click", () => setLanguage(activeLanguage));

runCodeButton.addEventListener("click", () => {
  try {
    if (activeLanguage === "javascript") {
      runJavaScript(codeEditor.value);
    } else {
      runNslLite(codeEditor.value);
    }
  } catch (error) {
    codeOutput.textContent = `Error: ${error.message}`;
  }
});

setLanguage(activeLanguage);
