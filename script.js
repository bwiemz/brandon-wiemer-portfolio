const filterButtons = document.querySelectorAll(".filter-button");
const projectCards = document.querySelectorAll(".project-card");
const languageTabs = document.querySelectorAll(".language-tab");
const codeEditor = document.querySelector("#code-editor");
const codeOutput = document.querySelector("#code-output");
const runCodeButton = document.querySelector("#run-code");
const resetCodeButton = document.querySelector("#reset-code");
const fileExtension = document.querySelector("#file-extension");
const runtimeLabel = document.querySelector("#runtime-label");
const outputTitle = document.querySelector("#output-title");
const previewFrame = document.querySelector("#preview-frame");
const outputPane = document.querySelector(".output-pane");

const codeSamples = {
  javascript: `const projects = ["NSL", "sealstack", "SiliconScript", "codeforge"];
const systemsProjects = projects.filter((name) => name.length > 6);

console.log("Brandon Wiemer portfolio lab");
console.log("Systems projects:", systemsProjects.join(", "));
console.log("Score:", systemsProjects.length * 42);`,
  python: `# Python Lite supports variables, print, if, and for range loops.
language = "Python Lite"
score = 0

for i in range(1, 5):
  score = score + i * 3

if score > 20:
  print(language + " result: " + score)
print("Loop complete")`,
  nsl: `// NSL Lite supports let, print, if, repeat, ranges, and math.
let language = "NSL";
let tensor_tiles = 12;
let compiler_passes = 4;
let throughput = tensor_tiles * compiler_passes + 8;

if throughput >= 50 {
  print("Running " + language + " preview");
  print("Estimated throughput score: " + throughput);
}

repeat i in 0..3 {
  print("compiler pass " + i);
}`,
  htmlcss: `<style>
  body {
    align-items: center;
    background: #0b100d;
    color: #eff8f3;
    display: grid;
    font-family: system-ui, sans-serif;
    min-height: 100vh;
    margin: 0;
    place-items: center;
  }

  .card {
    border: 1px solid #2dd4bf;
    border-radius: 8px;
    padding: 28px;
    width: min(420px, 88vw);
  }
</style>

<section class="card">
  <h1>Brandon Wiemer</h1>
  <p>Interactive HTML and CSS preview.</p>
</section>`
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
  if (!codeEditor) {
    return;
  }

  activeLanguage = language;
  codeEditor.value = codeSamples[language];
  codeOutput.textContent = "Press Run to execute the sample.";

  const metadata = {
    javascript: ["js", "JavaScript worker", "Console"],
    python: ["py", "Python Lite interpreter", "Console"],
    nsl: ["nsl", "NSL Lite interpreter", "Console"],
    htmlcss: ["html", "HTML/CSS preview", "Preview"]
  };

  const [extension, runtime, title] = metadata[language];
  fileExtension.textContent = extension;
  runtimeLabel.textContent = runtime;
  outputTitle.textContent = title;
  outputPane.classList.toggle("preview-mode", language === "htmlcss");

  if (language === "htmlcss") {
    previewFrame.srcdoc = codeSamples.htmlcss;
  } else {
    previewFrame.removeAttribute("srcdoc");
  }

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
  const pattern = /\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|true|false|True|False|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|[()+\-*/%<>])\s*/g;
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

