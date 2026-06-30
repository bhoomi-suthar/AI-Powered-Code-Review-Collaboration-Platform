import json
import ast
import re
from app.config import settings


def analyze_code(code: str, file_type: str) -> dict:
    if settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip():
        try:
            result = analyze_with_groq(code, file_type)
            print("Response came from GROQ")
            return result
        except Exception as e:
            print(f"Groq failed: {e}, falling back to rules")
            return analyze_with_rules(code, file_type)
    else:
        return analyze_with_rules(code, file_type)


def analyze_with_groq(code: str, file_type: str) -> dict:
    from groq import Groq
    import re as re_module

    client = Groq(api_key=settings.GROQ_API_KEY)

    prompt = f"""You are an expert senior software engineer performing a thorough code review.

Analyze the following {file_type} code and return JSON with this exact structure:

{{
  "summary": "overall code quality summary",
  "score": 75,
  "issues": [
    {{
      "type": "bad_practice",
      "line": 10,
      "message": "issue description"
    }}
  ],
  "suggestions": [
    {{
      "type": "optimization",
      "message": "suggestion description"
    }}
  ],
  "documentation": "Generate detailed Google-style docstrings for all functions including Purpose, Args, Returns, Raises and Example"
}}

Detect complexity, security issues, performance problems, bad practices, missing error handling, poor naming.

IMPORTANT RULES:
- Return ONLY the JSON object
- No markdown
- No code fences
- No text before or after JSON
- Use only double quotes
- No trailing commas
- Escape any special characters in strings

Code ({file_type}):
{code}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4000,
        temperature=0.1
    )

    raw = response.choices[0].message.content.strip()

    # Remove markdown if present
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    # Find JSON object
    start = raw.find("{")
    end   = raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Try fixing common issues
        raw = re_module.sub(r'[\x00-\x1f\x7f]', ' ', raw)
        result = json.loads(raw)

    result["lines_analyzed"] = len(code.split("\n"))
    return result


def analyze_with_rules(code: str, file_type: str) -> dict:
    issues = []
    suggestions = []
    score = 100
    lines = code.split("\n")
    total_lines = len(lines)

    for i, line in enumerate(lines, 1):
        if len(line) > 100:
            issues.append({"type": "code_smell", "line": i, "message": f"Line {i} is too long ({len(line)} chars). Keep under 100."})
            score -= 2

    for i, line in enumerate(lines, 1):
        if "TODO" in line or "FIXME" in line:
            issues.append({"type": "bad_practice", "line": i, "message": f"Line {i} has unresolved TODO/FIXME comment."})
            score -= 3

    if file_type == "py":
        for i, line in enumerate(lines, 1):
            if re.search(r'\bprint\s*\(', line):
                issues.append({"type": "bad_practice", "line": i, "message": f"Line {i} uses print(). Use logging instead."})
                score -= 2

    if file_type in ["js", "ts"]:
        for i, line in enumerate(lines, 1):
            if "console.log" in line:
                issues.append({"type": "bad_practice", "line": i, "message": f"Line {i} has console.log. Remove before production."})
                score -= 2

    seen = {}
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if len(stripped) > 10:
            if stripped in seen:
                issues.append({"type": "duplication", "line": i, "message": f"Line {i} duplicated from line {seen[stripped]}."})
                score -= 3
            else:
                seen[stripped] = i

    if file_type == "py":
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    func_lines = node.end_lineno - node.lineno
                    if func_lines > 30:
                        issues.append({"type": "complexity", "line": node.lineno, "message": f"Function '{node.name}' is too long ({func_lines} lines)."})
                        score -= 5
                    if not (node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant)):
                        issues.append({"type": "bad_practice", "line": node.lineno, "message": f"Function '{node.name}' missing docstring."})
                        score -= 2
        except:
            pass

    if total_lines > 200:
        suggestions.append({"type": "refactor", "message": "File is too long. Split into smaller modules."})
    if "var " in code and file_type in ["js", "ts"]:
        suggestions.append({"type": "optimization", "message": "Replace var with const or let."})
    if "except:" in code:
        suggestions.append({"type": "refactor", "message": "Avoid bare except. Catch specific exceptions."})
    if file_type == "py" and "async def" not in code:
        suggestions.append({"type": "async", "message": "Consider using async functions for better performance."})

    documentation = f"# Auto-Generated Documentation\n# File type: {file_type}\n# Total lines: {total_lines}\n"
    if file_type == "py":
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    args = [a.arg for a in node.args.args]
                    documentation += f'\ndef {node.name}({", ".join(args)}):\n    """\n    Function: {node.name}\n    Args: {", ".join(args) or "none"}\n    """\n'
        except:
            pass

    return {
        "summary": f"Analyzed {total_lines} lines of {file_type} code. Found {len(issues)} issues.",
        "score": max(score, 0),
        "issues": issues,
        "suggestions": suggestions,
        "documentation": documentation,
        "lines_analyzed": total_lines
    }

