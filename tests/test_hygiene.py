"""Structure checks that keep dead code and config drift from coming back (F4/Q3).

Based on the draft in Baha's 2026-10-18 review (section 6.4(e)). Every allow-list entry below
says why it is there; remove an entry once its reason no longer holds.
"""

import importlib
import pkgutil
import re
import tomllib
from pathlib import Path

import src
from src.agent.config import Settings

ROOT = Path(__file__).resolve().parents[1]
FILES = {path: path.read_text("utf-8") for path in (ROOT / "src").rglob("*.py")}
SRC = "\n".join(FILES.values())
SRC_NO_CONFIG = "\n".join(
    text for path, text in FILES.items() if path != ROOT / "src" / "agent" / "config.py"
)
CODE = SRC + "\n" + "\n".join(path.read_text("utf-8") for path in (ROOT / "tests").rglob("*.py"))

# Distribution name -> import name, where they differ.
IMPORT_NAMES = {"pillow": "PIL", "python_docx": "docx"}
# Declared but never imported by our code, on purpose.
NOT_IMPORTED = {
    "python_multipart": "FastAPI needs it to parse UploadFile/Form bodies; FastAPI imports it.",
    "mineru": "Provides the mineru-kit command that parsers.py runs as a subprocess.",
    "sentence_transformers": "Backend that langchain_huggingface loads for local embeddings.",
    "ruff": "Dev tool run from the command line.",
    "langchain": "Not imported directly (langchain_core comes with langgraph/langchain-openai); "
    "kept for now, review separately before removing.",
}
# Files allowed above the size budget. main.py is planned to be split (Baha's report, two-week plan).
SIZE_BUDGET = 800
OVERSIZE_ALLOWED = {"src/main.py"}


def test_every_module_imports():
    for module in pkgutil.walk_packages(src.__path__, "src."):
        importlib.import_module(module.name)


def test_every_setting_is_used():
    unused = [name for name in Settings.model_fields if not re.search(rf"\b{name}\b", SRC_NO_CONFIG)]
    assert not unused, f"Settings nothing reads; remove them or wire them up: {unused}"


def test_env_example_keys_exist():
    known = set()
    for name, field in Settings.model_fields.items():
        known.add(name.upper())
        known.update(getattr(field.validation_alias, "choices", []))
    keys = re.findall(r"^#?\s*([A-Z][A-Z0-9_]+)=", (ROOT / ".env.example").read_text("utf-8"), re.MULTILINE)
    stale = sorted({key for key in keys if key not in known and f'"{key}"' not in SRC})
    assert not stale, f".env.example lists variables nothing reads: {stale}"


def test_declared_dependencies_are_imported():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text("utf-8"))["project"]
    declared = project["dependencies"] + [
        dep for deps in project["optional-dependencies"].values() for dep in deps
    ]
    names = {re.split(r"[<>=!~\[ ;]", dep)[0].lower().replace("-", "_") for dep in declared}
    unused = sorted(
        name
        for name in names - NOT_IMPORTED.keys()
        if not re.search(rf"^\s*(?:from|import)\s+{IMPORT_NAMES.get(name, name)}\b", CODE, re.MULTILINE)
    )
    assert not unused, f"Declared dependencies that nothing imports: {unused}"
    assert not NOT_IMPORTED.keys() - names, "Allow-list names a dependency that is no longer declared"


def test_file_size_budget():
    big = {
        path.relative_to(ROOT).as_posix()
        for path, text in FILES.items()
        if len(text.splitlines()) > SIZE_BUDGET
    }
    assert big <= OVERSIZE_ALLOWED, f"Files over {SIZE_BUDGET} lines: {sorted(big - OVERSIZE_ALLOWED)}"