function evaluateExpression(expression, scope) {
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
      const value = parseComparison();
      if (consume() !== ")") {
        throw new Error("Expected closing parenthesis.");
      }
      return value;
    }

    if (token.startsWith("\"") || token.startsWith("'")) {
      return token.slice(1, -1).replace(/\\"/g, "\"").replace(/\\'/g, "'");
    }

    if (token === "true" || token === "True") {
      return true;
    }

    if (token === "false" || token === "False") {
      return false;
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

    while (["*", "/", "%"].includes(peek())) {
      const operator = consume();
      const right = parsePrimary();
      if (operator === "*") value = Number(value) * Number(right);
      if (operator === "/") value = Number(value) / Number(right);
      if (operator === "%") value = Number(value) % Number(right);
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

  function parseComparison() {
    let value = parseAdditive();

    while (["==", "!=", "<", "<=", ">", ">="].includes(peek())) {
      const operator = consume();
      const right = parseAdditive();
      if (operator === "==") value = value === right;
      if (operator === "!=") value = value !== right;
      if (operator === "<") value = value < right;
      if (operator === "<=") value = value <= right;
      if (operator === ">") value = value > right;
      if (operator === ">=") value = value >= right;
    }

    return value;
  }

  const result = parseComparison();

  if (index < tokens.length) {
    throw new Error(`Unexpected token: ${tokens[index]}`);
  }

  return result;
}

function cleanLine(line, commentMarker) {
  const quoteAware = line.split("").reduce((state, char, index, chars) => {
    if ((char === "\"" || char === "'") && chars[index - 1] !== "\\") {
      state.quote = state.quote === char ? "" : state.quote || char;
    }
    if (!state.quote && line.slice(index, index + commentMarker.length) === commentMarker) {
      state.cut = index;
    }
    return state;
  }, { quote: "", cut: -1 });

  return (quoteAware.cut >= 0 ? line.slice(0, quoteAware.cut) : line).trimEnd();
}

function executeStatements(statements, scope, output, language) {
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index].trim();
    if (!statement) continue;

    const block = statement.match(/^(if|repeat|for)\s+(.+)\s*\{$/);
    if (block && language === "nsl") {
      const body = [];
      index += 1;
      while (index < statements.length && statements[index].trim() !== "}") {
        body.push(statements[index]);
        index += 1;
      }
      if (index >= statements.length) throw new Error("Expected closing brace.");

      if (block[1] === "if" && evaluateExpression(block[2], scope)) {
        executeStatements(body, scope, output, language);
      }

      const repeat = block[2].match(/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)\.\.(.+)$/);
      if (block[1] === "repeat" && repeat) {
        const [, variable, startExpr, endExpr] = repeat;
        const start = Number(evaluateExpression(startExpr, scope));
        const end = Number(evaluateExpression(endExpr, scope));
        for (let value = start; value < end; value += 1) {
          scope[variable] = value;
          executeStatements(body, scope, output, language);
        }
      }
      continue;
    }

    const normalized = statement.endsWith(";") ? statement.slice(0, -1).trim() : statement;
    const assignment = normalized.match(/^(?:let|mut)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignment) {
      scope[assignment[1]] = evaluateExpression(assignment[2], scope);
      continue;
    }

    const printCall = normalized.match(/^print\((.*)\)$/);
    if (printCall) {
      output.push(String(evaluateExpression(printCall[1], scope)));
      continue;
    }

    throw new Error(`Unsupported statement: ${statement}`);
  }
}

function runNslLite(code) {
  const scope = {};
  const output = [];
  const statements = code
    .split("\n")
    .map((line) => cleanLine(line, "//").trim())
    .filter(Boolean);

  executeStatements(statements, scope, output, "nsl");
  codeOutput.textContent = output.length ? output.join("\n") : "Program completed with no output.";
}

function parsePythonBlocks(lines, startIndex, indent) {
  const statements = [];
  let index = startIndex;

  while (index < lines.length) {
    const raw = lines[index];
    const currentIndent = raw.match(/^ */)[0].length;
    const text = raw.trim();

    if (!text || currentIndent < indent) break;
    if (currentIndent > indent) throw new Error(`Unexpected indentation near: ${text}`);

    if (text.endsWith(":")) {
      const header = text.slice(0, -1);
      const bodyResult = parsePythonBlocks(lines, index + 1, indent + 2);
      statements.push({ type: "block", header, body: bodyResult.statements });
      index = bodyResult.index;
      continue;
    }

    statements.push({ type: "line", text });
    index += 1;
  }

  return { statements, index };
}

function executePythonStatements(statements, scope, output) {
  statements.forEach((statement) => {
    if (statement.type === "line") {
      const assignment = statement.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (assignment) {
        scope[assignment[1]] = evaluateExpression(assignment[2], scope);
        return;
      }

      const printCall = statement.text.match(/^print\((.*)\)$/);
      if (printCall) {
        output.push(String(evaluateExpression(printCall[1], scope)));
        return;
      }

      throw new Error(`Unsupported Python Lite statement: ${statement.text}`);
    }

    const forLoop = statement.header.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\((.+?)(?:,\s*(.+?))?\)$/);
    if (forLoop) {
      const [, variable, first, second] = forLoop;
      const start = second ? Number(evaluateExpression(first, scope)) : 0;
      const end = Number(evaluateExpression(second || first, scope));
      for (let value = start; value < end; value += 1) {
        scope[variable] = value;
        executePythonStatements(statement.body, scope, output);
      }
      return;
    }

    const ifBlock = statement.header.match(/^if\s+(.+)$/);
    if (ifBlock) {
      if (evaluateExpression(ifBlock[1], scope)) {
        executePythonStatements(statement.body, scope, output);
      }
      return;
    }

    throw new Error(`Unsupported Python Lite block: ${statement.header}`);
  });
}

function runPythonLite(code) {
  const scope = {};
  const output = [];
  const lines = code
    .split("\n")
    .map((line) => cleanLine(line, "#"))
    .filter((line) => line.trim());
  const parsed = parsePythonBlocks(lines, 0, 0);

  executePythonStatements(parsed.statements, scope, output);
  codeOutput.textContent = output.length ? output.join("\n") : "Program completed with no output.";
}

function runHtmlCss(code) {
  previewFrame.srcdoc = code;
}

languageTabs.forEach((tab) => {
  tab.addEventListener("click", () => setLanguage(tab.dataset.language));
});

resetCodeButton?.addEventListener("click", () => setLanguage(activeLanguage));

runCodeButton?.addEventListener("click", () => {
  try {
    if (activeLanguage === "javascript") runJavaScript(codeEditor.value);
    if (activeLanguage === "python") runPythonLite(codeEditor.value);
    if (activeLanguage === "nsl") runNslLite(codeEditor.value);
    if (activeLanguage === "htmlcss") runHtmlCss(codeEditor.value);
  } catch (error) {
    codeOutput.textContent = `Error: ${error.message}`;
  }
});

function initSnakeGame() {
  const canvas = document.querySelector("#snake-board");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const scoreElement = document.querySelector("#snake-score");
  const bestElement = document.querySelector("#snake-best");
  const startButton = document.querySelector("#snake-start");
  const cell = 18;
  const cells = canvas.width / cell;
  let snake;
  let food;
  let direction;
  let nextDirection;
  let score;
  let best = Number(window.localStorage.getItem("portfolioSnakeBest") || 0);
  let timer;
  let running = false;

  bestElement.textContent = best;

  function resetGame() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    direction = { x: 1, y: 0 };
    nextDirection = direction;
    score = 0;
    scoreElement.textContent = score;
    placeFood();
    draw();
  }

  function placeFood() {
    do {
      food = {
        x: Math.floor(Math.random() * cells),
        y: Math.floor(Math.random() * cells)
      };
    } while (snake.some((part) => part.x === food.x && part.y === food.y));
  }

  function drawCell(x, y, color) {
    context.fillStyle = color;
    context.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
  }

  function draw() {
    context.fillStyle = "#0b100d";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(255,255,255,0.04)";
    for (let position = 0; position <= canvas.width; position += cell) {
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, canvas.height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(canvas.width, position);
      context.stroke();
    }

    drawCell(food.x, food.y, "#c7932e");
    snake.forEach((part, index) => drawCell(part.x, part.y, index === 0 ? "#2dd4bf" : "#0f766e"));
  }

  function endGame() {
    running = false;
    window.clearInterval(timer);
    startButton.textContent = "Restart game";
    if (score > best) {
      best = score;
      window.localStorage.setItem("portfolioSnakeBest", String(best));
      bestElement.textContent = best;
    }
  }

  function tick() {
    direction = nextDirection;
    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y
    };

    const hitWall = head.x < 0 || head.y < 0 || head.x >= cells || head.y >= cells;
    const hitSelf = snake.some((part) => part.x === head.x && part.y === head.y);
    if (hitWall || hitSelf) {
      endGame();
      draw();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1;
      scoreElement.textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
    draw();
  }

  function setDirection(x, y) {
    if (direction.x + x === 0 && direction.y + y === 0) return;
    nextDirection = { x, y };
  }

  startButton.addEventListener("click", () => {
    resetGame();
    running = true;
    startButton.textContent = "Running";
    window.clearInterval(timer);
    timer = window.setInterval(tick, 120);
  });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      const directionName = button.dataset.direction;
      if (directionName === "up") setDirection(0, -1);
      if (directionName === "down") setDirection(0, 1);
      if (directionName === "left") setDirection(-1, 0);
      if (directionName === "right") setDirection(1, 0);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) return;
    if (running) event.preventDefault();
    if (event.key === "ArrowUp" || event.key === "w") setDirection(0, -1);
    if (event.key === "ArrowDown" || event.key === "s") setDirection(0, 1);
    if (event.key === "ArrowLeft" || event.key === "a") setDirection(-1, 0);
    if (event.key === "ArrowRight" || event.key === "d") setDirection(1, 0);
  });

  resetGame();
}

setLanguage(activeLanguage);
initSnakeGame();
